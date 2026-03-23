-- ============================================================
-- Módulo de Pedidos e Orçamentos
-- Catálogo de produtos com fotos, clientes sincronizados do Sisplan,
-- pedidos/orçamentos com itens e preços editáveis.
-- ============================================================

-- Tabela de produtos do catálogo de pedidos (com fotos, preços PC/MN)
CREATE TABLE IF NOT EXISTS order_catalog_products (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(500) NOT NULL,
    photo_url       VARCHAR(1000),
    price_pc        NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_mn        NUMERIC(10,2) NOT NULL DEFAULT 0,
    reference_codigo VARCHAR(100),           -- codigo em sisplan_products
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tamanhos de cada produto do catálogo (vinculados a SKUs do Sisplan)
CREATE TABLE IF NOT EXISTS order_catalog_sizes (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES order_catalog_products(id) ON DELETE CASCADE,
    size_name   VARCHAR(50) NOT NULL,
    sisplan_sku VARCHAR(255),               -- sku em sisplan_products
    sort_order  INTEGER NOT NULL DEFAULT 0,
    UNIQUE(product_id, size_name)
);

CREATE INDEX IF NOT EXISTS idx_order_catalog_sizes_product ON order_catalog_sizes(product_id);

-- Clientes sincronizados do Sisplan Firebird
CREATE TABLE IF NOT EXISTS order_customers (
    id              BIGSERIAL PRIMARY KEY,
    sisplan_id      VARCHAR(100) NOT NULL UNIQUE,  -- código do cliente no Sisplan
    fantasy_name    VARCHAR(500),
    company_name    VARCHAR(500),
    cnpj            VARCHAR(30),
    active          BOOLEAN NOT NULL DEFAULT true,
    synced_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_customers_sisplan_id  ON order_customers(sisplan_id);
CREATE INDEX IF NOT EXISTS idx_order_customers_fantasy     ON order_customers USING gin(to_tsvector('portuguese', coalesce(fantasy_name, '')));

-- Pedidos e Orçamentos
CREATE TABLE IF NOT EXISTS orders (
    id              BIGSERIAL PRIMARY KEY,
    type            VARCHAR(20) NOT NULL DEFAULT 'pedido' CHECK (type IN ('pedido','orcamento')),
    status          VARCHAR(20) NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado','concluido','cancelado')),
    customer_id     BIGINT REFERENCES order_customers(id),
    customer_snapshot JSONB,               -- snapshot do cliente no momento do pedido
    price_table     VARCHAR(10) NOT NULL DEFAULT 'PC',  -- PC ou MN
    notes           TEXT,
    total           NUMERIC(10,2) NOT NULL DEFAULT 0,
    sisplan_order_id VARCHAR(100),         -- ID no ERP após integração (Phase 2)
    created_by      BIGINT REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type       ON orders(type);
CREATE INDEX IF NOT EXISTS idx_orders_customer   ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Itens de cada pedido
CREATE TABLE IF NOT EXISTS order_items (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    catalog_product_id BIGINT REFERENCES order_catalog_products(id),
    product_name    VARCHAR(500) NOT NULL,  -- snapshot
    size_name       VARCHAR(50) NOT NULL,
    sisplan_sku     VARCHAR(255),
    qty             INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
    subtotal        NUMERIC(10,2) GENERATED ALWAYS AS (qty * unit_price) STORED
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
