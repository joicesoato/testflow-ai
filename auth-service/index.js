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
    const nome = req.body.nome?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const senha = req.body.senha;

    if (!nome || !email || !senha || nome.length > 100 || email.length > 150) {
      return res.status(400).json({
        erro: "Nome, e-mail e senha são obrigatórios."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ erro: "Informe um e-mail válido." });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        erro: "A senha deve ter pelo menos 6 caracteres."
      });
    }

    const [existentes] = await pool.execute(
      "SELECT id FROM usuarios WHERE email = ?",
      [email]
    );

    if (existentes.length > 0) {
      return res.status(409).json({
        erro: "Este e-mail já está cadastrado."
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    const nomeHtml = escapeHtml(nome);

    const tokenVerificacao = crypto.randomBytes(32).toString("hex");

    const [resultado] = await pool.execute(
      `INSERT INTO usuarios
       (nome, email, senha_hash, role, email_verificado, token_verificacao, verificacao_expira_em)
       VALUES (?, ?, ?, 'analista', FALSE, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
      [nome, email, senhaHash, tokenVerificacao]
    );

    const appUrl = process.env.APP_URL || "http://localhost:3000";

    const linkVerificacao =
      `${appUrl}/api/auth/verify-email?token=${tokenVerificacao}`;

    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: "Confirme seu cadastro - TestFlow AI",
        html: `
          <h2>Confirme seu e-mail</h2>

          <p>Olá, ${nomeHtml}!</p>

          <p>
            Seu cadastro no <strong>TestFlow AI</strong> foi realizado.
          </p>

          <p>
            Para ativar sua conta, clique no botão abaixo:
          </p>

          <p>
            <a href="${linkVerificacao}"
               style="
                 display:inline-block;
                 padding:12px 20px;
                 background:#000;
                 color:#fff;
                 text-decoration:none;
                 border-radius:6px;
               ">
              Confirmar meu e-mail
            </a>
          </p>

          <p>
            Este link é válido por <strong>30 minutos</strong>.
          </p>

          <p>
            Se você não realizou este cadastro, ignore este e-mail.
          </p>
        `
      });
    } catch (erroEmail) {
      console.error("Erro ao enviar confirmação:", erroEmail);

      // Remove o usuário se o e-mail não puder ser enviado
      await pool.execute(
        "DELETE FROM usuarios WHERE id = ?",
        [resultado.insertId]
      );

      return res.status(500).json({
        erro: "Não foi possível enviar o e-mail de confirmação."
      });
    }

    res.status(201).json({
      mensagem:
        "Cadastro realizado! Enviamos um e-mail de confirmação. Clique no link recebido para ativar sua conta.",
      usuario: {
        id: resultado.insertId,
        nome,
        email,
        role: "analista"
      }
    });

  } catch (erro) {
    console.error("Erro no cadastro:", erro);

    res.status(503).json({
      erro: "Erro interno ao realizar cadastro."
    });
  }
});

// CONFIRMAR E-MAIL
app.get("/verify-email", async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).send("Token de verificação não informado.");
    }

    const [usuarios] = await pool.execute(
      `SELECT id
       FROM usuarios
       WHERE token_verificacao = ?
       AND email_verificado = FALSE
       AND verificacao_expira_em > NOW()`,
      [token]
    );

    if (usuarios.length === 0) {
      return res.status(400).send(`
        <h2>Link inválido ou expirado</h2>
        <p>O link de confirmação é inválido, já foi utilizado ou expirou.</p>
      `);
    }

    await pool.execute(
      `UPDATE usuarios
       SET email_verificado = TRUE,
           token_verificacao = NULL,
           verificacao_expira_em = NULL
       WHERE id = ?`,
      [usuarios[0].id]
    );

    res.json({
      mensagem: "E-mail confirmado com sucesso."
    });

  } catch (erro) {
    console.error("Erro na confirmação:", erro);

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
        erro: "E-mail ainda não confirmado. Verifique sua caixa de entrada."
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
  } catch (erro) {
    console.error("Erro no login:", erro);
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
  } catch (erro) {
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
  } catch (erro) {
    res.status(401).json({
      erro: "Token inválido ou expirado."
    });
  }
});

// ESQUECI A SENHA
app.post("/forgot-password", sensitiveLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        erro: "Informe o e-mail."
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
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await pool.execute(
      `INSERT INTO reset_tokens
      (token, usuario_id, criado_em, expira_em, usado)
       VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE), FALSE)`,
          [tokenHash, usuario.id]
    );

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const link = `${appUrl}/reset?token=${encodeURIComponent(token)}`;

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
  } catch (erro) {
    console.error("Erro na recuperação:", erro);
    res.status(500).json({
      erro: "Erro ao enviar e-mail de recuperação."
    });
  }
});

// REDEFINIR SENHA
app.post("/reset-password", sensitiveLimiter, async (req, res) => {
  try {
    const { token, novaSenha } = req.body;

    if (!token || !novaSenha) {
      return res.status(400).json({
        erro: "Token e nova senha são obrigatórios."
      });
    }

    if (typeof novaSenha !== "string" || novaSenha.length < 6 || novaSenha.length > 128) {
      return res.status(400).json({
        erro: "A nova senha deve ter entre 6 e 128 caracteres."
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const [tokens] = await pool.execute(
      `SELECT usuario_id
       FROM reset_tokens
       WHERE token = ?
       AND usado = FALSE
       AND expira_em > NOW()`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        erro: "Token inválido, expirado ou já utilizado."
      });
    }

    const reset = tokens[0];

    const senhaHash = await bcrypt.hash(novaSenha, 12);

    await pool.execute(
      "UPDATE usuarios SET senha_hash = ? WHERE id = ?",
      [senhaHash, reset.usuario_id]
    );

    await pool.execute(
      "UPDATE reset_tokens SET usado = TRUE WHERE token = ?",
      [tokenHash]
    );

    res.json({
      mensagem: "Senha alterada com sucesso."
    });
  } catch (erro) {
    console.error("Erro ao redefinir senha:", erro);
    res.status(500).json({
      erro: "Erro ao redefinir senha."
    });
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Auth Service disponível na porta ${PORT}`);
});
