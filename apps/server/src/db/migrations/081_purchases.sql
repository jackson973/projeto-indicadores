-- Módulo Compras: pedidos de fornecedor com parcelas ligadas ao fluxo de caixa

CREATE TABLE IF NOT EXISTS purchases (
    id             BIGSERIAL PRIMARY KEY,
    order_number   VARCHAR(50) NOT NULL,
    supplier_id    BIGINT REFERENCES suppliers(id),
    supplier_name  VARCHAR(255) NOT NULL,
    order_date     DATE NOT NULL,
    total_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_pieces   INTEGER,
    payment_terms  VARCHAR(100),            -- ex.: "0 15 30"
    obs            TEXT,
    box_id         BIGINT REFERENCES cashflow_boxes(id),
    category_id    BIGINT REFERENCES cashflow_categories(id),
    file_path      VARCHAR(500),            -- PDF da cópia de pedido (uploads/purchases/…)
    file_name      VARCHAR(255),
    created_by     BIGINT REFERENCES users(id),
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_number ON purchases(order_number);

CREATE TABLE IF NOT EXISTS purchase_items (
    id           BIGSERIAL PRIMARY KEY,
    purchase_id  BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    description  VARCHAR(500) NOT NULL,
    size_grid    TEXT,                      -- ex.: "RN 300 · P 300 · M 300 · G 300 · GG 300"
    qty          INTEGER NOT NULL DEFAULT 0,
    unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
    total        NUMERIC(14,2) NOT NULL DEFAULT 0,
    obs          TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

CREATE TABLE IF NOT EXISTS purchase_installments (
    id                 BIGSERIAL PRIMARY KEY,
    purchase_id        BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    seq                INTEGER NOT NULL,
    due_date           DATE NOT NULL,
    amount             NUMERIC(14,2) NOT NULL,
    cashflow_entry_id  BIGINT REFERENCES cashflow_entries(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_inst_purchase ON purchase_installments(purchase_id);
