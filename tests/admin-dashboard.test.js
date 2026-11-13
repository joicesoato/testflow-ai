const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");
const adminRouterModule = require("../routes/admin");

const createAdminRouter = adminRouterModule.createAdminRouter;

function createDependencies({ role = "admin", permissions, logsDown = false } = {}) {
  const queries = [];
  const fetchCalls = [];
  const pool = {
    async execute(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes("usuarios_total")) {
        return [[{ usuarios_total: 12, usuarios_pro: 2, assinaturas_ativas: 2, assinaturas_past_due: 1 }], []];
      }
      if (sql.includes("execucoes_mes")) {
        return [[{ execucoes_mes: 44, usuarios_que_executaram: 7 }], []];
      }
      if (sql.includes("stripe_price_id")) return [[{ quantidade: 2 }], []];
      throw new Error("Consulta SQL inesperada no teste.");
    }
  };
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    fetchCalls.push({ url, options });
    if (url.pathname === "/authorize") {
      return Response.json({
        autenticado: true,
        usuario: { id: 8, role },
        permissoes: permissions || (role === "admin" ? ["logs:read"] : [])
      });
    }
    if (url.pathname === "/v1/prices/price_test_monthly") {
      return Response.json({ currency: "brl", unit_amount: 2500, recurring: { interval: "month", interval_count: 1 } });
    }
    if (url.pathname === "/logs") {
      if (logsDown) return Response.json({ erro: "indisponível" }, { status: 503 });
      return Response.json({ logs: Array.from({ length: 12 }, (_, index) => ({
        id: `stream-${index}`,
        usuario_id: 8,
        acao: `evento.${index}`,
        timestamp: `2026-11-10T00:00:${String(index).padStart(2, "0")}.000Z`,
        detalhes: { ordem: index }
      })) });
    }
    throw new Error(`Endpoint externo inesperado: ${url.pathname}`);
  };
  const router = createAdminRouter({
    pool,
    fetchImpl,
    authUrl: "http://auth.test",
    logUrl: "http://logs.test",
    internalSecret: "test-internal-secret",
    stripeSecretKey: "sk_test_fixture_only",
    stripePriceId: "price_test_monthly"
  });
  return { router, queries, fetchCalls };
}

async function requestDashboard(dependencies, { token = "test-jwt", query = "" } = {}) {
  const app = express();
  app.use("/api/admin", dependencies.router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/dashboard${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return { status: response.status, data: await response.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("dashboard exige autenticação e retorna 401 sem token", async () => {
  const dependencies = createDependencies();
  const response = await requestDashboard(dependencies, { token: "" });
  assert.equal(response.status, 401);
  assert.equal(dependencies.fetchCalls.length, 0);
  assert.equal(dependencies.queries.length, 0);
});

test("dashboard nega usuário comum mesmo com role admin enviada na URL", async () => {
  const dependencies = createDependencies({ role: "analista" });
  const response = await requestDashboard(dependencies, { query: "?role=admin&usuario_id=8" });
  assert.equal(response.status, 403);
  assert.equal(dependencies.queries.length, 0);
});

test("dashboard requer permissões do serviço de autenticação", async () => {
  const dependencies = createDependencies({ role: "admin", permissions: [] });
  const response = await requestDashboard(dependencies);
  assert.equal(response.status, 403);
  assert.equal(dependencies.queries.length, 0);
});

test("admin recebe métricas reais, MRR Stripe e os dez eventos recentes", async () => {
  const dependencies = createDependencies();
  const response = await requestDashboard(dependencies);

  assert.equal(response.status, 200);
  assert.deepEqual(response.data.metricas, {
    usuarios_total: 12,
    usuarios_free: 10,
    usuarios_pro: 2,
    assinaturas_ativas: 2,
    assinaturas_past_due: 1,
    mrr_centavos: 5000,
    moeda: "BRL"
  });
  assert.deepEqual(response.data.uso, { execucoes_mes: 44, usuarios_que_executaram: 7 });
  assert.equal(response.data.eventos_recentes.length, 10);
  assert.equal(response.data.eventos_recentes[0].id, "stream-0");
  assert.equal(response.data.eventos_recentes[0].detalhes.ordem, 0);
  assert.deepEqual(response.data.avisos, []);
  assert.ok(dependencies.fetchCalls.some(call => call.url.pathname === "/logs" && call.url.searchParams.get("limit") === "10"));
});

test("dashboard mantém métricas quando o serviço de logs está indisponível", async () => {
  const dependencies = createDependencies({ logsDown: true });
  const response = await requestDashboard(dependencies);

  assert.equal(response.status, 200);
  assert.equal(response.data.metricas.usuarios_total, 12);
  assert.deepEqual(response.data.eventos_recentes, []);
  assert.match(response.data.avisos[0], /eventos está indisponível/);
});