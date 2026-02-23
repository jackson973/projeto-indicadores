const test = require("node:test");
const assert = require("node:assert/strict");

// Injetar mock do db/connection ANTES de importar o repository
const { mockDb, setQueryResults, resetMock, getQueryCalls } = require("./helpers/mockDb");
const connectionPath = require.resolve("../src/db/connection");
require.cache[connectionPath] = { id: connectionPath, filename: connectionPath, loaded: true, exports: mockDb };

const usersRepo = require("../src/db/usersRepository");

test("findByEmail retorna usuario quando encontrado", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 1, name: "Admin", email: "admin@test.com", passwordHash: "hash", role: "admin", active: true }] }
  ]);

  const user = await usersRepo.findByEmail("admin@test.com");
  assert.equal(user.email, "admin@test.com");
  assert.equal(user.role, "admin");

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("WHERE email = $1"));
  assert.deepEqual(calls[0].params, ["admin@test.com"]);
});

test("findByEmail retorna null quando nao encontrado", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  const user = await usersRepo.findByEmail("naoexiste@test.com");
  assert.equal(user, null);
});

test("findById retorna usuario por id", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 5, name: "User", email: "user@test.com", role: "user", active: true }] }
  ]);

  const user = await usersRepo.findById(5);
  assert.equal(user.id, 5);
  const calls = getQueryCalls();
  assert.deepEqual(calls[0].params, [5]);
});

test("findAll retorna lista de usuarios", async () => {
  resetMock();
  setQueryResults([
    { rows: [
      { id: 1, name: "Admin", email: "admin@test.com" },
      { id: 2, name: "User", email: "user@test.com" }
    ]}
  ]);

  const users = await usersRepo.findAll();
  assert.equal(users.length, 2);
  assert.equal(users[0].name, "Admin");
});

test("findByWhatsapp gera variantes de telefone brasileiro com 9 digito", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 1, name: "User", whatsapp: "5547991299399" }] }
  ]);

  await usersRepo.findByWhatsapp("5547991299399");

  const calls = getQueryCalls();
  const variants = calls[0].params[0];
  // Deve incluir: com código do país, sem código, sem 9° dígito
  assert.ok(variants.includes("5547991299399"), "deve ter o número original");
  assert.ok(variants.includes("47991299399"), "deve ter sem código do país");
  assert.ok(variants.includes("554791299399"), "deve ter sem 9° dígito com código");
  assert.ok(variants.includes("4791299399"), "deve ter sem 9° dígito sem código");
});

test("findByWhatsapp gera variantes de telefone sem 9 digito", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  await usersRepo.findByWhatsapp("554791299399");

  const calls = getQueryCalls();
  const variants = calls[0].params[0];
  // Número com 10 dígitos (sem 9°) deve gerar variante com 9° dígito
  assert.ok(variants.includes("554791299399"), "deve ter o original");
  assert.ok(variants.includes("4791299399"), "deve ter sem código do país");
  assert.ok(variants.includes("5547991299399"), "deve ter com 9° dígito e código");
  assert.ok(variants.includes("47991299399"), "deve ter com 9° dígito sem código");
});

test("findByWhatsapp remove caracteres nao-digitais do telefone", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  await usersRepo.findByWhatsapp("+55 (47) 99129-9399");

  const calls = getQueryCalls();
  const variants = calls[0].params[0];
  assert.ok(variants.includes("5547991299399"));
});

test("create insere e retorna usuario", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 10, name: "Novo User", email: "novo@test.com", role: "user", active: true, whatsapp: null }] }
  ]);

  const user = await usersRepo.create({
    name: "Novo User",
    email: "novo@test.com",
    passwordHash: "hash123"
  });

  assert.equal(user.id, 10);
  assert.equal(user.name, "Novo User");

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("INSERT INTO users"));
  assert.equal(calls[0].params[0], "Novo User");
  assert.equal(calls[0].params[1], "novo@test.com");
  assert.equal(calls[0].params[2], "hash123");
  assert.equal(calls[0].params[3], "user"); // role default
});

test("create com whatsapp passa o numero", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 11, name: "User WA", email: "wa@test.com", role: "user", active: true, whatsapp: "5547999999999" }] }
  ]);

  await usersRepo.create({
    name: "User WA",
    email: "wa@test.com",
    passwordHash: "hash",
    whatsapp: "5547999999999"
  });

  const calls = getQueryCalls();
  assert.equal(calls[0].params[4], "5547999999999");
});

test("update atualiza campos corretamente", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 1, name: "Admin Updated", email: "admin@test.com", role: "admin", active: true, whatsapp: null }] }
  ]);

  const user = await usersRepo.update(1, {
    name: "Admin Updated",
    email: "admin@test.com",
    role: "admin",
    active: true,
    whatsapp: null
  });

  assert.equal(user.name, "Admin Updated");
  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("UPDATE users SET"));
  assert.equal(calls[0].params[5], 1); // id é o último param
});

test("update retorna null quando usuario nao existe", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  const user = await usersRepo.update(999, {
    name: "X", email: "x@test.com", role: "user", active: true
  });
  assert.equal(user, null);
});

test("updatePassword executa query correta", async () => {
  resetMock();
  setQueryResults([{ rows: [], rowCount: 1 }]);

  await usersRepo.updatePassword(1, "newHash");

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("password_hash"));
  assert.deepEqual(calls[0].params, ["newHash", 1]);
});

test("setResetToken e findByResetToken lifecycle", async () => {
  resetMock();
  setQueryResults([
    { rows: [], rowCount: 1 }, // setResetToken
    { rows: [{ id: 1, name: "Admin", email: "admin@test.com", role: "admin", active: true }] } // findByResetToken
  ]);

  await usersRepo.setResetToken(1, "tokenHash123", new Date("2026-12-31"));
  const user = await usersRepo.findByResetToken("tokenHash123");

  assert.equal(user.id, 1);
  const calls = getQueryCalls();
  assert.equal(calls[0].params[0], "tokenHash123");
  assert.equal(calls[1].params[0], "tokenHash123");
});

test("clearResetToken limpa token do usuario", async () => {
  resetMock();
  setQueryResults([{ rows: [], rowCount: 1 }]);

  await usersRepo.clearResetToken(5);

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("reset_token = NULL"));
  assert.deepEqual(calls[0].params, [5]);
});

test("remove retorna true quando deletado", async () => {
  resetMock();
  setQueryResults([{ rows: [{ id: 1 }], rowCount: 1 }]);

  const result = await usersRepo.remove(1);
  assert.equal(result, true);
});

test("remove retorna false quando nao encontrado", async () => {
  resetMock();
  setQueryResults([{ rows: [], rowCount: 0 }]);

  const result = await usersRepo.remove(999);
  assert.equal(result, false);
});
