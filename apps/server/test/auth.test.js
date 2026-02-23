const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

const { authenticate, requireAdmin, generateToken } = require("../src/middleware/auth");

// Helpers para simular req/res/next do Express
function createMockRes() {
  let statusCode = 200;
  let body = null;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      body = data;
      return this;
    },
    get statusCode() { return statusCode; },
    get body() { return body; }
  };
}

test("generateToken gera token JWT valido", () => {
  const user = { id: 1, email: "admin@test.com", role: "admin" };
  const token = generateToken(user);

  assert.ok(typeof token === "string");
  assert.ok(token.split(".").length === 3, "JWT deve ter 3 partes");

  const payload = jwt.verify(token, JWT_SECRET);
  assert.equal(payload.id, user.id);
  assert.equal(payload.email, user.email);
  assert.equal(payload.role, user.role);
});

test("generateToken define expiracao de 24h", () => {
  const user = { id: 1, email: "admin@test.com", role: "admin" };
  const token = generateToken(user);
  const payload = jwt.decode(token);

  const diffSeconds = payload.exp - payload.iat;
  assert.equal(diffSeconds, 24 * 60 * 60, "token deve expirar em 24h");
});

test("authenticate passa com token valido e popula req.user", () => {
  const user = { id: 5, email: "user@test.com", role: "user" };
  const token = generateToken(user);

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockRes();
  let nextCalled = false;

  authenticate(req, res, () => { nextCalled = true; });

  assert.ok(nextCalled, "next() deve ser chamado");
  assert.deepEqual(req.user, { id: 5, email: "user@test.com", role: "user" });
});

test("authenticate rejeita sem header Authorization", () => {
  const req = { headers: {} };
  const res = createMockRes();
  let nextCalled = false;

  authenticate(req, res, () => { nextCalled = true; });

  assert.ok(!nextCalled, "next() não deve ser chamado");
  assert.equal(res.statusCode, 401);
  assert.ok(res.body.message.includes("Token"));
});

test("authenticate rejeita com header sem Bearer", () => {
  const req = { headers: { authorization: "Basic abc123" } };
  const res = createMockRes();
  let nextCalled = false;

  authenticate(req, res, () => { nextCalled = true; });

  assert.ok(!nextCalled);
  assert.equal(res.statusCode, 401);
});

test("authenticate rejeita com token invalido", () => {
  const req = { headers: { authorization: "Bearer token.invalido.aqui" } };
  const res = createMockRes();
  let nextCalled = false;

  authenticate(req, res, () => { nextCalled = true; });

  assert.ok(!nextCalled);
  assert.equal(res.statusCode, 401);
  assert.ok(res.body.message.includes("inválido"));
});

test("authenticate rejeita com token expirado", () => {
  const token = jwt.sign(
    { id: 1, email: "user@test.com", role: "user" },
    JWT_SECRET,
    { expiresIn: "0s" }
  );

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockRes();
  let nextCalled = false;

  authenticate(req, res, () => { nextCalled = true; });

  assert.ok(!nextCalled);
  assert.equal(res.statusCode, 401);
});

test("requireAdmin passa com role admin", () => {
  const req = { user: { id: 1, role: "admin" } };
  const res = createMockRes();
  let nextCalled = false;

  requireAdmin(req, res, () => { nextCalled = true; });

  assert.ok(nextCalled, "next() deve ser chamado para admin");
});

test("requireAdmin rejeita com role user", () => {
  const req = { user: { id: 2, role: "user" } };
  const res = createMockRes();
  let nextCalled = false;

  requireAdmin(req, res, () => { nextCalled = true; });

  assert.ok(!nextCalled, "next() não deve ser chamado para user");
  assert.equal(res.statusCode, 403);
  assert.ok(res.body.message.includes("administradores"));
});

test("requireAdmin rejeita sem user no req", () => {
  const req = {};
  const res = createMockRes();
  let nextCalled = false;

  requireAdmin(req, res, () => { nextCalled = true; });

  assert.ok(!nextCalled);
  assert.equal(res.statusCode, 403);
});
