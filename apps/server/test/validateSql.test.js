const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateSql } = require('../src/services/whatsappLlmService');

describe('validateSql', () => {
  // --- SELECT queries aceitas ---
  describe('queries validas', () => {
    it('aceita SELECT simples', () => {
      const result = validateSql('SELECT * FROM sales');
      assert.strictEqual(result.valid, true);
      assert.ok(result.sql.includes('SELECT * FROM sales'));
    });

    it('aceita SELECT com WHERE', () => {
      const result = validateSql("SELECT order_id, total FROM sales WHERE state = 'SP'");
      assert.strictEqual(result.valid, true);
      assert.ok(result.sql.includes("WHERE state = 'SP'"));
    });

    it('aceita SELECT com JOIN entre tabelas permitidas', () => {
      const result = validateSql('SELECT e.description, c.name FROM cashflow_entries e JOIN cashflow_categories c ON e.category_id = c.id');
      assert.strictEqual(result.valid, true);
    });

    it('aceita WITH (CTE)', () => {
      const result = validateSql('WITH top AS (SELECT product, SUM(total) as total FROM sales GROUP BY product) SELECT * FROM top ORDER BY total DESC');
      assert.strictEqual(result.valid, true);
    });

    it('aceita SELECT com cashflow_balances', () => {
      const result = validateSql('SELECT * FROM cashflow_balances');
      assert.strictEqual(result.valid, true);
    });

    it('aceita SELECT com cashflow_boxes', () => {
      const result = validateSql('SELECT * FROM cashflow_boxes WHERE active = true');
      assert.strictEqual(result.valid, true);
    });

    it('remove ponto-e-virgula trailing', () => {
      const result = validateSql('SELECT * FROM sales;');
      assert.strictEqual(result.valid, true);
      assert.ok(!result.sql.endsWith(';'));
    });

    it('remove multiplos ponto-e-virgula trailing', () => {
      const result = validateSql('SELECT * FROM sales;;;');
      assert.strictEqual(result.valid, true);
    });
  });

  // --- LIMIT enforcement ---
  describe('LIMIT', () => {
    it('adiciona LIMIT 50 quando ausente', () => {
      const result = validateSql('SELECT * FROM sales');
      assert.strictEqual(result.valid, true);
      assert.ok(result.sql.endsWith('LIMIT 50'));
    });

    it('mantem LIMIT menor que 50', () => {
      const result = validateSql('SELECT * FROM sales LIMIT 10');
      assert.strictEqual(result.valid, true);
      assert.ok(result.sql.includes('LIMIT 10'));
    });

    it('reduz LIMIT maior que 50 para 50', () => {
      const result = validateSql('SELECT * FROM sales LIMIT 100');
      assert.strictEqual(result.valid, true);
      assert.ok(result.sql.includes('LIMIT 50'));
    });

    it('reduz LIMIT 999 para 50', () => {
      const result = validateSql('SELECT * FROM sales LIMIT 999');
      assert.strictEqual(result.valid, true);
      assert.ok(result.sql.includes('LIMIT 50'));
    });
  });

  // --- Queries rejeitadas ---
  describe('queries bloqueadas', () => {
    it('rejeita INSERT', () => {
      const result = validateSql("INSERT INTO sales (order_id) VALUES ('X')");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita UPDATE', () => {
      const result = validateSql("UPDATE sales SET total = 0 WHERE order_id = '1'");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita DELETE', () => {
      const result = validateSql("DELETE FROM sales WHERE order_id = '1'");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita DROP TABLE', () => {
      const result = validateSql('DROP TABLE sales');
      assert.strictEqual(result.valid, false);
    });

    it('rejeita ALTER TABLE', () => {
      const result = validateSql('ALTER TABLE sales ADD COLUMN x TEXT');
      assert.strictEqual(result.valid, false);
    });

    it('rejeita TRUNCATE', () => {
      const result = validateSql('TRUNCATE sales');
      assert.strictEqual(result.valid, false);
    });

    it('rejeita CREATE TABLE', () => {
      const result = validateSql('CREATE TABLE hack (id INT)');
      assert.strictEqual(result.valid, false);
    });

    it('rejeita GRANT', () => {
      const result = validateSql('GRANT ALL ON sales TO public');
      assert.strictEqual(result.valid, false);
    });

    it('rejeita multiple statements (injection)', () => {
      const result = validateSql("SELECT * FROM sales; DROP TABLE sales");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita SQL comment --', () => {
      const result = validateSql("SELECT * FROM sales -- drop table");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita block comment /* */', () => {
      const result = validateSql("SELECT * FROM sales /* malicious */");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita SELECT INTO', () => {
      const result = validateSql("SELECT * INTO newtable FROM sales");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita tabela nao permitida (users)', () => {
      const result = validateSql('SELECT * FROM users');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('users'));
      assert.ok(result.error.includes('nao permitida'));
    });

    it('rejeita tabela nao permitida em JOIN', () => {
      const result = validateSql('SELECT * FROM sales JOIN users ON sales.client_name = users.name');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('users'));
    });

    it('rejeita query que comeca com palavra nao-SELECT', () => {
      const result = validateSql('EXPLAIN SELECT * FROM sales');
      assert.strictEqual(result.valid, false);
    });

    it('rejeita EXECUTE', () => {
      const result = validateSql("EXECUTE some_function()");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita REVOKE', () => {
      const result = validateSql("REVOKE ALL ON sales FROM public");
      assert.strictEqual(result.valid, false);
    });
  });

  // --- Case sensitivity ---
  describe('case insensitive', () => {
    it('rejeita insert em lowercase', () => {
      const result = validateSql("insert into sales (order_id) values ('X')");
      assert.strictEqual(result.valid, false);
    });

    it('rejeita DROP em mixed case', () => {
      const result = validateSql('DrOp TaBlE sales');
      assert.strictEqual(result.valid, false);
    });

    it('aceita select em lowercase', () => {
      const result = validateSql('select * from sales');
      assert.strictEqual(result.valid, true);
    });

    it('aceita SELECT em uppercase', () => {
      const result = validateSql('SELECT * FROM sales');
      assert.strictEqual(result.valid, true);
    });
  });
});
