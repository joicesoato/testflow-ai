const express = require("express");
const mysql = require("mysql2/promise");

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

async function autenticar(req, res, next) {
  const authorization = req.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token não informado." });
  }

  try {
    const resposta = await fetch(`${AUTH_URL}/authorize`, {
      headers: {
        Authorization: authorization,
        "X-Internal-Secret": INTERNAL_SECRET
      },
      signal: AbortSignal.timeout(5000)
    });

    const dados = await resposta.json();

    if (resposta.status === 401) {
      return res.status(401).json({ erro: "Token inválido ou expirado." });
    }

    if (!resposta.ok || !dados.autenticado) {
      return res.status(503).json({ erro: "Não foi possível validar a autenticação." });
    }

    req.usuario = dados.usuario;
    req.permissoes = dados.permissoes || [];
    next();
  } catch (erro) {
    console.error("Falha na autenticação:", erro.message);
    res.status(503).json({ erro: "Serviço de autenticação indisponível." });
  }
}

function exigirPermissao(permissao) {
  return (req, res, next) => {
    if (!req.permissoes.includes(permissao)) {
      return res.status(403).json({ erro: "Você não tem permissão para esta operação." });
    }
    next();
  };
}

async function auditar(req, acao, detalhes = {}) {
  try {
    await fetch(`${LOG_URL}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET
      },
      body: JSON.stringify({
        usuario_id: req.usuario.id,
        acao,
        ip: req.ip,
        detalhes
      }),
      signal: AbortSignal.timeout(2000)
    });
  } catch (erro) {
    console.error("Falha na auditoria:", erro.message);
  }
}

function validarProjeto(body, parcial = false) {
  const campos = {};

  if (!parcial || body.nome !== undefined) {
    if (typeof body.nome !== "string" || !body.nome.trim() || body.nome.trim().length > 120) {
      return { erro: "Informe um nome de projeto com até 120 caracteres." };
    }
    campos.nome = body.nome.trim();
  }

  if (!parcial || body.descricao !== undefined) {
    if (body.descricao !== undefined && body.descricao !== null &&
        typeof body.descricao !== "string") {
      return { erro: "Descrição inválida." };
    }
    campos.descricao = body.descricao || null;
  }

  if (!parcial || body.url_base !== undefined) {
    const url = body.url_base || null;
    if (url !== null) {
      if (typeof url !== "string" || url.length > 2048) {
        return { erro: "URL base inválida." };
      }
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        return { erro: "Informe uma URL base HTTP ou HTTPS válida." };
      }
    }
    campos.url_base = url;
  }

  if (!parcial || body.ambiente !== undefined) {
    const ambiente = body.ambiente || "desenvolvimento";
    if (!["desenvolvimento", "homologacao", "produção", "producao"].includes(ambiente)) {
      return { erro: "Ambiente deve ser desenvolvimento, homologacao ou producao." };
    }
    campos.ambiente = ambiente === "produção" ? "producao" : ambiente;
  }

  return { campos };
}

router.use(autenticar);

// Listar somente os projetos do usuário autenticado.
router.get("/", exigirPermissao("projects:read"), async (req, res) => {
  try {
    const [projetos] = await pool.execute(
      `SELECT id, nome, descricao, url_base, ambiente, criado_em, atualizado_em
       FROM projetos WHERE usuario_id = ? ORDER BY criado_em DESC`,
      [req.usuario.id]
    );
    res.json({ projetos });
  } catch (erro) {
    console.error("Erro ao listar projetos:", erro.message);
    res.status(500).json({ erro: "Não foi possível listar os projetos." });
  }
});

// Criar projeto.
router.post("/", exigirPermissao("projects:create"), async (req, res) => {
  const validacao = validarProjeto(req.body || {});
  if (validacao.erro) return res.status(400).json({ erro: validacao.erro });

  const { nome, descricao, url_base, ambiente } = validacao.campos;

  try {
    const [resultado] = await pool.execute(
      `INSERT INTO projetos (usuario_id, nome, descricao, url_base, ambiente)
       VALUES (?, ?, ?, ?, ?)`,
      [req.usuario.id, nome, descricao, url_base, ambiente]
    );

    await auditar(req, "projeto.criado", { projeto_id: resultado.insertId, nome });

    res.status(201).json({
      mensagem: "Projeto criado com sucesso.",
      projeto: { id: resultado.insertId, ...validacao.campos }
    });
  } catch (erro) {
    if (erro.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ erro: "Você já possui um projeto com esse nome." });
    }
    console.error("Erro ao criar projeto:", erro.message);
    res.status(500).json({ erro: "Não foi possível criar o projeto." });
  }
});

// Consultar projeto pertencente ao usuário autenticado.
router.get("/:id", exigirPermissao("projects:read"), async (req, res) => {
  try {
    const [projetos] = await pool.execute(
      `SELECT id, nome, descricao, url_base, ambiente, criado_em, atualizado_em
       FROM projetos WHERE id = ? AND usuario_id = ?`,
      [req.params.id, req.usuario.id]
    );

    if (!projetos.length) {
      return res.status(404).json({ erro: "Projeto não encontrado." });
    }

    res.json({ projeto: projetos[0] });
  } catch (erro) {
    console.error("Erro ao consultar projeto:", erro.message);
    res.status(500).json({ erro: "Não foi possível consultar o projeto." });
  }
});

// Atualizar projeto.
router.put("/:id", exigirPermissao("projects:update"), async (req, res) => {
  const validacao = validarProjeto(req.body || {}, true);
  if (validacao.erro) return res.status(400).json({ erro: validacao.erro });

  const campos = validacao.campos;
  const permitidos = ["nome", "descricao", "url_base", "ambiente"];
  const atualizacoes = permitidos.filter((campo) => campos[campo] !== undefined);

  if (!atualizacoes.length) {
    return res.status(400).json({ erro: "Informe ao menos um campo para atualizar." });
  }

  try {
    const [existentes] = await pool.execute(
      "SELECT id FROM projetos WHERE id = ? AND usuario_id = ?",
      [req.params.id, req.usuario.id]
    );

    if (!existentes.length) {
      return res.status(404).json({ erro: "Projeto não encontrado." });
    }

    const sql = atualizacoes.map((campo) => `${campo} = ?`).join(", ");
    const valores = atualizacoes.map((campo) => campos[campo]);

    await pool.execute(
      `UPDATE projetos SET ${sql} WHERE id = ? AND usuario_id = ?`,
      [...valores, req.params.id, req.usuario.id]
    );

    await auditar(req, "projeto.atualizado", {
      projeto_id: Number(req.params.id),
      campos: atualizacoes
    });

    res.json({ mensagem: "Projeto atualizado com sucesso." });
  } catch (erro) {
    if (erro.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ erro: "Você já possui um projeto com esse nome." });
    }
    console.error("Erro ao atualizar projeto:", erro.message);
    res.status(500).json({ erro: "Não foi possível atualizar o projeto." });
  }
});

// Excluir projeto.
router.delete("/:id", exigirPermissao("projects:delete"), async (req, res) => {
  try {
    const [resultado] = await pool.execute(
      "DELETE FROM projetos WHERE id = ? AND usuario_id = ?",
      [req.params.id, req.usuario.id]
    );

    if (!resultado.affectedRows) {
      return res.status(404).json({ erro: "Projeto não encontrado." });
    }

    await auditar(req, "projeto.excluido", { projeto_id: Number(req.params.id) });

    res.json({ mensagem: "Projeto excluído com sucesso." });
  } catch (erro) {
    console.error("Erro ao excluir projeto:", erro.message);
    res.status(500).json({ erro: "Não foi possível excluir o projeto." });
  }
});

module.exports = router;
