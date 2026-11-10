const { createHash } = require("node:crypto");

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
const MODEL_LIST_TIMEOUT_MS = 5000;
const ATTEMPT_TIMEOUT_MS = 18000;
const TOTAL_TIMEOUT_MS = 40000;
const MAX_ATTEMPTS = 3;
const modelCache = new Map();

function geminiError(code, message, status = 502, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = retryable;
  return error;
}

function normalizeModelName(name) {
  return typeof name === "string" ? name.replace(/^models\//, "") : "";
}

function isTextGenerationModel(name) {
  const normalized = normalizeModelName(name).toLowerCase();
  return normalized.startsWith("gemini-") &&
    !/(image|audio|embedding|embed|tts|text-to-speech|live|robot|veo|imagen|nano)/.test(normalized);
}

function modelPriority(name) {
  const normalized = normalizeModelName(name).toLowerCase();
  const version = normalized.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] || "0";
  const [major, minor = 0] = version.split(".").map(Number);
  const preview = /preview|experimental|exp-/.test(normalized) ? 1 : 0;
  const lite = /flash-lite/.test(normalized) ? 1 : 0;
  return [normalized.includes("flash") ? 0 : 1, preview, -major, -minor, lite, normalized];
}

function selectGeminiModels(models, configuredModel = "") {
  const supported = new Map();
  for (const model of models || []) {
    const name = normalizeModelName(model?.name);
    if (name && model.supportedGenerationMethods?.includes("generateContent") && isTextGenerationModel(name)) {
      supported.set(name, name);
    }
  }

  const prioritized = [...supported.keys()].sort((left, right) => {
    const a = modelPriority(left);
    const b = modelPriority(right);
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] < b[index]) return -1;
      if (a[index] > b[index]) return 1;
    }
    return 0;
  });
  const configured = normalizeModelName(configuredModel);
  if (configured && supported.has(configured)) {
    return [configured, ...prioritized.filter(name => name !== configured)];
  }
  return prioritized;
}

function cacheKey(apiKey) {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function getAvailableModels(apiKey, {
  fetchImpl = fetch,
  deadline,
  now = Date.now,
  bypassCache = false
} = {}) {
  const key = cacheKey(apiKey);
  const cached = modelCache.get(key);
  if (!bypassCache && cached && cached.expiresAt > now()) return cached.models;

  const remaining = deadline - now();
  if (remaining <= 0) {
    throw geminiError("GEMINI_TIMEOUT", "O tempo total para consultar os modelos Gemini foi excedido.", 504, true);
  }

  const url = new URL(`${API_BASE}/models`);
  url.searchParams.set("key", apiKey);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(Math.min(MODEL_LIST_TIMEOUT_MS, remaining))
    });
  } catch (error) {
    const timeout = error.name === "TimeoutError" || error.name === "AbortError";
    throw geminiError(
      timeout ? "GEMINI_MODELS_TIMEOUT" : "GEMINI_MODELS_CONNECTION",
      timeout
        ? "A consulta dos modelos Gemini excedeu o tempo limite. Tente novamente."
        : "Não foi possível conectar à API Gemini para consultar os modelos disponíveis.",
      503,
      true
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw geminiError("GEMINI_AUTH", "A API Gemini recusou a chave ou as permissões configuradas no servidor.", 502);
    }
    throw geminiError("GEMINI_MODELS_UNAVAILABLE", "Não foi possível consultar os modelos disponíveis na API Gemini. Tente novamente mais tarde.", 503, true);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw geminiError("GEMINI_MODELS_INVALID_RESPONSE", "A API Gemini retornou uma lista de modelos inválida.", 502);
  }
  if (!Array.isArray(data?.models)) {
    throw geminiError("GEMINI_MODELS_INVALID_RESPONSE", "A API Gemini retornou uma lista de modelos inválida.", 502);
  }

  modelCache.set(key, { models: data.models, expiresAt: now() + MODEL_CACHE_TTL_MS });
  return data.models;
}

async function generateContentWithFallback(prompt, apiKey, configuredModel = "", {
  fetchImpl = fetch,
  now = Date.now
} = {}) {
  const deadline = now() + TOTAL_TIMEOUT_MS;
  const availableModels = await getAvailableModels(apiKey, { fetchImpl, deadline, now });
  const models = selectGeminiModels(availableModels, configuredModel);
  if (!models.length) {
    throw geminiError("GEMINI_NO_SUPPORTED_MODELS", "A chave configurada não possui modelos Gemini compatíveis com generateContent.", 503);
  }

  let lastError;
  let attempts = 0;
  for (const model of models) {
    if (attempts >= MAX_ATTEMPTS) break;
    const remaining = deadline - now();
    if (remaining <= 0) {
      lastError = geminiError("GEMINI_TIMEOUT", "O tempo total para gerar os casos foi excedido.", 504, true);
      break;
    }
    attempts += 1;
    console.info(`Modelo Gemini selecionado: ${model}.`);

    try {
      const response = await fetchImpl(
        `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
              maxOutputTokens: 4096
            }
          }),
          signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining))
        }
      );

      if (response.ok) return { data: await response.json(), model };
      if (response.status === 401 || response.status === 403) {
        throw geminiError("GEMINI_AUTH", "O Gemini recusou a autenticação. Verifique a chave e as permissões configuradas no servidor.");
      }
      if (response.status === 404) {
        throw geminiError("GEMINI_MODEL_NOT_FOUND", "Um modelo listado não está mais disponível.", 502, true);
      }
      if (response.status === 429) {
        throw geminiError("GEMINI_RATE_LIMIT", "O limite de solicitações da IA foi atingido. Tente novamente mais tarde.", 503, true);
      }
      if (response.status >= 500) {
        throw geminiError("GEMINI_UNAVAILABLE", "O serviço Gemini está temporariamente indisponível.", 503, true);
      }
      throw geminiError("GEMINI_REQUEST_FAILED", "A API Gemini recusou a solicitação. Verifique a configuração do servidor.");
    } catch (error) {
      if (typeof error.retryable === "boolean") {
        lastError = error;
      } else if (error.name === "TimeoutError" || error.name === "AbortError") {
        lastError = geminiError("GEMINI_TIMEOUT", "O Gemini excedeu o tempo limite desta tentativa.", 504, true);
      } else if (error instanceof TypeError) {
        lastError = geminiError("GEMINI_CONNECTION", "Não foi possível conectar ao serviço Gemini.", 503, true);
      } else {
        lastError = geminiError("GEMINI_INVALID_RESPONSE", "O Gemini retornou uma resposta inválida.");
      }
      console.warn(`Tentativa Gemini falhou (${model}): ${lastError.code}.`);
      if (!lastError.retryable) break;
    }
  }

  throw lastError || geminiError("GEMINI_UNAVAILABLE", "Não foi possível gerar os casos com IA.", 503);
}

function clearModelCache() {
  modelCache.clear();
}

module.exports = {
  MODEL_CACHE_TTL_MS,
  clearModelCache,
  generateContentWithFallback,
  getAvailableModels,
  selectGeminiModels
};