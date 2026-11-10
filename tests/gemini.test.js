const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MODEL_CACHE_TTL_MS,
  clearModelCache,
  generateContentWithFallback,
  getAvailableModels,
  selectGeminiModels
} = require("../services/gemini");

const supportedModels = [
  { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
  { name: "models/gemini-2.5-audio", supportedGenerationMethods: ["generateContent"] }
];

function modelsResponse(models = supportedModels) {
  return Response.json({ models });
}

test("seleciona modelo configurado somente quando listado e compatível", () => {
  assert.deepEqual(
    selectGeminiModels(supportedModels, "gemini-2.5-pro"),
    ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"]
  );
  assert.deepEqual(
    selectGeminiModels(supportedModels, "gemini-3.8-flash"),
    ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]
  );
  assert.equal(MODEL_CACHE_TTL_MS, 15 * 60 * 1000);
});

test("tenta o próximo modelo em 404, 429 e 5xx", async t => {
  for (const status of [404, 429, 503]) {
    await t.test(`fallback após HTTP ${status}`, async () => {
      clearModelCache();
      const generationModels = [];
      const fetchImpl = async (input, options) => {
        const url = new URL(input);
        if (options.method === "GET") {
          assert.equal(url.pathname, "/v1beta/models");
          assert.equal(url.searchParams.get("key"), "unit-test-key");
          return modelsResponse();
        }
        const model = decodeURIComponent(url.pathname.split("/").at(-1).replace(":generateContent", ""));
        generationModels.push(model);
        return generationModels.length === 1
          ? Response.json({ error: { status: "UNAVAILABLE" } }, { status })
          : Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
      };

      const result = await generateContentWithFallback("prompt", "unit-test-key", "gemini-3.8-flash", { fetchImpl });
      assert.equal(result.model, "gemini-2.5-flash-lite");
      assert.deepEqual(generationModels, ["gemini-2.5-flash", "gemini-2.5-flash-lite"]);
    });
  }
});

test("continua para a próxima alternativa após duas falhas transitórias", async () => {
  clearModelCache();
  let generationAttempts = 0;
  const fetchImpl = async (_input, options) => {
    if (options.method === "GET") return modelsResponse();
    generationAttempts += 1;
    return generationAttempts < 3
      ? Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 })
      : Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
  };

  const result = await generateContentWithFallback("prompt", "third-model-test-key", "", { fetchImpl });
  assert.equal(result.model, "gemini-2.5-pro");
  assert.equal(generationAttempts, 3);
});

test("não tenta outro modelo após erro de autenticação", async () => {
  clearModelCache();
  let generationAttempts = 0;
  const fetchImpl = async (_input, options) => {
    if (options.method === "GET") return modelsResponse();
    generationAttempts += 1;
    return Response.json({ error: { status: "PERMISSION_DENIED" } }, { status: 403 });
  };

  await assert.rejects(
    generateContentWithFallback("prompt", "unit-test-key", "", { fetchImpl }),
    error => error.code === "GEMINI_AUTH"
  );
  assert.equal(generationAttempts, 1);
});

test("tenta o próximo modelo após timeout de uma tentativa", async () => {
  clearModelCache();
  const generationModels = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    if (options.method === "GET") return modelsResponse();
    generationModels.push(url.pathname);
    if (generationModels.length === 1) {
      throw new DOMException("request timeout", "TimeoutError");
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
  };

  const result = await generateContentWithFallback("prompt", "timeout-test-key", "", { fetchImpl });
  assert.equal(result.model, "gemini-2.5-flash-lite");
  assert.equal(generationModels.length, 2);
});

test("retorna erro claro se a consulta ao catálogo falhar", async () => {
  clearModelCache();
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 });
  };

  await assert.rejects(
    generateContentWithFallback("prompt", "catalog-test-key", "", { fetchImpl }),
    error => error.code === "GEMINI_MODELS_UNAVAILABLE" && /modelos disponíveis/.test(error.message)
  );
  assert.equal(requests, 1);
});

test("reutiliza o catálogo dentro do período de cache", async () => {
  clearModelCache();
  let catalogRequests = 0;
  const fetchImpl = async (_input, options) => {
    if (options.method === "GET") {
      catalogRequests += 1;
      return modelsResponse();
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
  };

  await generateContentWithFallback("prompt", "cache-test-key", "", { fetchImpl });
  await generateContentWithFallback("prompt", "cache-test-key", "", { fetchImpl });
  assert.equal(catalogRequests, 1);
});

test("atualiza o catálogo após 15 minutos", async () => {
  clearModelCache();
  let catalogRequests = 0;
  let currentTime = 1000;
  const fetchImpl = async () => {
    catalogRequests += 1;
    return modelsResponse();
  };
  const options = { fetchImpl, now: () => currentTime, deadline: 1000 + MODEL_CACHE_TTL_MS + 1000 };

  await getAvailableModels("expiry-test-key", options);
  currentTime += MODEL_CACHE_TTL_MS;
  await getAvailableModels("expiry-test-key", options);
  assert.equal(catalogRequests, 2);
});