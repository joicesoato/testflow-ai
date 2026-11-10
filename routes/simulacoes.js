const express = require("express");
const mysql = require("mysql2/promise");
const { createFreeExecutionLimit } = require("../services/execution-limit");

const router = express.Router();
const pool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 8
});
const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";
const limitarExecucoesFree = createFreeExecutionLimit(pool);

async function autenticar(req, res, next) {
  const authorization = req.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ erro: "Token não informado." });
  try {
    const response = await fetch(`${AUTH_URL}/authorize`, {
      headers: { Authorization: authorization, "X-Internal-Secret": INTERNAL_SECRET },
      signal: AbortSignal.timeout(5000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.autenticado) return res.status(response.status === 401 ? 401 : 503).json({ erro: "Não foi possível validar a sessão." });
    req.usuario = data.usuario;
    req.permissoes = data.permissoes || [];
    next();
  } catch {
    res.status(503).json({ erro: "Serviço de autenticação indisponível." });
  }
}
function exigir(permissao) {
  return (req, res, next) => req.permissoes.includes(permissao) ? next() : res.status(403).json({ erro: "Sem permissão para esta operação." });
}
async function projetoValido(id, usuarioId) {
  const [rows] = await pool.execute("SELECT id FROM projetos WHERE id=? AND usuario_id=?", [id, usuarioId]);
  return rows[0] || null;
}
function pathValue(source, path) {
  if (!path) return source;
  return path.split(".").reduce((value, key) => value == null ? undefined : value[key], source);
}
function validarAssertions(assertions) {
  const operators = ["equals","not_equals","exists","not_exists","contains","greater_than","less_than","is_true","is_false","is_type"];
  if (!Array.isArray(assertions) || assertions.length < 1 || assertions.length > 30) return "Adicione de 1 a 30 verificações.";
  for (const item of assertions) {
    if (!item || typeof item.path !== "string" || item.path.length > 200 || !operators.includes(item.operator)) return "Uma das verificações está inválida.";
    if (JSON.stringify(item.expected ?? null).length > 4000) return "O valor esperado de uma verificação excede o limite.";
  }
  return null;
}
function avaliar(actual, operator, expected) {
  switch (operator) {
    case "equals": return JSON.stringify(actual) === JSON.stringify(expected);
    case "not_equals": return JSON.stringify(actual) !== JSON.stringify(expected);
    case "exists": return actual !== undefined && actual !== null;
    case "not_exists": return actual === undefined || actual === null;
    case "contains": return Array.isArray(actual) ? actual.some(v => JSON.stringify(v) === JSON.stringify(expected)) : typeof actual === "string" && actual.includes(String(expected));
    case "greater_than": return Number(actual) > Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    case "is_true": return actual === true;
    case "is_false": return actual === false;
    case "is_type": return typeof actual === String(expected);
    default: return false;
  }
}

router.use(autenticar);

// Cria cenário sem URL: executa apenas dados e regras fornecidos pelo usuário, sem rede.
router.post("/:projetoId/casos-simulacao", exigir("cases:create"), async (req, res) => {
  const { titulo, descricao = "", dados_teste = {}, assertions } = req.body || {};
  if (typeof titulo !== "string" || !titulo.trim() || titulo.length > 160) return res.status(400).json({ erro: "Informe um título de até 160 caracteres." });
  if (!dados_teste || typeof dados_teste !== "object" || Array.isArray(dados_teste) || JSON.stringify(dados_teste).length > 64000) return res.status(400).json({ erro: "Os dados de teste devem ser um objeto JSON de até 64 KB." });
  const invalid = validarAssertions(assertions);
  if (invalid) return res.status(400).json({ erro: invalid });
  try {
    if (!await projetoValido(req.params.projetoId, req.usuario.id)) return res.status(404).json({ erro: "Projeto não encontrado." });
    const [result] = await pool.execute(
      `INSERT INTO casos_teste
       (projeto_id, usuario_id, titulo, descricao, metodo, endpoint, modo_execucao, dados_teste, assertions_json, status_esperado)
       VALUES (?, ?, ?, ?, 'GET', NULL, 'simulacao', ?, ?, NULL)`,
      [req.params.projetoId, req.usuario.id, titulo.trim(), String(descricao).slice(0,4000), JSON.stringify(dados_teste), JSON.stringify(assertions)]
    );
    res.status(201).json({ id: result.insertId, mensagem: "Cenário de simulação criado." });
  } catch (error) {
    console.error("Erro ao criar cenário simulado:", error.message);
    res.status(500).json({ erro: "Não foi possível criar o cenário." });
  }
});

router.post("/:projetoId/casos/:casoId/executar-simulacao", exigir("executions:create"), limitarExecucoesFree, async (req, res) => {
  const started = Date.now();
  try {
    const [rows] = await pool.execute(
      `SELECT id, titulo, dados_teste, assertions_json FROM casos_teste
       WHERE id=? AND projeto_id=? AND usuario_id=? AND modo_execucao='simulacao' AND ativo=TRUE`,
      [req.params.casoId, req.params.projetoId, req.usuario.id]
    );
    if (!rows.length) return res.status(404).json({ erro: "Cenário de simulação não encontrado." });
    const caso = rows[0];
    const input = typeof caso.dados_teste === "string" ? JSON.parse(caso.dados_teste) : (caso.dados_teste || {});
    const assertions = typeof caso.assertions_json === "string" ? JSON.parse(caso.assertions_json) : (caso.assertions_json || []);
    const results = assertions.map(item => {
      const actual = pathValue(input, item.path);
      return { path: item.path, operator: item.operator, expected: item.expected ?? null,
        actual: actual === undefined ? null : actual, passed: avaliar(actual, item.operator, item.expected) };
    });
    const passed = results.every(item => item.passed);
    const duration = Date.now() - started;
    const summary = { execution: "simulation", network_request: false, total: results.length,
      passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, assertions: results };
    const [insert] = await pool.execute(
      `INSERT INTO execucoes
       (caso_teste_id, projeto_id, usuario_id, status, duracao_ms, resposta_resumo, erro_resumo, modo_execucao, resultado_detalhado_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'simulacao', ?)`,
      [caso.id, req.params.projetoId, req.usuario.id, passed ? "sucesso" : "falha", duration,
       JSON.stringify(summary).slice(0,20000), passed ? null : "Uma ou mais verificações falharam.", JSON.stringify(summary)]
    );
    res.json({ mensagem: passed ? "Simulação aprovada." : "Simulação reprovada.",
      execucao: { id: insert.insertId, status: passed ? "sucesso" : "falha", modo_execucao: "simulacao",
        duracao_ms: duration, resumo: summary } });
  } catch (error) {
    console.error("Erro na simulação:", error.message);
    res.status(500).json({ erro: "Não foi possível executar a simulação." });
  } finally {
    await req.liberarLockExecucaoFree?.();
  }
});

module.exports = router;
