const test = require("node:test");
const assert = require("node:assert/strict");

// Injetar mock do db/connection ANTES de importar o repository
const { mockDb, setQueryResults, setClientQueryResults, resetMock, getQueryCalls, getClientQueryCalls } = require("./helpers/mockDb");
const connectionPath = require.resolve("../src/db/connection");
require.cache[connectionPath] = { id: connectionPath, filename: connectionPath, loaded: true, exports: mockDb };

const cashflowRepo = require("../src/db/cashflowRepository");

// ── Categories ──

test("getCategories retorna categorias ativas", async () => {
  resetMock();
  setQueryResults([
    { rows: [
      { id: 1, name: "Recebimentos", preset: true, active: true },
      { id: 2, name: "Fornecedores", preset: true, active: true }
    ]}
  ]);

  const categories = await cashflowRepo.getCategories();
  assert.equal(categories.length, 2);
  assert.equal(categories[0].name, "Recebimentos");

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("WHERE active = true"));
});

test("createCategory insere e retorna categoria", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 10, name: "Nova Categoria", preset: false, active: true }] }
  ]);

  const cat = await cashflowRepo.createCategory("Nova Categoria");
  assert.equal(cat.name, "Nova Categoria");
  assert.equal(cat.preset, false);

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("INSERT INTO cashflow_categories"));
});

test("updateCategory retorna null para categoria preset", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  const result = await cashflowRepo.updateCategory(1, "Novo Nome");
  assert.equal(result, null);
});

test("updateCategory atualiza categoria nao-preset", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 5, name: "Atualizada", preset: false, active: true }] }
  ]);

  const result = await cashflowRepo.updateCategory(5, "Atualizada");
  assert.equal(result.name, "Atualizada");
});

test("deleteCategory desativa categoria e retorna true", async () => {
  resetMock();
  setQueryResults([{ rows: [{ id: 5 }], rowCount: 1 }]);

  const result = await cashflowRepo.deleteCategory(5);
  assert.equal(result, true);

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("active = false"));
  assert.ok(calls[0].text.includes("preset = false"));
});

test("deleteCategory retorna false quando nao encontrada", async () => {
  resetMock();
  setQueryResults([{ rows: [], rowCount: 0 }]);

  const result = await cashflowRepo.deleteCategory(999);
  assert.equal(result, false);
});

// ── Boxes ──

test("getBoxes retorna caixas ativos", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 1, name: "Caixa Principal", active: true }] }
  ]);

  const boxes = await cashflowRepo.getBoxes();
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].name, "Caixa Principal");
});

test("createBox insere e retorna caixa", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 2, name: "Caixa Secundario", active: true }] }
  ]);

  const box = await cashflowRepo.createBox("Caixa Secundario");
  assert.equal(box.name, "Caixa Secundario");
});

test("updateBox retorna null quando caixa inativa", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  const result = await cashflowRepo.updateBox(1, "Novo Nome");
  assert.equal(result, null);
});

test("deleteBox impede exclusao do ultimo caixa ativo", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ cnt: "1" }] } // COUNT retorna apenas 1 ativo
  ]);

  const result = await cashflowRepo.deleteBox(1);
  assert.ok(result.error);
  assert.ok(result.error.includes("último caixa"));
});

test("deleteBox permite exclusao quando ha mais de um caixa", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ cnt: "3" }] }, // COUNT retorna 3 ativos
    { rows: [{ id: 2 }], rowCount: 1 } // Desativação
  ]);

  const result = await cashflowRepo.deleteBox(2);
  assert.deepEqual(result, { success: true });
});

// ── Entries ──

test("getEntries retorna entries do mes com amount convertido", async () => {
  resetMock();
  setQueryResults([
    { rows: [
      { id: 1, date: "2026-01-15", categoryName: "Fornecedores", type: "expense", amount: "500.00", status: "ok" },
      { id: 2, date: "2026-01-20", categoryName: "Recebimentos", type: "income", amount: "1000.00", status: "pending" }
    ]}
  ]);

  const entries = await cashflowRepo.getEntries(2026, 1, 1);
  assert.equal(entries.length, 2);
  assert.equal(typeof entries[0].amount, "number");
  assert.equal(entries[0].amount, 500);
  assert.equal(entries[1].amount, 1000);

  const calls = getQueryCalls();
  assert.deepEqual(calls[0].params, [2026, 1, 1]);
});

test("createEntry insere com status default pending", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 5, date: "2026-02-01", categoryId: 1, type: "income", amount: "750.00", status: "pending" }] }
  ]);

  const entry = await cashflowRepo.createEntry({
    date: "2026-02-01",
    categoryId: 1,
    description: "Venda",
    type: "income",
    amount: 750,
    createdBy: 1,
    boxId: 1
  });

  assert.equal(entry.amount, 750);
  const calls = getQueryCalls();
  assert.equal(calls[0].params[5], "pending"); // status default
});

test("updateEntry retorna null quando entry nao existe", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  const result = await cashflowRepo.updateEntry(999, {
    date: "2026-02-01", categoryId: 1, description: "X", type: "income", amount: 100, status: "ok"
  });
  assert.equal(result, null);
});

test("toggleEntryStatus alterna status", async () => {
  resetMock();
  setQueryResults([{ rows: [{ id: 1, status: "ok" }] }]);

  const result = await cashflowRepo.toggleEntryStatus(1);
  assert.equal(result.status, "ok");
});

test("deleteEntry retorna true quando deletado", async () => {
  resetMock();
  setQueryResults([{ rows: [{ id: 1 }], rowCount: 1 }]);

  const result = await cashflowRepo.deleteEntry(1);
  assert.equal(result, true);
});

test("deleteEntry retorna false quando nao encontrado", async () => {
  resetMock();
  setQueryResults([{ rows: [], rowCount: 0 }]);

  const result = await cashflowRepo.deleteEntry(999);
  assert.equal(result, false);
});

// ── Balances ──

test("getBalance usa saldo anterior quando existe", async () => {
  resetMock();
  setQueryResults([
    // Query 1: busca saldo anterior
    { rows: [{ year: 2026, month: 1, opening_balance: "1000.00" }] },
    // Query 2: soma de entries entre saldo anterior e mês atual
    { rows: [{ total_income: "500.00", total_expense: "200.00" }] }
  ]);

  const balance = await cashflowRepo.getBalance(2026, 2, 1);
  // 1000 + 500 - 200 = 1300
  assert.equal(balance, 1300);
});

test("getBalance usa saldo explicito quando nao ha anterior", async () => {
  resetMock();
  setQueryResults([
    { rows: [] }, // Sem saldo anterior
    { rows: [{ opening_balance: "5000.00" }] } // Saldo explícito do mês
  ]);

  const balance = await cashflowRepo.getBalance(2026, 1, 1);
  assert.equal(balance, 5000);
});

test("getBalance calcula do zero quando nao ha nenhum saldo", async () => {
  resetMock();
  setQueryResults([
    { rows: [] }, // Sem saldo anterior
    { rows: [] }, // Sem saldo explícito
    { rows: [{ total_income: "300.00", total_expense: "100.00" }] } // Entries anteriores
  ]);

  const balance = await cashflowRepo.getBalance(2026, 3, 1);
  assert.equal(balance, 200);
});

test("setBalance faz upsert", async () => {
  resetMock();
  setQueryResults([{ rows: [] }]);

  await cashflowRepo.setBalance(2026, 1, 5000, 1);

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("ON CONFLICT"));
  assert.deepEqual(calls[0].params, [2026, 1, 5000, 1]);
});

// ── Recurrences ──

test("getRecurrences retorna recorrencias ativas com amount convertido", async () => {
  resetMock();
  setQueryResults([
    { rows: [
      { id: 1, categoryName: "Fornecedores", description: "Aluguel", type: "expense", amount: "2000.00", frequency: "monthly", dayOfMonth: 5 }
    ]}
  ]);

  const recs = await cashflowRepo.getRecurrences(1);
  assert.equal(recs.length, 1);
  assert.equal(typeof recs[0].amount, "number");
  assert.equal(recs[0].amount, 2000);
});

test("createRecurrence insere e retorna com amount numerico", async () => {
  resetMock();
  setQueryResults([
    { rows: [{ id: 5, categoryId: 1, description: "Aluguel", type: "expense", amount: "2000.00", frequency: "monthly" }] }
  ]);

  const rec = await cashflowRepo.createRecurrence({
    categoryId: 1, description: "Aluguel", type: "expense", amount: 2000,
    frequency: "monthly", dayOfMonth: 5, startDate: "2026-01-01",
    createdBy: 1, boxId: 1
  });

  assert.equal(rec.amount, 2000);
});

test("deleteRecurrence desativa e retorna true", async () => {
  resetMock();
  setQueryResults([{ rows: [{ id: 1 }], rowCount: 1 }]);

  const result = await cashflowRepo.deleteRecurrence(1);
  assert.equal(result, true);

  const calls = getQueryCalls();
  assert.ok(calls[0].text.includes("active = false"));
});

// ── Helpers ──

test("getTodayBrazil retorna formato YYYY-MM-DD", () => {
  const today = cashflowRepo.getTodayBrazil();
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(today), `formato invalido: ${today}`);
});
