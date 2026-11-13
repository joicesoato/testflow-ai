const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const test = require("node:test");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-bytes-long";
process.env.INTERNAL_SERVICE_SECRET = "test-internal-secret-that-is-at-least-32-bytes";
process.env.EMAIL_VERIFICATION_REQUIRED = "true";
process.env.APP_URL = "http://testflow.example";

let state;

function cloneMap(map) {
  return new Map([...map].map(([key, value]) => [key, { ...value }]));
}

function createState() {
  return {
    usersByEmail: new Map(),
    usersById: new Map(),
    resetTokens: new Map(),
    mails: [],
    mailFailure: false,
    rotateTokenBeforeConfirmation: null,
    nextUserId: 1
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function execute(sql, params = []) {
  const query = sql.replace(/\s+/g, " ").trim().toLowerCase();

  if (query.startsWith("select id, nome, email, email_verificado from usuarios where email = ?")) {
    const user = state.usersByEmail.get(params[0]);
    return Promise.resolve([user ? [{ ...user }] : [], []]);
  }
  if (query.startsWith("select id, nome, email from usuarios where email = ? and email_verificado = false")) {
    const user = state.usersByEmail.get(params[0]);
    return Promise.resolve([user && !user.email_verificado ? [{ ...user }] : [], []]);
  }
  if (query.startsWith("select id, nome, email from usuarios where email = ?")) {
    const user = state.usersByEmail.get(params[0]);
    return Promise.resolve([user ? [{ ...user }] : [], []]);
  }
  if (query.startsWith("insert into usuarios")) {
    const [nome, email, senha_hash, email_verificado] = params;
    const user = {
      id: state.nextUserId++,
      nome,
      email,
      senha_hash,
      role: "analista",
      email_verificado,
      token_verificacao: null,
      verificationExpiresAt: null
    };
    state.usersByEmail.set(email, user);
    state.usersById.set(user.id, user);
    return Promise.resolve([{ insertId: user.id }, []]);
  }
  if (query.startsWith("update usuarios set token_verificacao = ?")) {
    const [token, id] = params;
    const user = state.usersById.get(id);
    if (!user || user.email_verificado) {
      return Promise.resolve([{ affectedRows: 0 }, []]);
    }
    user.token_verificacao = token;
    user.verificationExpiresAt = Date.now() + 30 * 60 * 1000;
    return Promise.resolve([{ affectedRows: 1 }, []]);
  }
  if (query.startsWith("select id from usuarios where token_verificacao in (?, ?)")) {
    const [hashedToken, legacyToken] = params;
    const user = [...state.usersById.values()].find(candidate =>
      !candidate.email_verificado &&
      candidate.verificationExpiresAt > Date.now() &&
      [hashedToken, legacyToken].includes(candidate.token_verificacao)
    );
    return Promise.resolve([user ? [{ id: user.id }] : [], []]);
  }
  if (query.startsWith("update usuarios set email_verificado = true")) {
    const [id, hashedToken, legacyToken] = params;
    const user = state.usersById.get(id);
    if (user && state.rotateTokenBeforeConfirmation?.userId === id) {
      user.token_verificacao = hashToken(state.rotateTokenBeforeConfirmation.token);
      user.verificationExpiresAt = Date.now() + 30 * 60 * 1000;
      state.rotateTokenBeforeConfirmation = null;
    }

    const hasAtomicTokenCheck = query.includes("token_verificacao in (?, ?)");
    const tokenMatches = !hasAtomicTokenCheck ||
      [hashedToken, legacyToken].includes(user?.token_verificacao);
    const hasAtomicExpiryCheck = query.includes("verificacao_expira_em > now()");
    const isUnexpired = !hasAtomicExpiryCheck || user?.verificationExpiresAt > Date.now();
    if (!user || user.email_verificado || !tokenMatches || !isUnexpired) {
      return Promise.resolve([{ affectedRows: 0 }, []]);
    }
    user.email_verificado = true;
    user.token_verificacao = null;
    user.verificationExpiresAt = null;
    return Promise.resolve([{ affectedRows: 1 }, []]);
  }
  if (query.startsWith("select id, nome, email, senha_hash, role, email_verificado from usuarios")) {
    const user = state.usersByEmail.get(params[0]);
    return Promise.resolve([user ? [{ ...user }] : [], []]);
  }
  if (query.startsWith("update reset_tokens set usado = true where usuario_id = ?")) {
    for (const reset of state.resetTokens.values()) {
      if (reset.usuario_id === params[0] && !reset.usado) reset.usado = true;
    }
    return Promise.resolve([{ affectedRows: 1 }, []]);
  }
  if (query.startsWith("insert into reset_tokens")) {
    const [token, usuario_id] = params;
    state.resetTokens.set(token, {
      usuario_id,
      usado: false,
      expiresAt: Date.now() + 30 * 60 * 1000
    });
    return Promise.resolve([{ insertId: state.resetTokens.size }, []]);
  }
  if (query.startsWith("select usuario_id from reset_tokens")) {
    const reset = state.resetTokens.get(params[0]);
    return Promise.resolve([
      reset && !reset.usado && reset.expiresAt > Date.now()
        ? [{ usuario_id: reset.usuario_id }]
        : [],
      []
    ]);
  }
  if (query.startsWith("update usuarios set senha_hash = ?")) {
    const [senha_hash, id] = params;
    const user = state.usersById.get(id);
    if (user) user.senha_hash = senha_hash;
    return Promise.resolve([{ affectedRows: user ? 1 : 0 }, []]);
  }
  if (query.startsWith("update reset_tokens set usado = true where token = ?")) {
    const reset = state.resetTokens.get(params[0]);
    if (!reset || reset.usado) return Promise.resolve([{ affectedRows: 0 }, []]);
    reset.usado = true;
    return Promise.resolve([{ affectedRows: 1 }, []]);
  }

  return Promise.reject(new Error(`Unexpected test query: ${query}`));
}

const pool = {
  execute,
  async getConnection() {
    let snapshot;
    return {
      async beginTransaction() {
        snapshot = {
          usersByEmail: cloneMap(state.usersByEmail),
          usersById: cloneMap(state.usersById),
          resetTokens: cloneMap(state.resetTokens)
        };
      },
      execute,
      async commit() { snapshot = null; },
      async rollback() {
        if (!snapshot) return;
        state.usersByEmail = snapshot.usersByEmail;
        state.usersById = snapshot.usersById;
        state.resetTokens = snapshot.resetTokens;
        snapshot = null;
      },
      release() {}
    };
  }
};

const originalLoad = Module._load;
Module._load = function loadWithMailStub(request, parent, isMain) {
  if (request === "mysql2/promise") {
    return { createPool: () => pool };
  }
  if (request === "nodemailer") {
    return {
      createTransport: () => ({
        async sendMail(mail) {
          if (state.mailFailure) throw new Error("mail transport failed");
          state.mails.push(mail);
          return { accepted: [mail.to] };
        }
      })
    };
  }
  if (request === "jsonwebtoken") {
    return {
      sign: () => "test-jwt",
      verify: () => ({ id: 1 })
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { app } = require("../auth-service/index");
Module._load = originalLoad;

app.set("trust proxy", 1);
let server;
let baseUrl;
let requestIp = 1;

test.before(async () => {
  state = createState();
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())
  );
});

test.beforeEach(() => {
  state = createState();
});

async function request(path, { method = "POST", body, ip = requestIp++ } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `198.18.${Math.floor(ip / 254)}.${(ip % 254) + 1}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { response, data };
}

function confirmationToken(mail = state.mails.at(-1)) {
  return mail.html.match(/verify-email\?token=([a-f\d]{64})/i)?.[1];
}

function resetToken(mail = state.mails.at(-1)) {
  return mail.html.match(/reset-password\?token=([a-f\d]{64})/i)?.[1];
}

async function createUnverifiedUser(email = "pending@example.com") {
  const { response } = await request("/register", {
    body: { nome: "Pessoa", email, senha: "senha-segura-123" }
  });
  assert.equal(response.status, 201);
  return state.usersByEmail.get(email);
}

function addResetToken(user, token, { expired = false, used = false } = {}) {
  state.resetTokens.set(hashToken(token), {
    usuario_id: user.id,
    usado: used,
    expiresAt: expired ? Date.now() - 1000 : Date.now() + 60_000
  });
}

test("cadastro novo cria a conta e armazena somente o hash do token de confirmação", async () => {
  const { response, data } = await request("/register", {
    body: { nome: "Pessoa", email: "novo@example.com", senha: "senha-segura-123" }
  });

  assert.equal(response.status, 201);
  assert.match(data.mensagem, /e-mail de confirmação/);
  assert.equal(state.mails.length, 1);
  const user = state.usersByEmail.get("novo@example.com");
  const rawToken = confirmationToken();
  assert.ok(rawToken);
  assert.equal(user.token_verificacao, hashToken(rawToken));
  assert.notEqual(user.token_verificacao, rawToken);
  assert.equal(user.email_verificado, false);
});

test("cadastro de e-mail pendente reenvia e invalida o token anterior", async () => {
  const user = await createUnverifiedUser();
  const oldToken = confirmationToken();
  const oldHash = user.token_verificacao;

  const { response, data } = await request("/register", {
    body: { nome: "Outro nome", email: user.email, senha: "outra-senha-123" }
  });

  assert.equal(response.status, 200);
  assert.match(data.mensagem, /aguardando confirmação/);
  assert.equal(state.usersByEmail.size, 1);
  assert.equal(state.mails.length, 2);
  assert.notEqual(user.token_verificacao, oldHash);
  assert.equal(user.token_verificacao, hashToken(confirmationToken()));
  const oldResponse = await request(`/verify-email?token=${oldToken}`, { method: "GET" });
  assert.equal(oldResponse.response.status, 400);
});

test("cadastro de e-mail já confirmado orienta entrar ou recuperar a senha", async () => {
  const user = await createUnverifiedUser("ja-confirmada@example.com");
  user.email_verificado = true;
  const { response, data } = await request("/register", {
    body: { nome: "Pessoa", email: user.email, senha: "senha-segura-123" }
  });

  assert.equal(response.status, 409);
  assert.equal(data.codigo, "ACCOUNT_ALREADY_CONFIRMED");
  assert.match(data.erro, /entre ou recupere sua senha/i);
  assert.equal(state.usersByEmail.size, 1);
});

test("falha no envio não apaga a conta e permite solicitar confirmação novamente", async () => {
  state.mailFailure = true;
  const { response } = await request("/register", {
    body: { nome: "Pessoa", email: "falha-email@example.com", senha: "senha-segura-123" }
  });
  assert.equal(response.status, 503);
  assert.equal(state.usersByEmail.size, 1);

  state.mailFailure = false;
  const resend = await request("/resend-verification", {
    body: { email: "falha-email@example.com" }
  });
  assert.equal(resend.response.status, 200);
  assert.equal(state.mails.length, 1);
});

test("reenvio substitui token expirado e o novo token é armazenado como hash", async () => {
  const user = await createUnverifiedUser();
  const oldToken = confirmationToken();
  user.verificationExpiresAt = Date.now() - 1000;
  const { response, data } = await request("/resend-verification", {
    body: { email: user.email }
  });

  assert.equal(response.status, 200);
  assert.match(data.mensagem, /se houver uma conta aguardando confirmação/i);
  assert.notEqual(user.token_verificacao, hashToken(oldToken));
  assert.equal(user.token_verificacao, hashToken(confirmationToken()));
  assert.equal((await request(`/verify-email?token=${oldToken}`, { method: "GET" })).response.status, 400);
});

test("reenvio com token anterior ainda válido também o invalida", async () => {
  const user = await createUnverifiedUser();
  const oldToken = confirmationToken();

  const { response } = await request("/resend-verification", {
    body: { email: user.email }
  });

  assert.equal(response.status, 200);
  assert.equal((await request(`/verify-email?token=${oldToken}`, { method: "GET" })).response.status, 400);
  const newToken = confirmationToken();
  assert.equal(user.token_verificacao, hashToken(newToken));
  assert.equal((await request(`/verify-email?token=${newToken}`, { method: "GET" })).response.status, 200);
});

test("reenvio para conta confirmada não envia e-mail nem revela o estado da conta", async () => {
  const user = await createUnverifiedUser("confirmada@example.com");
  user.email_verificado = true;
  user.token_verificacao = null;
  const mailCount = state.mails.length;

  const { response, data } = await request("/resend-verification", {
    body: { email: user.email }
  });

  assert.equal(response.status, 200);
  assert.match(data.mensagem, /se houver uma conta/i);
  assert.equal(state.mails.length, mailCount);
});

test("recuperação redefine senha de conta não confirmada sem confirmar o e-mail", async () => {
  const user = await createUnverifiedUser("recuperar@example.com");
  const { response } = await request("/forgot-password", {
    body: { email: user.email }
  });
  assert.equal(response.status, 200);
  const rawToken = resetToken();
  assert.ok(rawToken);
  const storedToken = [...state.resetTokens.keys()][0];
  assert.equal(storedToken, hashToken(rawToken));
  assert.notEqual(storedToken, rawToken);

  const reset = await request("/reset-password", {
    body: { token: rawToken, novaSenha: "nova-senha-456" }
  });
  assert.equal(reset.response.status, 200);
  assert.equal(user.email_verificado, false);

  const login = await request("/login", {
    body: { email: user.email, senha: "nova-senha-456" }
  });
  assert.equal(login.response.status, 403);
  assert.equal(login.data.codigo, "EMAIL_NOT_VERIFIED");
});

test("login continua bloqueado para conta não confirmada", async () => {
  const user = await createUnverifiedUser("login-pendente@example.com");

  const { response, data } = await request("/login", {
    body: { email: user.email, senha: "senha-segura-123" }
  });

  assert.equal(response.status, 403);
  assert.equal(data.codigo, "EMAIL_NOT_VERIFIED");
});

test("confirmação rejeita token expirado, desconhecido e já utilizado", async () => {
  const user = await createUnverifiedUser("confirmar@example.com");
  const expiredToken = confirmationToken();
  user.verificationExpiresAt = Date.now() - 1000;
  assert.equal((await request(`/verify-email?token=${expiredToken}`, { method: "GET" })).response.status, 400);
  assert.equal((await request(`/verify-email?token=${"a".repeat(64)}`, { method: "GET" })).response.status, 400);

  user.verificationExpiresAt = Date.now() + 30_000;
  const validToken = confirmationToken();
  assert.equal((await request(`/verify-email?token=${validToken}`, { method: "GET" })).response.status, 200);
  assert.equal(user.email_verificado, true);
  assert.equal((await request(`/verify-email?token=${validToken}`, { method: "GET" })).response.status, 400);
});

test("confirmação é atômica e não aceita token rotacionado entre leitura e atualização", async () => {
  const user = await createUnverifiedUser("corrida-confirmacao@example.com");
  const oldToken = confirmationToken();
  const replacementToken = "e".repeat(64);
  state.rotateTokenBeforeConfirmation = { userId: user.id, token: replacementToken };

  const oldResponse = await request(`/verify-email?token=${oldToken}`, { method: "GET" });

  assert.equal(oldResponse.response.status, 400);
  assert.equal(user.email_verificado, false);
  assert.equal(user.token_verificacao, hashToken(replacementToken));

  const replacementResponse = await request(
    `/verify-email?token=${replacementToken}`,
    { method: "GET" }
  );
  assert.equal(replacementResponse.response.status, 200);
  assert.equal(user.email_verificado, true);
});

test("confirmação mantém compatibilidade com token legado em texto puro", async () => {
  const user = await createUnverifiedUser("legado-confirmacao@example.com");
  const legacyToken = "f".repeat(64);
  user.token_verificacao = legacyToken;
  user.verificationExpiresAt = Date.now() + 30_000;

  const { response } = await request(
    `/verify-email?token=${legacyToken}`,
    { method: "GET" }
  );

  assert.equal(response.status, 200);
  assert.equal(user.email_verificado, true);
});

test("redefinição rejeita token expirado, desconhecido e reutilizado", async () => {
  const user = await createUnverifiedUser("reset-token@example.com");
  const expiredToken = "b".repeat(64);
  addResetToken(user, expiredToken, { expired: true });
  const invalidToken = "c".repeat(64);
  const reusedToken = "d".repeat(64);
  addResetToken(user, reusedToken, { used: true });

  for (const token of [expiredToken, invalidToken, reusedToken]) {
    const { response } = await request("/reset-password", {
      body: { token, novaSenha: "senha-nova-456" }
    });
    assert.equal(response.status, 400);
  }
});

test("limita tentativas de reenvio de confirmação", async () => {
  const ip = 250;
  let lastResponse;
  for (let attempt = 0; attempt < 21; attempt += 1) {
    lastResponse = await request("/resend-verification", {
      ip,
      body: { email: "inexistente@example.com" }
    });
  }
  assert.equal(lastResponse.response.status, 429);
});
