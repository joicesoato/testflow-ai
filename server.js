require("dotenv").config();

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const projetosRouter = require("./routes/projetos");
const casosRouter = require("./routes/casos");
const authRouter = require("./routes/auth");
const simulacoesRouter = require("./routes/simulacoes");
const billingRouter = require("./routes/billing");
const adminRouter = require("./routes/admin");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);

if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS deve ser um inteiro maior ou igual a zero.");
}

app.set("trust proxy", trustProxyHops);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb", verify(req, _res, buffer) { if (req.originalUrl === "/api/billing/webhook") req.rawBody = Buffer.from(buffer); } }));

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
    stage: "mvp-api-tests"
  });
});

app.use("/api/auth", authRouter);
app.use("/api/projetos", projetosRouter);
app.use("/api/projetos", casosRouter);
app.use("/api/projetos", simulacoesRouter);
app.use("/api/billing", billingRouter);
app.use("/api/admin", adminRouter);

app.get("/api/status", (_req, res) => {
  res.status(200).json({
    product: "TestFlow AI",
    stage: "mvp-api-tests",
    api: "projects-cases-executions",
    ai: process.env.GROQ_API_KEY ? "groq-configured" : "groq-not-configured",
    ai_model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    message: "APIs de projetos, casos de teste, geração com Groq e execução disponíveis."
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
