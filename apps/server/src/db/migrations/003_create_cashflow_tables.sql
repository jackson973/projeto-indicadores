-- Categorias de lançamento
CREATE TABLE IF NOT EXISTS cashflow_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    preset BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_cashflow_categories_updated_at BEFORE UPDATE
    ON cashflow_categories FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Lançamentos do fluxo de caixa
CREATE TABLE IF NOT EXISTS cashflow_entries (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    category_id BIGINT NOT NULL REFERENCES cashflow_categories(id),
    description VARCHAR(500) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('ok', 'pending')),
    recurrence_id BIGINT,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cashflow_entries_date ON cashflow_entries (date);
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_category ON cashflow_entries (category_id);
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_type ON cashflow_entries (type);
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_year_month ON cashflow_entries (EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date));

CREATE TRIGGER update_cashflow_entries_updated_at BEFORE UPDATE
    ON cashflow_entries FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Saldo inicial por mês
CREATE TABLE IF NOT EXISTS cashflow_balances (
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, month)
);

CREATE TRIGGER update_cashflow_balances_updated_at BEFORE UPDATE
    ON cashflow_balances FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Recorrências
CREATE TABLE IF NOT EXISTS cashflow_recurrences (
    id BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES cashflow_categories(id),
    description VARCHAR(500) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(12, 2) NOT NULL,
    frequency VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly')),
    day_of_month INTEGER,
    start_date DATE NOT NULL,
    end_date DATE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_cashflow_recurrences_updated_at BEFORE UPDATE
    ON cashflow_recurrences FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed categorias pré-definidas
INSERT INTO cashflow_categories (name, preset) VALUES
    ('RECEBIMENTO', true),
    ('FORNECEDORES', true),
    ('SHOPEE ADS', true),
    ('MATÉRIA PRIMA', true),
    ('FOLHA', true),
    ('APORTE', true),
    ('CARTÃO', true),
    ('IMPOSTO', true)
ON CONFLICT DO NOTHING;
