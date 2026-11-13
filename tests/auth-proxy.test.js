const assert = require("node:assert/strict");
const test = require("node:test");

process.env.AUTH_SERVICE_URL = "http://auth-service.test";
const authRouter = require("../routes/auth");

const handlers = new Map(
  authRouter.stack
    .filter(layer => layer.route)
    .map(layer => [layer.route.path, layer.route.stack[0].handle])
);

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; }
  };
}

for (const path of ["/forgot-password", "/reset-password", "/resend-verification"]) {
  test(`${path} encaminha a solicitação ao auth-service`, async () => {
    const requestBody = path === "/forgot-password"
      ? { email: "pessoa@example.com" }
      : path === "/resend-verification"
        ? { email: "pessoa@example.com" }
        : { token: "reset-token", novaSenha: "nova-senha" };
    const originalFetch = global.fetch;
    let forwardedRequest;
    global.fetch = async (url, options) => {
      forwardedRequest = { url: String(url), options };
      return {
        status: 202,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify({ mensagem: "Solicitação processada." })
      };
    };

    try {
      const response = makeResponse();
      await handlers.get(path)(
        { body: requestBody, query: {} },
        response
      );

      assert.equal(forwardedRequest.url, `http://auth-service.test${path}`);
      assert.equal(forwardedRequest.options.method, "POST");
      assert.equal(forwardedRequest.options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(forwardedRequest.options.body), requestBody);
      assert.equal(response.statusCode, 202);
      assert.equal(response.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(response.body), { mensagem: "Solicitação processada." });
    } finally {
      global.fetch = originalFetch;
    }
  });
}
