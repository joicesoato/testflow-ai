const express = require("express");
const mysql = require("mysql2/promise");
const crypto = require("node:crypto");

const router = express.Router();
const pool = mysql.createPool({
  host: process.env.DB_HOST || "db", port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 8
});
const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:3001";
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";

function stripeRequest(path, options = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { const error = new Error("A cobrança ainda não está configurada neste ambiente."); error.status = 503; throw error; }
  const headers = { Authorization: "Bearer " + key, ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) };
  return fetch("https://api.stripe.com/v1/" + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) });
}
async function stripeData(path, options) {
  const response = await stripeRequest(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error?.message || "A Stripe recusou a operação."); error.status = response.status >= 500 ? 502 : 400; throw error; }
  return data;
}
function formEncode(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.set(key, String(value));
  return params.toString();
}
async function autenticar(req, res, next) {
  const authorization = req.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ erro: "Faça login para acessar a cobrança." });
  try {
    const response = await fetch(AUTH_URL + "/authorize", { headers: { Authorization: authorization, "X-Internal-Secret": INTERNAL_SECRET }, signal: AbortSignal.timeout(5000) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return res.status(401).json({ erro: "Sessão inválida ou expirada." });
    if (!response.ok || !data.autenticado) return res.status(503).json({ erro: "Não foi possível validar sua sessão." });
    req.usuario = data.usuario; next();
  } catch { res.status(503).json({ erro: "Serviço de autenticação indisponível." }); }
}
function unixDate(value) { return value ? new Date(value * 1000) : null; }

async function salvarAssinatura(subscription, customerId, userIdHint, executor = pool) {
  let userId = Number(subscription.metadata?.userId || userIdHint);
  if (!Number.isInteger(userId) || userId <= 0) {
    const [rows] = await executor.execute("SELECT usuario_id FROM assinaturas WHERE stripe_customer_id = ?", [String(customerId)]);
    userId = rows[0]?.usuario_id;
  }
  if (!userId) throw new Error("Assinatura recebida sem usuário associado.");
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const ativo = ["active", "trialing"].includes(subscription.status);
  await executor.execute(
    `INSERT INTO assinaturas (usuario_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plano, status, periodo_inicio, periodo_fim, cancelar_no_fim)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE stripe_customer_id=VALUES(stripe_customer_id), stripe_subscription_id=VALUES(stripe_subscription_id),
     stripe_price_id=VALUES(stripe_price_id), plano=VALUES(plano), status=VALUES(status), periodo_inicio=VALUES(periodo_inicio),
     periodo_fim=VALUES(periodo_fim), cancelar_no_fim=VALUES(cancelar_no_fim)`,
    [userId, String(customerId), subscription.id, priceId, ativo ? "pro" : "free", subscription.status,
      unixDate(subscription.current_period_start), unixDate(subscription.current_period_end), Boolean(subscription.cancel_at_period_end)]
  );
}
function validarWebhook(rawBody, header, secret) {
  if (!rawBody || !header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map(part => part.split("=").map(v => v.trim())));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(String(timestamp) + "." + rawBody.toString("utf8")).digest("hex");
  const a = Buffer.from(expected, "hex"), b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post("/webhook", async (req, res) => {
  if (!validarWebhook(req.rawBody, req.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).send("Assinatura do webhook inválida.");
  }
  let event;
  try { event = JSON.parse(req.rawBody.toString("utf8")); } catch { return res.status(400).send("Evento inválido."); }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute("SELECT id FROM stripe_eventos WHERE stripe_event_id = ? FOR UPDATE", [event.id]);
    if (existing.length) {
      await connection.commit();
      return res.json({ recebido: true, duplicado: true });
    }
    await connection.execute("INSERT INTO stripe_eventos (stripe_event_id, tipo) VALUES (?, ?)", [event.id, event.type]);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.subscription) {
        const subscription = await stripeData("subscriptions/" + session.subscription);
        await salvarAssinatura(subscription, session.customer, Number(session.metadata?.userId || session.client_reference_id), connection);
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object;
      await salvarAssinatura(subscription, subscription.customer, undefined, connection);
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionRef = invoice.subscription || invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscriptionRef === "object" ? subscriptionRef?.id : subscriptionRef;
      const customerId = typeof invoice.customer === "object" ? invoice.customer?.id : invoice.customer;
      if (subscriptionId) {
        const [rows] = await connection.execute(
          "SELECT id FROM assinaturas WHERE stripe_subscription_id=? FOR UPDATE",
          [String(subscriptionId)]
        );
        if (!rows.length) throw new Error("A assinatura da fatura não foi encontrada.");
        await connection.execute(
          "UPDATE assinaturas SET plano='free', status='past_due' WHERE stripe_subscription_id=?",
          [String(subscriptionId)]
        );
      } else if (customerId) {
        const [rows] = await connection.execute(
          "SELECT id FROM assinaturas WHERE stripe_customer_id=? FOR UPDATE",
          [String(customerId)]
        );
        if (!rows.length) throw new Error("A assinatura do cliente da fatura não foi encontrada.");
        await connection.execute(
          "UPDATE assinaturas SET plano='free', status='past_due' WHERE stripe_customer_id=?",
          [String(customerId)]
        );
      } else {
        throw new Error("A fatura não contém referência de assinatura ou cliente.");
      }
    } else if (event.type === "customer.deleted") {
      await connection.execute("UPDATE assinaturas SET plano='free', status='canceled' WHERE stripe_customer_id=?", [String(event.data.object.id)]);
    }
    await connection.commit();
    res.json({ recebido: true });
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("Falha ao processar evento Stripe:", error.message);
    res.status(500).json({ erro: "Falha ao processar evento de cobrança." });
  } finally { connection.release(); }
});

router.use(autenticar);
router.get("/status", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT plano, status, periodo_fim, cancelar_no_fim FROM assinaturas WHERE usuario_id=?", [req.usuario.id]);
    const item = rows[0] || { plano: "free", status: "inactive", periodo_fim: null, cancelar_no_fim: false };
    res.json({ assinatura: { ...item, plano: ["active", "trialing"].includes(item.status) ? item.plano : "free" } });
  } catch (error) { console.error("Erro ao consultar assinatura:", error.message); res.status(500).json({ erro: "Não foi possível consultar sua assinatura." }); }
});
router.post("/checkout", async (req, res) => {
  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return res.status(503).json({ erro: "Configure STRIPE_PRICE_ID no servidor." });
    const [rows] = await pool.execute("SELECT stripe_customer_id, status FROM assinaturas WHERE usuario_id=?", [req.usuario.id]);
    if (rows[0] && ["active", "trialing"].includes(rows[0].status)) return res.status(409).json({ erro: "Sua assinatura já está ativa. Gerencie-a pelo portal." });
    let customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeData("customers", { method: "POST", body: formEncode({ email: req.usuario.email, name: req.usuario.nome, "metadata[userId]": req.usuario.id }) });
      customerId = customer.id;
      await pool.execute("INSERT INTO assinaturas (usuario_id, stripe_customer_id, plano, status) VALUES (?, ?, 'free', 'inactive') ON DUPLICATE KEY UPDATE stripe_customer_id=VALUES(stripe_customer_id)", [req.usuario.id, customerId]);
    }
    const appUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
    if (process.env.NODE_ENV === "production" && !appUrl.startsWith("https://")) return res.status(503).json({ erro: "APP_URL HTTPS precisa estar configurada." });
    const session = await stripeData("checkout/sessions", { method: "POST", body: formEncode({
      mode: "subscription", customer: customerId, "line_items[0][price]": priceId, "line_items[0][quantity]": 1,
      success_url: appUrl + "/billing?checkout=success", cancel_url: appUrl + "/billing?checkout=cancel",
      client_reference_id: req.usuario.id, "metadata[userId]": req.usuario.id, "subscription_data[metadata][userId]": req.usuario.id,
      allow_promotion_codes: true
    }) });
    res.json({ url: session.url });
  } catch (error) { console.error("Erro ao iniciar checkout:", error.message); res.status(error.status || 500).json({ erro: error.status ? error.message : "Não foi possível iniciar a assinatura." }); }
});
router.post("/portal", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT stripe_customer_id FROM assinaturas WHERE usuario_id=?", [req.usuario.id]);
    if (!rows[0]?.stripe_customer_id) return res.status(404).json({ erro: "Nenhum cadastro de cobrança encontrado." });
    const appUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
    const session = await stripeData("billing_portal/sessions", { method: "POST", body: formEncode({ customer: rows[0].stripe_customer_id, return_url: appUrl + "/billing" }) });
    res.json({ url: session.url });
  } catch (error) { console.error("Erro ao abrir portal Stripe:", error.message); res.status(error.status || 500).json({ erro: error.status ? error.message : "Não foi possível abrir o portal." }); }
});
module.exports = router;
