const express = require("express");
const mysql = require("mysql2/promise");
const Stripe = require("stripe");

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

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error("A cobrança ainda não está configurada neste ambiente.");
    error.status = 503;
    throw error;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function autenticar(req, res, next) {
  const authorization = req.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Faça login para acessar a cobrança." });
  }
  try {
    const response = await fetch(`${AUTH_URL}/authorize`, {
      headers: { Authorization: authorization, "X-Internal-Secret": INTERNAL_SECRET },
      signal: AbortSignal.timeout(5000)
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return res.status(401).json({ erro: "Sessão inválida ou expirada." });
    if (!response.ok || !data.autenticado) return res.status(503).json({ erro: "Não foi possível validar sua sessão." });
    req.usuario = data.usuario;
    next();
  } catch {
    res.status(503).json({ erro: "Serviço de autenticação indisponível." });
  }
}

function periodoUnix(value) {
  return value ? new Date(value * 1000) : null;
}

async function salvarAssinatura(subscription, customerId) {
  const userId = Number(subscription.metadata?.userId);
  let usuarioId = Number.isInteger(userId) && userId > 0 ? userId : null;
  if (!usuarioId) {
    const [rows] = await pool.execute(
      "SELECT usuario_id FROM assinaturas WHERE stripe_customer_id = ?",
      [String(customerId)]
    );
    usuarioId = rows[0]?.usuario_id || null;
  }
  if (!usuarioId) {
    console.error("Assinatura Stripe sem usuário associado:", subscription.id);
    return;
  }
  const item = subscription.items?.data?.[0];
  await pool.execute(
    `INSERT INTO assinaturas
      (usuario_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plano, status,
       periodo_inicio, periodo_fim, cancelar_no_fim)
     VALUES (?, ?, ?, ?, 'pro', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       stripe_customer_id=VALUES(stripe_customer_id),
       stripe_subscription_id=VALUES(stripe_subscription_id),
       stripe_price_id=VALUES(stripe_price_id),
       plano=IF(VALUES(status) IN ('active','trialing','past_due'), 'pro', 'free'),
       status=VALUES(status), periodo_inicio=VALUES(periodo_inicio),
       periodo_fim=VALUES(periodo_fim), cancelar_no_fim=VALUES(cancelar_no_fim)`,
    [usuarioId, String(customerId), subscription.id, item?.price?.id || null,
      subscription.status, periodoUnix(subscription.current_period_start),
      periodoUnix(subscription.current_period_end), Boolean(subscription.cancel_at_period_end)]
  );
}

router.post("/webhook", async (req, res) => {
  let event;
  try {
    const stripe = stripeClient();
    const signature = req.get("stripe-signature");
    if (!signature || !req.rawBody) return res.status(400).send("Assinatura Stripe ausente.");
    event = stripe.webhooks.constructEvent(req.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET || "");
  } catch (error) {
    return res.status(400).send(`Webhook inválido: ${error.message}`);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      "SELECT id FROM stripe_eventos WHERE stripe_event_id = ? FOR UPDATE",
      [event.id]
    );
    if (existing.length) {
      await connection.commit();
      return res.json({ recebido: true, duplicado: true });
    }
    await connection.execute(
      "INSERT INTO stripe_eventos (stripe_event_id, tipo) VALUES (?, ?)",
      [event.id, event.type]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return res.json({ recebido: true, duplicado: true });
    console.error("Falha ao registrar evento Stripe:", error.message);
    return res.status(500).json({ erro: "Não foi possível registrar o evento." });
  } finally {
    connection.release();
  }

  try {
    if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object;
      await salvarAssinatura(subscription, subscription.customer);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.subscription) {
        const subscription = await stripeClient().subscriptions.retrieve(session.subscription);
        await salvarAssinatura(subscription, session.customer);
      }
    } else if (event.type === "customer.deleted") {
      await pool.execute(
        "UPDATE assinaturas SET plano='free', status='canceled' WHERE stripe_customer_id=?",
        [String(event.data.object.id)]
      );
    }
    res.json({ recebido: true });
  } catch (error) {
    console.error("Falha ao processar evento Stripe:", error.message);
    // Remove o marcador para permitir reprocessamento seguro pelo Stripe.
    await pool.execute("DELETE FROM stripe_eventos WHERE stripe_event_id = ?", [event.id]).catch(() => {});
    res.status(500).json({ erro: "Falha ao processar evento de cobrança." });
  }
});

router.use(autenticar);

router.get("/status", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT plano, status, periodo_fim, cancelar_no_fim FROM assinaturas WHERE usuario_id = ?",
      [req.usuario.id]
    );
    const item = rows[0] || { plano: "free", status: "inactive", periodo_fim: null, cancelar_no_fim: false };
    const ativo = ["active", "trialing"].includes(item.status);
    res.json({ assinatura: { ...item, plano: ativo ? item.plano : "free" } });
  } catch (error) {
    console.error("Erro ao consultar assinatura:", error.message);
    res.status(500).json({ erro: "Não foi possível consultar sua assinatura." });
  }
});

router.post("/checkout", async (req, res) => {
  try {
    const stripe = stripeClient();
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return res.status(503).json({ erro: "Configure STRIPE_PRICE_ID no servidor." });
    const [rows] = await pool.execute(
      "SELECT stripe_customer_id, status FROM assinaturas WHERE usuario_id = ?",
      [req.usuario.id]
    );
    if (rows[0] && ["active", "trialing"].includes(rows[0].status)) {
      return res.status(409).json({ erro: "Sua assinatura já está ativa. Gerencie-a pelo portal de cobrança." });
    }
    let customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.usuario.email,
        name: req.usuario.nome,
        metadata: { userId: String(req.usuario.id) }
      });
      customerId = customer.id;
      await pool.execute(
        `INSERT INTO assinaturas (usuario_id, stripe_customer_id, plano, status)
         VALUES (?, ?, 'free', 'inactive')
         ON DUPLICATE KEY UPDATE stripe_customer_id=VALUES(stripe_customer_id)`,
        [req.usuario.id, customerId]
      );
    }
    const appUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
    if (!appUrl.startsWith("https://") && process.env.NODE_ENV === "production") {
      return res.status(503).json({ erro: "APP_URL HTTPS precisa estar configurada." });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancel`,
      client_reference_id: String(req.usuario.id),
      metadata: { userId: String(req.usuario.id) },
      subscription_data: { metadata: { userId: String(req.usuario.id) } },
      allow_promotion_codes: true
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error("Erro ao iniciar checkout:", error.message);
    res.status(error.status || 500).json({ erro: error.status ? error.message : "Não foi possível iniciar a assinatura." });
  }
});

router.post("/portal", async (req, res) => {
  try {
    const stripe = stripeClient();
    const [rows] = await pool.execute(
      "SELECT stripe_customer_id FROM assinaturas WHERE usuario_id = ?",
      [req.usuario.id]
    );
    if (!rows[0]?.stripe_customer_id) return res.status(404).json({ erro: "Nenhum cadastro de cobrança encontrado." });
    const appUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
    const session = await stripe.billingPortal.sessions.create({
      customer: rows[0].stripe_customer_id,
      return_url: `${appUrl}/billing`
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error("Erro ao abrir portal Stripe:", error.message);
    res.status(error.status || 500).json({ erro: error.status ? error.message : "Não foi possível abrir o portal de cobrança." });
  }
});

module.exports = router;
