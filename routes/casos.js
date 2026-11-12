const express = require("express");
const mysql = require("mysql2/promise");
const dns = require("node:dns/promises");
const net = require("node:net");
const { createFreeExecutionLimit } = require("../services/execution-limit");

const router = express.Router();
const pool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
const LOG_URL = process.env.LOG_SERVICE_URL || "http://log-service:3002";
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;
const limitarExecucoesFree = createFreeExecutionLimit(pool);

async function autenticar(req, res, next) {
  const authorization = req.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token não informado." });
  }
  try {
    const response = await fetch(`${AUTH_URL}/authorize`, {
      headers: { Authorization: authorization, "X-Internal-Secret": INTERNAL_SECRET },
      signal: AbortSignal.timeout(5000)
    });
    const data = await response.json();
    if (response.status === 401) return res.status(401).json({ erro: "Token inválido ou expirado." });
    if (!response.ok || !data.autenticado) return res.status(503).json({ erro: "Não foi possível validar a autenticação." });
    req.usuario = data.usuario;
    req.permissoes = data.permissoes || [];
    next();
  } catch (error) {
    console.error("Falha na autenticação de casos:", error.message);
    res.status(503).json({ erro: "Serviço de autenticação indisponível." });
  }
}

function exigir(permissao) {
  return (req, res, next) => req.permissoes.includes(permissao)
    ? next()
    : res.status(403).json({ erro: "Você não tem permissão para esta operação." });
}

async function projetoDoUsuario(projetoId, usuarioId) {
  const [rows] = await pool.execute(
    "SELECT id, nome, url_base FROM projetos WHERE id = ? AND usuario_id = ?",
    [projetoId, usuarioId]
  );
  return rows[0] || null;
}

async function auditar(req, acao, detalhes = {}) {
  try {
    await fetch(`${LOG_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
      body: JSON.stringify({ usuario_id: req.usuario.id, acao, ip: req.ip, detalhes }),
      signal: AbortSignal.timeout(2000)
    });
  } catch (error) {
    console.error("Falha na auditoria:", error.message);
  }
}

function validarCaso(body) {
  const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
  const metodo = String(body.metodo || "GET").toUpperCase();
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const permitidos = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  if (!titulo || titulo.length > 160) return { erro: "Informe um título com até 160 caracteres." };
  if (!permitidos.includes(metodo)) return { erro: "Método HTTP inválido." };
  if (!endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.length > 1800) {
    return { erro: "Endpoint deve ser um caminho relativo iniciado por /." };
  }
  let headers = {};
  if (body.headers !== undefined && body.headers !== null) {
    if (typeof body.headers !== "object" || Array.isArray(body.headers)) return { erro: "Headers devem ser um objeto JSON." };
    headers = body.headers;
    if (JSON.stringify(headers).length > 8000) return { erro: "Headers excedem o limite permitido." };
  }
  const forbidden = /^(host|content-length|connection|transfer-encoding|cookie|set-cookie|proxy-|sec-)/i;
  for (const [key, value] of Object.entries(headers)) {
    if (!/^[a-z0-9-]{1,80}$/i.test(key) || forbidden.test(key) || typeof value !== "string" || value.length > 2000) {
      return { erro: `Header inválido: ${key}.` };
    }
  }
  let corpo = body.corpo ?? null;
  if (corpo !== null && (typeof corpo !== "object" || JSON.stringify(corpo).length > 64000)) {
    return { erro: "Corpo deve ser um objeto JSON de até 64 KB." };
  }
  const status = body.status_esperado === "" || body.status_esperado === undefined ? 200 : Number(body.status_esperado);
  if (!Number.isInteger(status) || status < 100 || status > 599) return { erro: "Status HTTP esperado inválido." };
  return { campos: { titulo, descricao: String(body.descricao || "").slice(0, 4000), metodo, endpoint, headers, corpo, status_esperado: status } };
}

function ipv4Privado(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 192 && p[1] === 0) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19)) || p[0] >= 224;
}

function ipPublico(ip) {
  const tipo = net.isIP(ip);
  if (tipo === 4) return !ipv4Privado(ip);
  if (tipo === 6) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::" || s.startsWith("fe80:") || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("ff")) return false;
    if (s.startsWith("::ffff:")) return ipPublico(s.slice(7));
    return true;
  }
  return false;
}

async function validarDestino(baseUrl, endpoint) {
  let base;
  try { base = new URL(baseUrl); } catch { throw new Error("Configure uma URL base válida no projeto."); }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("A URL base deve usar HTTP/HTTPS e não pode conter credenciais.");
  const host = base.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (!ipPublico(host)) throw new Error("Por segurança, não é permitido testar endereços locais ou privados.");
  } else {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some(record => !ipPublico(record.address))) {
      throw new Error("O domínio resolve para um endereço privado ou não permitido.");
    }
  }
  const target = new URL(endpoint, base);
  if (target.origin !== base.origin) throw new Error("O endpoint precisa permanecer no mesmo domínio da URL base.");
  return target;
}

async function lerRespostaLimitada(response, limite = 20000) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await reader.cancel();
      chunks.push(Buffer.from(value).subarray(0, Math.max(0, limite - (total - value.byteLength))));
      break;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

router.use(autenticar);

// GET /api/projetos/:id/casos
router.get("/:projetoId/casos", exigir("cases:read"), async (req, res) => {
  try {
    const projeto = await projetoDoUsuario(req.params.projetoId, req.usuario.id);
    if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });
    const [casos] = await pool.execute(
      `SELECT c.id, c.titulo, c.descricao, c.metodo, c.endpoint, c.headers, c.corpo,
              c.status_esperado, c.ativo, c.modo_execucao, c.criado_em
       FROM casos_teste c
       WHERE c.projeto_id = ? AND c.usuario_id = ?
       ORDER BY c.criado_em DESC`,
      [req.params.projetoId, req.usuario.id]
    );
    if (casos.length) {
      const [ultimasExecucoes] = await pool.execute(
        `SELECT e.caso_teste_id, e.status
         FROM execucoes e
         INNER JOIN (
           SELECT caso_teste_id, MAX(id) AS ultima_id
           FROM execucoes
           WHERE projeto_id = ? AND usuario_id = ?
           GROUP BY caso_teste_id
         ) ultimas ON ultimas.ultima_id = e.id`,
        [req.params.projetoId, req.usuario.id]
      );
      const statusPorCaso = new Map(ultimasExecucoes.map(item => [String(item.caso_teste_id), item.status]));
      for (const caso of casos) caso.ultimo_status = statusPorCaso.get(String(caso.id)) || null;
    }
    res.json({ casos });
  } catch (error) {
    console.error("Erro ao listar casos:", { code: error.code, message: error.message, sqlMessage: error.sqlMessage });
    res.status(500).json({ erro: "Não foi possível listar os casos de teste." });
  }
});

router.post("/:projetoId/casos", exigir("cases:create"), async (req, res) => {
  const validacao = validarCaso(req.body || {});
  if (validacao.erro) return res.status(400).json({ erro: validacao.erro });
  try {
    const projeto = await projetoDoUsuario(req.params.projetoId, req.usuario.id);
    if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });
    const c = validacao.campos;
    const [result] = await pool.execute(
      `INSERT INTO casos_teste
       (projeto_id, usuario_id, titulo, descricao, metodo, endpoint, headers, corpo, status_esperado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [projeto.id, req.usuario.id, c.titulo, c.descricao, c.metodo, c.endpoint,
       JSON.stringify(c.headers), c.corpo === null ? null : JSON.stringify(c.corpo), c.status_esperado]
    );
    await auditar(req, "caso_teste.criado", { projeto_id: projeto.id, caso_id: result.insertId });
    res.status(201).json({ mensagem: "Caso de teste criado.", id: result.insertId });
  } catch (error) {
    console.error("Erro ao criar caso:", error.message);
    res.status(500).json({ erro: "Não foi possível criar o caso de teste." });
  }
});

router.put("/:projetoId/casos/:casoId", exigir("cases:update"), async (req, res) => {
  const validacao = validarCaso(req.body || {});
  if (validacao.erro) return res.status(400).json({ erro: validacao.erro });
  try {
    const projeto = await projetoDoUsuario(req.params.projetoId, req.usuario.id);
    if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });
    const c = validacao.campos;
    const [result] = await pool.execute(
      `UPDATE casos_teste SET titulo=?, descricao=?, metodo=?, endpoint=?, headers=?, corpo=?, status_esperado=?
       WHERE id=? AND projeto_id=? AND usuario_id=? AND modo_execucao=?` ,
      [c.titulo, c.descricao, c.metodo, c.endpoint, JSON.stringify(c.headers), c.corpo === null ? null : JSON.stringify(c.corpo), c.status_esperado, req.params.casoId, projeto.id, req.usuario.id, "http"]
    );
    if (!result.affectedRows) return res.status(404).json({ erro: "Caso HTTP não encontrado." });
    await auditar(req, "caso_teste.atualizado", { projeto_id: projeto.id, caso_id: Number(req.params.casoId) });
    res.json({ mensagem: "Caso de teste atualizado." });
  } catch (error) { console.error("Erro ao atualizar caso:", error.message); res.status(500).json({ erro: "Não foi possível atualizar o caso." }); }
});
router.delete("/:projetoId/casos/:casoId", exigir("cases:delete"), async (req, res) => {
  try {
    const [result] = await pool.execute(
      "DELETE FROM casos_teste WHERE id = ? AND projeto_id = ? AND usuario_id = ?",
      [req.params.casoId, req.params.projetoId, req.usuario.id]
    );
    if (!result.affectedRows) return res.status(404).json({ erro: "Caso de teste não encontrado." });
    await auditar(req, "caso_teste.excluido", { projeto_id: Number(req.params.projetoId), caso_id: Number(req.params.casoId) });
    res.json({ mensagem: "Caso excluído." });
  } catch (error) {
    console.error("Erro ao excluir caso:", error.message);
    res.status(500).json({ erro: "Não foi possível excluir o caso." });
  }
});

router.post("/:projetoId/casos/gerar-ia", exigir("cases:create"), async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ erro: "Configure GROQ_API_KEY no ambiente do servidor para habilitar a geração com IA." });
  const modelo = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const objetivo = typeof req.body?.objetivo === "string" ? req.body.objetivo.trim().slice(0, 3000) : "";
  try {
    const projeto = await projetoDoUsuario(req.params.projetoId, req.usuario.id);
    if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });
    if (!projeto.url_base) return res.status(400).json({ erro: "Cadastre a URL base da API no projeto antes de gerar os casos." });

    const prompt = `Você é especialista em QA de APIs REST. Gere de 3 a 5 casos de teste úteis para esta API.
Projeto: ${projeto.nome}
URL base: ${projeto.url_base}
Objetivo/contexto informado: ${objetivo || "Criar cenários básicos positivos, negativos e validação de dados."}
Responda somente JSON válido no formato:
{"casos":[{"titulo":"...","descricao":"...","metodo":"GET","endpoint":"/caminho","headers":{},"corpo":null,"status_esperado":200}]}
Regras: endpoint deve ser caminho relativo iniciado por /; não use URL completa; métodos GET, POST, PUT, PATCH, DELETE, HEAD ou OPTIONS; status esperado inteiro; não invente autenticação nem dados secretos; prefira cenários seguros e sem operações destrutivas.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: "Você gera casos de teste de API. Retorne somente um objeto JSON válido, sem markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_completion_tokens: 8192,
        reasoning_effort: "low",
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(60000)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`Groq respondeu HTTP ${response.status}:`, data.error?.message || "Erro sem detalhes");
      if (response.status === 401 || response.status === 403) {
        return res.status(503).json({ erro: "A chave do Groq é inválida ou não tem permissão. Confira GROQ_API_KEY nas variáveis do servidor." });
      }
      if (response.status === 429) {
        return res.status(503).json({ erro: "O limite gratuito de uso do Groq foi atingido. Aguarde alguns minutos e tente novamente." });
      }
      return res.status(502).json({ erro: "O Groq não conseguiu gerar os casos agora. Tente novamente em instantes." });
    }

    const choice = data.choices?.[0];
    const raw = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
    if (!raw) {
      console.error("Groq retornou conteúdo vazio:", {
        modelo,
        finish_reason: choice?.finish_reason || "indisponível",
        message_fields: Object.keys(choice?.message || {})
      });
      throw new Error("A IA respondeu sem retornar os casos. Tente novamente; se persistir, altere GROQ_MODEL no servidor.");
    }
    let parsed;
    try {
      const normalized = raw.replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "");
      parsed = JSON.parse(normalized);
    } catch {
      console.error("Groq retornou JSON inválido:", raw.slice(0, 500));
      throw new Error("A IA retornou um formato inválido. Tente novamente.");
    }
    if (!Array.isArray(parsed.casos) || !parsed.casos.length) throw new Error("A IA não retornou casos de teste.");

    const salvos = [];
    for (const item of parsed.casos.slice(0, 5)) {
      const validacao = validarCaso(item);
      if (validacao.erro) continue;
      const c = validacao.campos;
      const [result] = await pool.execute(
        `INSERT INTO casos_teste
         (projeto_id, usuario_id, titulo, descricao, metodo, endpoint, headers, corpo, status_esperado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [projeto.id, req.usuario.id, c.titulo, c.descricao, c.metodo, c.endpoint,
         JSON.stringify(c.headers), c.corpo === null ? null : JSON.stringify(c.corpo), c.status_esperado]
      );
      salvos.push({ id: result.insertId, ...c });
    }
    if (!salvos.length) throw new Error("A IA gerou cenários que não passaram pela validação.");
    await auditar(req, "casos_teste.gerados_ia", { projeto_id: projeto.id, quantidade: salvos.length, provedor: "groq", modelo });
    res.status(201).json({ mensagem: `${salvos.length} casos gerados e salvos com Groq.`, casos: salvos });
  } catch (error) {
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    console.error("Erro na geração Groq:", error.message);
    res.status(timedOut ? 504 : 502).json({
      erro: timedOut
        ? "O Groq demorou mais de 60 segundos para responder. Tente novamente."
        : (error.message || "Não foi possível gerar os casos com IA.")
    });
  }
});

router.post("/:projetoId/casos/:casoId/executar", exigir("executions:create"), limitarExecucoesFree, async (req, res) => {
  const inicio = Date.now();
  try {
    const projeto = await projetoDoUsuario(req.params.projetoId, req.usuario.id);
    if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });
    if (!projeto.url_base) return res.status(400).json({ erro: "Cadastre a URL base da API no projeto." });
    const [rows] = await pool.execute(
      `SELECT * FROM casos_teste WHERE id = ? AND projeto_id = ? AND usuario_id = ? AND ativo = TRUE`,
      [req.params.casoId, projeto.id, req.usuario.id]
    );
    if (!rows.length) return res.status(404).json({ erro: "Caso de teste não encontrado ou inativo." });
    const caso = rows[0];
    const target = await validarDestino(projeto.url_base, caso.endpoint);
    const headers = typeof caso.headers === "string" ? JSON.parse(caso.headers || "{}") : (caso.headers || {});
    const options = {
      method: caso.metodo,
      headers: { Accept: "application/json, text/plain, */*", ...headers },
      redirect: "manual",
      signal: AbortSignal.timeout(10000)
    };
    if (!["GET", "HEAD"].includes(caso.metodo) && caso.corpo !== null) {
      options.headers["Content-Type"] = options.headers["Content-Type"] || "application/json";
      options.body = typeof caso.corpo === "string" ? caso.corpo : JSON.stringify(caso.corpo);
    }
    const response = await fetch(target, options);
    const texto = await lerRespostaLimitada(response);
    const duracao = Date.now() - inicio;
    const resumo = texto.slice(0, 20000);
    const status = response.status === Number(caso.status_esperado) ? "sucesso" : "falha";
    const [result] = await pool.execute(
      `INSERT INTO execucoes
       (caso_teste_id, projeto_id, usuario_id, status, status_http, duracao_ms, resposta_resumo, erro_resumo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [caso.id, projeto.id, req.usuario.id, status, response.status, duracao, resumo,
       status === "falha" ? `Esperado HTTP ${caso.status_esperado}, recebido HTTP ${response.status}.` : null]
    );
    await auditar(req, "caso_teste.executado", { projeto_id: projeto.id, caso_id: caso.id, execucao_id: result.insertId, status });
    res.json({
      mensagem: status === "sucesso" ? "Teste aprovado." : "Teste reprovado.",
      execucao: { id: result.insertId, status, status_http: response.status, duracao_ms: duracao, status_esperado: caso.status_esperado, resposta: resumo.slice(0, 3000), erro: status === "falha" ? `Esperado HTTP ${caso.status_esperado}, recebido HTTP ${response.status}.` : null }
    });
  } catch (error) {
    const duracao = Date.now() - inicio;
    const message = error.name === "TimeoutError" ? "A requisição excedeu o tempo limite de 10 segundos." : error.message;
    // Registra erros de execução, sem expor stack trace ou dados internos.
    try {
      const projeto = await projetoDoUsuario(req.params.projetoId, req.usuario.id);
      const [rows] = await pool.execute(
        "SELECT id FROM casos_teste WHERE id = ? AND projeto_id = ? AND usuario_id = ?",
        [req.params.casoId, req.params.projetoId, req.usuario.id]
      );
      if (projeto && rows.length) {
        await pool.execute(
          `INSERT INTO execucoes (caso_teste_id, projeto_id, usuario_id, status, duracao_ms, erro_resumo)
           VALUES (?, ?, ?, 'erro', ?, ?)`,
          [rows[0].id, projeto.id, req.usuario.id, duracao, String(message).slice(0, 1000)]
        );
      }
    } catch (dbError) {
      console.error("Não foi possível registrar erro da execução:", dbError.message);
    }
    res.status(400).json({ erro: message || "Falha ao executar o teste." });
  } finally {
    await req.liberarLockExecucaoFree?.();
  }
});

router.get("/:projetoId/execucoes", exigir("executions:read"), async (req, res) => {
  try {
    const projeto = await projetoDoUsuario(req.params.projetoId, req.usuario.id);
    if (!projeto) return res.status(404).json({ erro: "Projeto não encontrado." });
    const [execucoes] = await pool.execute(
      `SELECT e.id, e.caso_teste_id, c.titulo, c.metodo, c.endpoint, e.status,
              e.status_http, e.duracao_ms, e.erro_resumo, e.executado_em
       FROM execucoes e JOIN casos_teste c ON c.id = e.caso_teste_id
       WHERE e.projeto_id = ? AND e.usuario_id = ?
       ORDER BY e.executado_em DESC LIMIT 30`,
      [projeto.id, req.usuario.id]
    );
    res.json({ execucoes });
  } catch (error) {
    console.error("Erro ao consultar execuções:", error.message);
    res.status(500).json({ erro: "Não foi possível consultar o histórico." });
  }
});

module.exports = router;
