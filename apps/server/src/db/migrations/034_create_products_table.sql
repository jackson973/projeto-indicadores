-- ============================================================
-- Gerenciamento de Produtos — tabela local de produtos/anúncios
-- Dados sincronizados a partir dos pedidos do UpSeller (sales)
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    id          BIGSERIAL PRIMARY KEY,
    codigo      VARCHAR(100),
    nome        VARCHAR(500) NOT NULL,
    canal       VARCHAR(50),          -- mercadolivre, shopee, tiktok, shein, amazon, magalu
    thumbnail   TEXT,
    kit_qty     INTEGER NOT NULL DEFAULT 1,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_products_updated_at BEFORE UPDATE
    ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_products_codigo ON products (codigo);
CREATE INDEX IF NOT EXISTS idx_products_canal ON products (canal);
CREATE INDEX IF NOT EXISTS idx_products_nome ON products (nome);
