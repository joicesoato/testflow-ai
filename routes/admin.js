const express = require("express");
const mysql = require("mysql2/promise");

const defaultPool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5
});

function createAdminRouter({
  pool = defaultPool,
  fetchImpl = fetch,
  authUrl = process.env.AUTH_SERVICE_URL || "http://auth-service:3001",
  logUrl = process.env.LOG_SERVICE_URL || "http://log-service:3002",
  internalSecret = process.env.INTERNAL_SERVICE_SECRET || "",
  stripeSecretKey = process.env.STRIPE_SECRET_KEY || "",
  stripePriceId = process.env.STRIPE_PRICE_ID || ""
} = {}) {
  const router = express.Router();

  async function autenticar(req, res, next) {
    const authorization = req.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({ erro: "Faça login para acessar o painel administrativo." });
    }
    try {
      const response = await fetchImpl(`${authUrl}/authorize`, {
        headers: { Authorization: authorization, "X-Internal-Secret": internalSecret },
        signal: AbortSignal.timeout(5000)
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) return res.status(401).json({ erro: "Sessão inválida ou expirada." });
      if (!response.ok || !data.autenticado) return res.status(503).json({ erro: "Não foi possível validar sua sessão." });
      req.usuario = data.usuario;
      req.permissoes = Array.isArray(data.permissoes) ? data.permissoes : [];
      next();
    } catch {
      res.status(503).json({ erro: "Serviço de autenticação indisponível." });
    }
  }

  function exigirAdmin(req, res, next) {
    if (req.usuario?.role !== "admin" || !Array.isArray(req.permissoes) || !req.permissoes.includes("logs:read")) {
      return res.status(403).json({ erro: "Acesso restrito a administradores." });
    }
    next();
  }

  async function consultarMrr(quantidadeAssinaturas) {
    if (!quantidadeAssinaturas || !stripeSecretKey || !stripePriceId) {
      return { centavos: 0, aviso: !stripeSecretKey || !stripePriceId ? "MRR indisponível: configure o preço recorrente e a chave Stripe no servidor." : null };
    }
    try {
      const response = await fetchImpl(`https://api.stripe.com/v1/prices/${encodeURIComponent(stripePriceId)}`, {
        headers: { Authorization: `Bearer ${stripeSecretKey}` },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error("Stripe price request failed");
      const price = await response.json();
      const amount = Number(price.unit_amount_decimal ?? price.unit_amount);
      const intervalCount = Number(price.recurring?.interval_count || 1);
      if (price.currency?.toLowerCase() !== "brl" || price.recurring?.interval !== "month" ||
          !Number.isFinite(amount) || !Number.isInteger(intervalCount) || intervalCount < 1) {
        return { centavos: 0, aviso: "MRR indisponível: o preço Stripe configurado não é recorrente mensal em BRL." };
      }
      return { centavos: Math.round(amount * quantidadeAssinaturas / intervalCount), aviso: null };
    } catch (error) {
      console.error("Falha ao consultar preço mensal Stripe:", error.message);
      return { centavos: 0, aviso: "MRR indisponível: não foi possível consultar o preço Stripe configurado." };
    }
  }

  async function consultarEventos() {
    try {
      const url = new URL("/logs", logUrl);
      url.searchParams.set("limit", "10");
      const response = await fetchImpl(url, {
        headers: { "X-Internal-Secret": internalSecret },
        signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) throw new Error("Log service request failed");
      const data = await response.json();
      if (!Array.isArray(data.logs)) throw new Error("Invalid log response");
      return {
        eventos: data.logs.slice(0, 10).map(evento => ({
          id: String(evento.id),
          usuario_id: evento.usuario_id == null ? null : Number(evento.usuario_id),
          acao: String(evento.acao || ""),
          timestamp: evento.timestamp,
          detalhes: evento.detalhes && typeof evento.detalhes === "object" ? evento.detalhes : {}
        })),
        aviso: null
      };
    } catch (error) {
      console.warn("Eventos recentes indisponíveis no dashboard:", error.message);
      return { eventos: [], aviso: "O serviço de eventos está indisponível; as métricas do banco foram carregadas." };
    }
  }

  router.use(autenticar);
  router.get("/dashboard", exigirAdmin, async (_req, res) => {
    try {
      const [[contagens]] = await pool.execute(
        `SELECT COUNT(DISTINCT u.id) AS usuarios_total,
                COUNT(DISTINCT CASE WHEN s.plano = 'pro' AND s.status IN ('active', 'trialing') THEN u.id END) AS usuarios_pro,
                COUNT(DISTINCT CASE WHEN s.status IN ('active', 'trialing') THEN s.id END) AS assinaturas_ativas,
                COUNT(DISTINCT CASE WHEN s.status = 'past_due' THEN s.id END) AS assinaturas_past_due
         FROM usuarios u LEFT JOIN assinaturas s ON s.usuario_id = u.id`
      );
      const [[uso]] = await pool.execute(
        `SELECT COUNT(*) AS execucoes_mes, COUNT(DISTINCT usuario_id) AS usuarios_que_executaram
         FROM execucoes
         WHERE executado_em >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
           AND executado_em < DATE_ADD(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), INTERVAL 1 MONTH)`
      );
      const [priceRows] = stripePriceId
        ? await pool.execute(
          `SELECT COUNT(*) AS quantidade FROM assinaturas
           WHERE plano = 'pro' AND status IN ('active', 'trialing') AND stripe_price_id = ?`,
          [stripePriceId]
        )
        : [[{ quantidade: 0 }]];
      const mrr = await consultarMrr(Number(priceRows[0]?.quantidade || 0));
      const { eventos, aviso: avisoEventos } = await consultarEventos();
      const avisos = [mrr.aviso, avisoEventos].filter(Boolean);
      const usuariosTotal = Number(contagens.usuarios_total || 0);
      const usuariosPro = Number(contagens.usuarios_pro || 0);

      res.json({
        metricas: {
          usuarios_total: usuariosTotal,
          usuarios_free: Math.max(0, usuariosTotal - usuariosPro),
          usuarios_pro: usuariosPro,
          assinaturas_ativas: Number(contagens.assinaturas_ativas || 0),
          assinaturas_past_due: Number(contagens.assinaturas_past_due || 0),
          mrr_centavos: mrr.centavos,
          moeda: "BRL"
        },
        uso: {
          execucoes_mes: Number(uso.execucoes_mes || 0),
          usuarios_que_executaram: Number(uso.usuarios_que_executaram || 0)
        },
        eventos_recentes: eventos,
        avisos
      });
    } catch (error) {
      console.error("Erro ao montar dashboard administrativo:", error.message);
      res.status(500).json({ erro: "Não foi possível carregar as métricas administrativas." });
    }
  });

  return router;
}

const router = createAdminRouter();
router.createAdminRouter = createAdminRouter;
module.exports = router;