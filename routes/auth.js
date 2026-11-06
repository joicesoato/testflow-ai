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

module.exports = router;
