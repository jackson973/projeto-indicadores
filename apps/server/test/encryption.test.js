const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

// Gerar uma chave de teste antes de importar o módulo
const TEST_KEY = crypto.randomBytes(32).toString("hex");
process.env.SISPLAN_ENCRYPTION_KEY = TEST_KEY;

const { encrypt, decrypt } = require("../src/lib/encryption");

test("encrypt e decrypt round-trip com texto simples", () => {
  const original = "minha senha secreta";
  const encrypted = encrypt(original);
  const decrypted = decrypt(encrypted);
  assert.equal(decrypted, original);
});

test("encrypt e decrypt com caracteres especiais e unicode", () => {
  const original = "Ação: R$ 1.234,56 — café ☕ 日本語";
  const encrypted = encrypt(original);
  const decrypted = decrypt(encrypted);
  assert.equal(decrypted, original);
});

test("encrypt e decrypt com string vazia", () => {
  const original = "";
  const encrypted = encrypt(original);
  const decrypted = decrypt(encrypted);
  assert.equal(decrypted, original);
});

test("encrypt gera output diferente para mesmo input (IV aleatorio)", () => {
  const original = "mesmo texto";
  const encrypted1 = encrypt(original);
  const encrypted2 = encrypt(original);
  assert.notEqual(encrypted1, encrypted2);
  // Mas ambos devem decriptar para o mesmo valor
  assert.equal(decrypt(encrypted1), original);
  assert.equal(decrypt(encrypted2), original);
});

test("formato do output contem iv:authTag:ciphertext", () => {
  const encrypted = encrypt("teste");
  const parts = encrypted.split(":");
  assert.equal(parts.length, 3, "deve ter 3 partes separadas por ':'");
  assert.equal(parts[0].length, 32, "IV deve ter 32 caracteres hex (16 bytes)");
  assert.equal(parts[1].length, 32, "authTag deve ter 32 caracteres hex (16 bytes)");
  assert.ok(parts[2].length > 0, "ciphertext não deve ser vazio");
});

test("decrypt com dado corrompido lanca erro", () => {
  const encrypted = encrypt("teste");
  const parts = encrypted.split(":");
  // Corromper o ciphertext
  const corrupted = `${parts[0]}:${parts[1]}:ff${parts[2].slice(2)}`;
  assert.throws(() => decrypt(corrupted));
});

test("decrypt com authTag alterada lanca erro", () => {
  const encrypted = encrypt("teste");
  const parts = encrypted.split(":");
  const badTag = "a".repeat(32);
  const tampered = `${parts[0]}:${badTag}:${parts[2]}`;
  assert.throws(() => decrypt(tampered));
});

test("encrypt sem chave configurada lanca erro", () => {
  const savedKey = process.env.SISPLAN_ENCRYPTION_KEY;
  delete process.env.SISPLAN_ENCRYPTION_KEY;

  // Precisamos recarregar o módulo para que getKey() leia o env novamente
  // Como getKey() é chamada a cada encrypt/decrypt, basta deletar a env var
  assert.throws(() => encrypt("teste"), /SISPLAN_ENCRYPTION_KEY/);

  process.env.SISPLAN_ENCRYPTION_KEY = savedKey;
});
