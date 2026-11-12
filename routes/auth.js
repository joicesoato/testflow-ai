const express = require("express");

const router = express.Router();

const AUTH_URL =
  process.env.AUTH_SERVICE_URL ||
  process.env.AUTH_URL ||
  "http://auth-service:3001";

async function encaminhar(req, res, caminho, metodo = "POST") {
  try {
    const url = new URL(caminho, AUTH_URL);

    if (metodo === "GET" && req.query.token) {
      url.searchParams.set("token", String(req.query.token));
    }

    const opcoes = {
      method: metodo,
      headers: {}
    };

    if (metodo === "POST") {
      opcoes.headers["Content-Type"] = "application/json";
      opcoes.body = JSON.stringify(req.body || {});
    }

    const resposta = await fetch(url, {
      ...opcoes,
      signal: AbortSignal.timeout(10000)
    });

    const conteudo = await resposta.text();
    const tipo = resposta.headers.get("content-type") || "application/json";

    res.status(resposta.status);
    res.set("Content-Type", tipo);
    return res.send(conteudo);
  } catch (erro) {
    console.error("Falha ao acessar serviço de autenticação:", erro.message);

    return res.status(503).json({
      erro: "Serviço de autenticação indisponível. Tente novamente."
    });
  }
}

router.post("/register", (req, res) =>
  encaminhar(req, res, "/register")
);

router.post("/login", (req, res) =>
  encaminhar(req, res, "/login")
);

router.get("/verify-email", (req, res) =>
  encaminhar(req, res, "/verify-email", "GET")
);


router.get("/me", async (req, res) => {
  const authorization = req.get("Authorization");
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET || "";
  if (!authorization?.startsWith("Bearer ") || !internalSecret) {
    return res.status(401).json({ erro: "Sessão não encontrada." });
  }
  try {
    const response = await fetch(new URL("/authorize", AUTH_URL), {
      headers: {
        Authorization: authorization,
        "X-Internal-Secret": internalSecret
      },
      signal: AbortSignal.timeout(5000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.autenticado) {
      return res.status(response.status === 401 ? 401 : 503).json({
        erro: data.erro || "Não foi possível atualizar os dados da conta."
      });
    }
    return res.json({ usuario: data.usuario, permissoes: data.permissoes || [] });
  } catch (error) {
    console.error("Falha ao atualizar sessão:", error.message);
    return res.status(503).json({ erro: "Serviço de autenticação indisponível." });
  }
});

module.exports = router;
