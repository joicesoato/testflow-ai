require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: { policy: "same-origin" }
}));
app.use(express.json());

const PORT = process.env.AUTH_PORT || 3001;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";

if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
  throw new Error("JWT_SECRET deve possuir pelo menos 32 bytes e ser único por ambiente.");
}
if (!INTERNAL_SERVICE_SECRET || Buffer.byteLength(INTERNAL_SERVICE_SECRET, "utf8") < 32) {
  throw new Error("INTERNAL_SERVICE_SECRET deve possuir pelo menos 32 bytes e ser único por ambiente.");
}

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas. Tente novamente mais tarde." }
});

const permissoesPorRole = {
  admin: [
    "projects:read", "projects:create", "projects:update", "projects:delete",
    "cases:read", "cases:create", "cases:update", "cases:delete",
    "executions:create", "executions:read",
    "evidence:create", "evidence:read", "logs:read", "account:manage"
  ],
  analista: [
    "projects:read", "projects:create", "projects:update", "projects:delete",
    "cases:read", "cases:create", "cases:update", "cases:delete",
    "executions:create", "executions:read",
    "evidence:create", "evidence:read", "account:manage"
  ],
  desenvolvedor: [
    "projects:read", "cases:read", "executions:create", "executions:read",
    "evidence:create", "evidence:read", "account:manage"
  ],
  // Compatibilidade com contas legadas da versão anterior.
  usuario: [
    "projects:read", "projects:create", "projects:update", "projects:delete",
    "cases:read", "cases:create", "cases:update", "cases:delete",
    "executions:create", "executions:read",
    "evidence:create", "evidence:read", "account:manage"
  ]
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendVerificationEmail(usuario) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const [result] = await pool.execute(
    `UPDATE usuarios
     SET token_verificacao = ?,
         verificacao_expira_em = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
     WHERE id = ? AND email_verificado = FALSE`,
    [tokenHash, usuario.id]
  );

  if (!result.affectedRows) return false;

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const link = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const nomeHtml = escapeHtml(usuario.nome);

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: usuario.email,
    subject: "Confirme seu cadastro - TestFlow AI",
    html: `
      <h2>Confirme seu e-mail</h2>
      <p>Olá, ${nomeHtml}!</p>
      <p>Para ativar sua conta no <strong>TestFlow AI</strong>, use o link abaixo:</p>
      <p><a href="${link}">Confirmar meu e-mail</a></p>
      <p>Este link é válido por <strong>30 minutos</strong> e só pode ser usado uma vez.</p>
      <p>Se você não solicitou esta confirmação, ignore este e-mail.</p>
    `
  });
  return true;
}

const path = require("path");

const swaggerHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auth Service — Swagger UI</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>window.onload=()=>SwaggerUIBundle({url:"/openapi.json",dom_id:"#swagger-ui",deepLinking:true,presets:[SwaggerUIBundle.presets.apis,SwaggerUIBundle.SwaggerUIStandalonePreset],layout:"BaseLayout"});</script></body></html>`;

app.get("/openapi.json", (req, res) => res.sendFile(path.join(__dirname, "openapi.json")));
app.get("/docs", (req, res) => res.type("html").send(swaggerHtml));

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 587),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD
  }
});

// CADASTRO
app.post("/register", sensitiveLimiter, async (req, res) => {
  try {
    const nome = typeof req.body.nome === "string" ? req.body.nome.trim() : "";
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const senha = req.body.senha;

    if (!nome || !email || typeof senha !== "string" || nome.length > 100 || email.length > 150) {
      return res.status(400).json({
        erro: "Nome, e-mail e senha são obrigatórios."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ erro: "Informe um e-mail válido." });
    }

    if (senha.length < 6 || senha.length > 128) {
      return res.status(400).json({
        erro: "A senha deve ter entre 6 e 128 caracteres."
      });
    }

    const [existentes] = await pool.execute(
      "SELECT id, nome, email, email_verificado FROM usuarios WHERE email = ?",
      [email]
    );

    if (existentes.length > 0) {
      const usuarioExistente = existentes[0];
      if (!usuarioExistente.email_verificado) {
        await sendVerificationEmail(usuarioExistente);
        return res.json({
          mensagem: "Já existe um cadastro aguardando confirmação. Enviamos um novo link para seu e-mail."
        });
      }

      return res.status(409).json({
        erro: "Esta conta já está confirmada. Entre ou recupere sua senha.",
        codigo: "ACCOUNT_ALREADY_CONFIRMED"
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    const exigirVerificacao = process.env.EMAIL_VERIFICATION_REQUIRED !== "false";

    const [resultado] = await pool.execute(
      `INSERT INTO usuarios
       (nome, email, senha_hash, role, email_verificado, token_verificacao, verificacao_expira_em)
       VALUES (?, ?, ?, 'analista', ?, NULL, NULL)`,
      [nome, email, senhaHash, exigirVerificacao ? false : true]
    );

    if (exigirVerificacao) {
      try {
        await sendVerificationEmail({ id: resultado.insertId, nome, email });
      } catch {
        console.error("Falha ao enviar e-mail de confirmação.");
        return res.status(503).json({
          erro: "A conta foi criada, mas não foi possível enviar a confirmação. Solicite um novo link."
        });
      }
    }

    res.status(201).json({
      mensagem: exigirVerificacao
        ? "Cadastro realizado! Enviamos um e-mail de confirmação. Clique no link recebido para ativar sua conta."
        : "Cadastro realizado. A conta está ativa neste ambiente de desenvolvimento.",
      usuario: {
        id: resultado.insertId,
        nome,
        email,
        role: "analista"
      }
    });

  } catch {
    console.error("Erro no cadastro.");

    res.status(503).json({
      erro: "Erro interno ao realizar cadastro."
    });
  }
});

// REENVIAR CONFIRMAÇÃO
app.post("/resend-verification", sensitiveLimiter, async (req, res) => {
  const mensagem = "Se houver uma conta aguardando confirmação para este e-mail, enviaremos um novo link.";

  try {
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
      return res.status(400).json({ erro: "Informe um e-mail válido." });
    }

    const [usuarios] = await pool.execute(
      `SELECT id, nome, email
       FROM usuarios
       WHERE email = ? AND email_verificado = FALSE`,
      [email]
    );

    if (usuarios.length > 0) {
      await sendVerificationEmail(usuarios[0]);
    }

    return res.json({ mensagem });
  } catch {
    console.error("Falha ao processar reenvio de confirmação.");
    return res.status(503).json({
      erro: "Não foi possível processar a solicitação. Tente novamente mais tarde."
    });
  }
});

// CONFIRMAR E-MAIL
app.get("/verify-email", sensitiveLimiter, async (req, res) => {
  try {
    const token = req.query.token;

    if (typeof token !== "string" || !/^[a-f\d]{64}$/i.test(token)) {
      return res.status(400).send("Token de verificação não informado.");
    }

    const [usuarios] = await pool.execute(
      `SELECT id
       FROM usuarios
       WHERE token_verificacao IN (?, ?)
       AND email_verificado = FALSE
       AND verificacao_expira_em > NOW()`,
      [hashToken(token), token]
    );

    if (usuarios.length === 0) {
      return res.status(400).send(`
        <h2>Link inválido ou expirado</h2>
        <p>O link de confirmação é inválido, já foi utilizado ou expirou.</p>
      `);
    }

    const [result] = await pool.execute(
      `UPDATE usuarios
       SET email_verificado = TRUE,
           token_verificacao = NULL,
           verificacao_expira_em = NULL
       WHERE id = ?
       AND email_verificado = FALSE
       AND token_verificacao IN (?, ?)
       AND verificacao_expira_em > NOW()`,
      [usuarios[0].id, hashToken(token), token]
    );

    if (!result.affectedRows) {
      return res.status(400).send("Link inválido, expirado ou já utilizado.");
    }

    res.json({
      mensagem: "E-mail confirmado com sucesso."
    });

  } catch {
    console.error("Erro ao confirmar e-mail.");

    res.status(503).send(
      "Erro interno ao confirmar o e-mail."
    );
  }
});

// LOGIN
app.post("/login", sensitiveLimiter, async (req, res) => {
  try {
    const { email, senha } = req.body;

    const [usuarios] = await pool.execute(
      `SELECT id, nome, email, senha_hash, role, email_verificado
      FROM usuarios
      WHERE email = ?`,
      [email]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos."
      });
    }

    const usuario = usuarios[0];

    const senhaValida = await bcrypt.compare(
      senha,
      usuario.senha_hash
    );

    if (!senhaValida) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos."
      });
    }

    if (!usuario.email_verificado) {
      return res.status(403).json({
        erro: "E-mail ainda não confirmado. Verifique sua caixa de entrada ou solicite um novo link.",
        codigo: "EMAIL_NOT_VERIFIED"
      });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      mensagem: "Login realizado com sucesso.",
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role
      }
    });
  } catch {
    console.error("Erro no login.");
    res.status(500).json({ erro: "Erro interno no login." });
  }
});

app.get("/authorize", async (req, res) => {
  try {
    if (!INTERNAL_SERVICE_SECRET || req.get("X-Internal-Secret") !== INTERNAL_SERVICE_SECRET) {
      return res.status(401).json({ erro: "Não autorizado." });
    }

    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ erro: "Token não informado." });
    }

    const dados = jwt.verify(auth.substring(7), JWT_SECRET);
    const [usuarios] = await pool.execute(
      "SELECT id, nome, email, role FROM usuarios WHERE id = ?",
      [dados.id]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ erro: "Usuário não encontrado." });
    }

    const usuario = usuarios[0];
    const permissoes = permissoesPorRole[usuario.role] || [];

    res.json({
      autenticado: true,
      usuario,
      permissoes
    });
  } catch {
    res.status(401).json({ erro: "Token inválido ou expirado." });
  }
});

// VALIDAR TOKEN
app.get("/me", async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        erro: "Token não informado."
      });
    }

    const token = auth.substring(7);
    const dados = jwt.verify(token, JWT_SECRET);

    res.json({
      autenticado: true,
      usuario: dados
    });
  } catch {
    res.status(401).json({
      erro: "Token inválido ou expirado."
    });
  }
});

// ESQUECI A SENHA
app.post("/forgot-password", sensitiveLimiter, async (req, res) => {
  try {
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
      return res.status(400).json({
        erro: "Informe um e-mail válido."
      });
    }

    const [usuarios] = await pool.execute(
      "SELECT id, nome, email FROM usuarios WHERE email = ?",
      [email]
    );

    // Não revela se o e-mail existe
    if (usuarios.length === 0) {
      return res.json({
        mensagem: "Se o e-mail estiver cadastrado, um link será enviado."
      });
    }

    const usuario = usuarios[0];
    const nomeHtml = escapeHtml(usuario.nome);

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    await pool.execute(
      "UPDATE reset_tokens SET usado = TRUE WHERE usuario_id = ? AND usado = FALSE",
      [usuario.id]
    );
    await pool.execute(
      `INSERT INTO reset_tokens
      (token, usuario_id, criado_em, expira_em, usado)
       VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE), FALSE)`,
          [tokenHash, usuario.id]
    );

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: usuario.email,
      subject: "Recuperação de senha - TestFlow AI",
      html: `
        <h2>Recuperação de senha</h2>
        <p>Olá, ${nomeHtml}!</p>
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p>O link abaixo é válido por <strong>30 minutos</strong> e pode ser usado apenas uma vez.</p>
        <p>
          <a href="${link}">Redefinir minha senha</a>
        </p>
        <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
      `
    });

    res.json({
      mensagem: "Se o e-mail estiver cadastrado, um link será enviado."
    });
  } catch {
    console.error("Erro na recuperação de senha.");
    res.status(500).json({
      erro: "Erro ao enviar e-mail de recuperação."
    });
  }
});

// REDEFINIR SENHA
app.post("/reset-password", sensitiveLimiter, async (req, res) => {
  let connection;
  try {
    const { token, novaSenha } = req.body;

    if (typeof token !== "string" || !/^[a-f\d]{64}$/i.test(token) ||
        typeof novaSenha !== "string") {
      return res.status(400).json({
        erro: "Token e nova senha são obrigatórios."
      });
    }

    if (typeof novaSenha !== "string" || novaSenha.length < 6 || novaSenha.length > 128) {
      return res.status(400).json({
        erro: "A nova senha deve ter entre 6 e 128 caracteres."
      });
    }

    const tokenHash = hashToken(token);
    const senhaHash = await bcrypt.hash(novaSenha, 12);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [tokens] = await connection.execute(
      `SELECT usuario_id
       FROM reset_tokens
       WHERE token = ? AND usado = FALSE AND expira_em > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        erro: "Token inválido, expirado ou já utilizado."
      });
    }

    const reset = tokens[0];
    await connection.execute(
      "UPDATE usuarios SET senha_hash = ? WHERE id = ?",
      [senhaHash, reset.usuario_id]
    );

    const [consumed] = await connection.execute(
      "UPDATE reset_tokens SET usado = TRUE WHERE token = ? AND usado = FALSE",
      [tokenHash]
    );
    if (!consumed.affectedRows) {
      await connection.rollback();
      return res.status(400).json({
        erro: "Token inválido, expirado ou já utilizado."
      });
    }

    await connection.commit();
    res.json({
      mensagem: "Senha alterada com sucesso."
    });
  } catch {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Falha ao reverter transação de redefinição.");
      }
    }
    console.error("Erro ao redefinir senha.");
    res.status(500).json({
      erro: "Erro ao redefinir senha."
    });
  } finally {
    connection?.release();
  }
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      servico: "auth-service"
    });
  } catch {
    res.status(500).json({
      status: "erro"
    });
  }
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Auth Service disponível na porta ${PORT}`);
  });
}

module.exports = { app };
