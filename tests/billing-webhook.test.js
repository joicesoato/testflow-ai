const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const mysql = require("mysql2/promise");

const webhookSecret = "unit-test-webhook-secret";
let state;
const connection = {
  async beginTransaction() {
    state.pending = { event: false, plan: null, status: null };
  },
  async execute(sql, params = []) {
    if (sql.includes("SELECT id FROM stripe_eventos")) {
      return [state.eventCommitted ? [{ id: 1 }] : [], []];
    }
    if (sql.includes("INSERT INTO stripe_eventos")) {
      state.pending.event = true;
      return [{ insertId: 1 }, []];
    }
    if (sql.includes("SELECT id FROM assinaturas WHERE stripe_subscription_id")) {
      return [state.subscriptionExists ? [{ id: 3 }] : [], []];
    }
    if (sql.includes("UPDATE assinaturas SET plano='free', status='past_due'")) {
      if (state.failUpdate) throw new Error("database write failed");
      state.pending.plan = "free";
      state.pending.status = "past_due";
      state.pending.subscriptionId = params[0];
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Consulta inesperada no teste: ${sql}`);
  },
  async commit() {
    state.eventCommitted = state.pending.event;
    if (state.pending.status) {
      state.plan = state.pending.plan;
      state.status = state.pending.status;
      state.subscriptionId = state.pending.subscriptionId;
    }
    state.pending = null;
  },
  async rollback() { state.pending = null; },
  release() {}
};
const pool = { async getConnection() { return connection; } };

const originalCreatePool = mysql.createPool;
mysql.createPool = () => pool;
process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
const billingRouter = require("../routes/billing");
mysql.createPool = originalCreatePool;

const webhookHandler = billingRouter.stack
  .find(layer => layer.route?.path === "/webhook")
  .route.stack[0].handle;

function makeRequest(event, timestamp = Math.floor(Date.now() / 1000)) {
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = crypto.createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");
  return {
    rawBody,
    get(name) { return name.toLowerCase() === "stripe-signature" ? `t=${timestamp},v1=${signature}` : undefined; }
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
}

function failedInvoiceEvent(id = "evt_test_invoice_failed") {
  return { id, type: "invoice.payment_failed", data: { object: { subscription: "sub_test_123", customer: "cus_test_123" } } };
}

test.beforeEach(() => {
  state = {
    eventCommitted: false,
    subscriptionExists: true,
    failUpdate: false,
    pending: null,
    plan: "pro",
    status: "active"
  };
});

test("invoice.payment_failed marca a assinatura como Free e past_due", async () => {
  const response = makeResponse();
  await webhookHandler(makeRequest(failedInvoiceEvent()), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { recebido: true });
  assert.equal(state.plan, "free");
  assert.equal(state.status, "past_due");
  assert.equal(state.subscriptionId, "sub_test_123");
  assert.equal(state.eventCommitted, true);
});

test("rollback após falha deixa o mesmo evento disponível para retry", async () => {
  state.failUpdate = true;
  const event = failedInvoiceEvent("evt_test_retry");
  const failedResponse = makeResponse();
  await webhookHandler(makeRequest(event), failedResponse);

  assert.equal(failedResponse.statusCode, 500);
  assert.equal(state.eventCommitted, false);
  assert.equal(state.status, "active");

  state.failUpdate = false;
  const retryResponse = makeResponse();
  await webhookHandler(makeRequest(event), retryResponse);
  assert.equal(retryResponse.statusCode, 200);
  assert.equal(state.eventCommitted, true);
  assert.equal(state.status, "past_due");
});

test("webhook mantém verificação HMAC e rejeita assinatura inválida", async () => {
  const request = makeRequest(failedInvoiceEvent());
  request.get = () => "t=1,v1=invalid";
  const response = makeResponse();

  await webhookHandler(request, response);

  assert.equal(response.statusCode, 400);
  assert.equal(state.eventCommitted, false);
});