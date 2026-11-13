const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createFreeExecutionLimit } = require("../services/execution-limit");

function createHarness({ subscription, count = 0, lockAcquired = 1, failQuery } = {}) {
  const statements = [];
  let connectionReleased = false;
  const connection = {
    async execute(sql) {
      statements.push(sql);
      if (failQuery && sql.includes(failQuery)) throw new Error("database unavailable");
      if (sql.includes("GET_LOCK")) return [[{ adquirido: lockAcquired }], []];
      if (sql.includes("assinaturas")) return [subscription ? [subscription] : [], []];
      if (sql.includes("COUNT(*)")) return [[{ total: count }], []];
      return [[{ released: 1 }], []];
    },
    release() { connectionReleased = true; }
  };
  const pool = { async getConnection() { return connection; } };
  const req = { usuario: { id: 21 } };
  const res = new EventEmitter();
  res.headersSent = false;
  res.statusCode = null;
  res.body = null;
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  return {
    middleware: createFreeExecutionLimit(pool), req, res, statements,
    isConnectionReleased: () => connectionReleased
  };
}

test("bloqueia a quarta execução mensal do plano Free", async () => {
  const harness = createHarness({ count: 3 });
  let proceeded = false;

  await harness.middleware(harness.req, harness.res, () => { proceeded = true; });

  assert.equal(harness.res.statusCode, 403);
  assert.match(harness.res.body.erro, /3 execuções por mês/);
  assert.match(harness.res.body.erro, /Pro/);
  assert.equal(proceeded, false);
  assert.equal(harness.isConnectionReleased(), true);
  assert.ok(harness.statements.some(sql => sql.includes("COUNT(*)")));
  assert.ok(!harness.statements.find(sql => sql.includes("COUNT(*)")).includes("modo_execucao"));
});

test("permite Free abaixo do limite e libera lock ao concluir a resposta", async () => {
  const harness = createHarness({ count: 2 });
  let proceeded = false;

  await harness.middleware(harness.req, harness.res, () => { proceeded = true; });

  assert.equal(proceeded, true);
  assert.equal(harness.isConnectionReleased(), false);
  const finish = harness.res.listeners("finish")[0];
  await finish();
  assert.equal(harness.isConnectionReleased(), true);
});

test("permite Pro sem consultar a contagem mensal", async () => {
  const harness = createHarness({ subscription: { plano: "pro", status: "active" }, count: 99 });
  let proceeded = false;

  await harness.middleware(harness.req, harness.res, () => { proceeded = true; });

  assert.equal(proceeded, true);
  assert.equal(harness.isConnectionReleased(), true);
  assert.ok(!harness.statements.some(sql => sql.includes("COUNT(*)")));
});

test("trata assinatura past_due como Free", async () => {
  const harness = createHarness({ subscription: { plano: "free", status: "past_due" }, count: 3 });

  await harness.middleware(harness.req, harness.res, () => {});

  assert.equal(harness.res.statusCode, 403);
});

test("falha fechado se não conseguir adquirir o lock", async () => {
  const harness = createHarness({ lockAcquired: 0 });

  await harness.middleware(harness.req, harness.res, () => assert.fail("não deveria prosseguir"));

  assert.equal(harness.res.statusCode, 503);
  assert.equal(harness.isConnectionReleased(), true);
});