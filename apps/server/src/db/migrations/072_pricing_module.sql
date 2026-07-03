-- Módulo Análise de Custo e Preço — Fase 2 (canais/taxas, NF por loja, preço por loja, valorização)

-- NF (imposto) por loja — cada CNPJ pode ter alíquota distinta
ALTER TABLE stores ADD COLUMN IF NOT EXISTS nf_pct NUMERIC(6,3) NOT NULL DEFAULT 0;

-- Faixas de taxa por marketplace: preço do kit → comissão % + taxa fixa por venda
CREATE TABLE IF NOT EXISTS mp_fee_bands (
    id             BIGSERIAL PRIMARY KEY,
    marketplace    VARCHAR(20) NOT NULL,       -- mercadolivre / shopee / tiktok / shein
    price_min      NUMERIC(12,2) NOT NULL DEFAULT 0,
    price_max      NUMERIC(12,2),              -- NULL = sem teto
    commission_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
    fixed_per_sale NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fee_bands_mp ON mp_fee_bands(marketplace);

-- Preço de venda por loja (preço por PEÇA + kit + frete). Uma linha por (loja, produto).
CREATE TABLE IF NOT EXISTS loja_product_prices (
    id           BIGSERIAL PRIMARY KEY,
    store_id     BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
    unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- preço por peça
    kit_qty      INTEGER NOT NULL DEFAULT 1,
    frete_type   VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (frete_type IN ('none','pct','fix')),
    frete_value  NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_reference BOOLEAN NOT NULL DEFAULT false,
    updated_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_lpp_product ON loja_product_prices(product_id);

-- Seed das faixas conhecidas (só se a tabela estiver vazia)
INSERT INTO mp_fee_bands (marketplace, price_min, price_max, commission_pct, fixed_per_sale)
SELECT * FROM (VALUES
    ('mercadolivre', 0::numeric,   78.99::numeric,  19::numeric,  6::numeric),
    ('mercadolivre', 79::numeric,  NULL::numeric,   19::numeric,  0::numeric),
    ('shopee',       0::numeric,   79.99::numeric,  20::numeric,  4::numeric),
    ('shopee',       80::numeric,  99.99::numeric,  14::numeric, 16::numeric),
    ('shopee',       100::numeric, 199.99::numeric, 14::numeric, 20::numeric),
    ('shopee',       200::numeric, 499.99::numeric, 14::numeric, 26::numeric),
    ('shopee',       500::numeric, NULL::numeric,   14::numeric, 26::numeric),
    ('shein',        0::numeric,   NULL::numeric,   16::numeric,  0::numeric),
    ('tiktok',       0::numeric,   NULL::numeric,   12::numeric,  0::numeric)
) AS v(marketplace, price_min, price_max, commission_pct, fixed_per_sale)
WHERE NOT EXISTS (SELECT 1 FROM mp_fee_bands);
