-- Lojas de precificação vêm das LOJAS DAS VENDAS (sales.store), não da tabela stores (que é só p/ API ML/Shopee).
-- Tabela leve, sincronizada das vendas; usuário define marketplace (p/ as faixas) e NF por loja.

CREATE TABLE IF NOT EXISTS pricing_lojas (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,   -- casa com sales.store
    marketplace VARCHAR(30),                    -- chave livre; casa com mp_fee_bands.marketplace
    nf_pct      NUMERIC(6,3) NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- loja_product_prices passa a referenciar pricing_lojas (a tabela estava vazia; recria com segurança)
DROP TABLE IF EXISTS loja_product_prices;
CREATE TABLE loja_product_prices (
    id           BIGSERIAL PRIMARY KEY,
    loja_id      BIGINT NOT NULL REFERENCES pricing_lojas(id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
    unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- preço por PEÇA
    kit_qty      INTEGER NOT NULL DEFAULT 1,
    frete_type   VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (frete_type IN ('none','pct','fix')),
    frete_value  NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(loja_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_lpp_product ON loja_product_prices(product_id);
