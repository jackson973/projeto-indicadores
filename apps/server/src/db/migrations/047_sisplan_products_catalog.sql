-- ============================================================
-- Catálogo de produtos do Sisplan/Fábrica
-- Populado via query configurável no banco Firebird do Sisplan.
-- Independente de pedidos — todos os SKUs cadastrados ficam aqui.
-- ============================================================

-- Colunas de configuração do sync de produtos em sisplan_settings
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS product_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS product_sql_query TEXT;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS product_column_mapping JSONB DEFAULT '{}';
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS product_last_sync_at TIMESTAMP;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS product_last_sync_status VARCHAR(50);
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS product_last_sync_message TEXT;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS product_last_sync_rows INTEGER DEFAULT 0;

-- Tabela de produtos do Sisplan
CREATE TABLE IF NOT EXISTS sisplan_products (
    id          BIGSERIAL PRIMARY KEY,
    codigo      VARCHAR(100) NOT NULL,       -- código do produto
    descricao   VARCHAR(500) NOT NULL,        -- descrição do produto
    cod_cor     VARCHAR(50),                  -- código da cor
    desc_cor    VARCHAR(255),                 -- descrição da cor
    tamanho     VARCHAR(50),                  -- tamanho
    sku         VARCHAR(255) NOT NULL,         -- composto: codigo-codcor-tamanho
    active      BOOLEAN NOT NULL DEFAULT true,
    synced_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sku)
);

CREATE INDEX IF NOT EXISTS idx_sisplan_products_codigo   ON sisplan_products(codigo);
CREATE INDEX IF NOT EXISTS idx_sisplan_products_descricao ON sisplan_products USING gin(to_tsvector('portuguese', descricao));
CREATE INDEX IF NOT EXISTS idx_sisplan_products_active   ON sisplan_products(active);
