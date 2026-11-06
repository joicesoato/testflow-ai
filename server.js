require("dotenv").config();

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const projetosRouter = require("./routes/projetos");
const authRouter = require("./routes/auth");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);

if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS deve ser um inteiro maior ou igual a zero.");
}

app.set("trust proxy", trustProxyHops);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" }
}));

app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Limite de requisições excedido. Tente novamente em instantes." }
}));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "testflow-ai-web",
    timestamp: new Date().toISOString(),
    stage: "frontend-scaffold"
  });
});

app.use("/api/auth", authRouter);
app.use("/api/projetos", projetosRouter);

app.get("/api/status", (_req, res) => {
  res.status(200).json({
    product: "TestFlow AI",
    stage: "frontend-scaffold",
    api: "pending",
    message: "As APIs de domínio serão integradas na próxima etapa."
  });
});

const distPath = path.join(__dirname, "frontend", "dist");
app.use(express.static(distPath, {
  index: false,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  }
}));

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Rota de API não encontrada." });
  }
  res.sendFile(path.join(distPath, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error("Erro inesperado:", error.message);
  res.status(500).json({ error: "Erro interno do servidor." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TestFlow AI disponível na porta ${PORT}`);
});
