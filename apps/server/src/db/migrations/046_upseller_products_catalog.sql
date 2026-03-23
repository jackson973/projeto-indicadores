-- ============================================================
-- Catálogo de produtos do Upseller — tabela mestre de produtos
-- Populada via sync do Export API do Upseller por plataforma.
-- ad_name bate diretamente com sales.ad_name (93% cobertura Shopee).
-- ============================================================

CREATE TABLE IF NOT EXISTS upseller_products (
    id          BIGSERIAL PRIMARY KEY,
    platform    VARCHAR(50)  NOT NULL,           -- shopee, shein, tiktok, mercado
    shop_name   VARCHAR(255) NOT NULL,            -- nome da loja (xlsx col0)
    store_id    BIGINT REFERENCES stores(id),     -- FK resolvida do shop_name
    ad_id       VARCHAR(100),                     -- ID do anúncio na plataforma (xlsx col1)
    ad_name     VARCHAR(500) NOT NULL,            -- nome do anúncio = sales.ad_name
    active      BOOLEAN NOT NULL DEFAULT true,
    synced_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, shop_name, ad_name)          -- mesmo anúncio não repete por loja+plataforma
);

CREATE INDEX IF NOT EXISTS idx_upseller_products_platform   ON upseller_products(platform);
CREATE INDEX IF NOT EXISTS idx_upseller_products_ad_name    ON upseller_products(ad_name);
CREATE INDEX IF NOT EXISTS idx_upseller_products_store_id   ON upseller_products(store_id);
CREATE INDEX IF NOT EXISTS idx_upseller_products_active     ON upseller_products(active);

-- ============================================================
-- Variações de cada produto no catálogo
-- variation_option = "Kit MENINO" / "Kit MENINA" / "P" / "M" / etc.
-- Corresponde ao prefixo extraído de sales.variation pelo variationPrefixExpr.
-- ============================================================

CREATE TABLE IF NOT EXISTS upseller_product_variations (
    id                BIGSERIAL PRIMARY KEY,
    product_id        BIGINT NOT NULL REFERENCES upseller_products(id) ON DELETE CASCADE,
    variation_option  VARCHAR(255),               -- opção variante 1 (xlsx col7)
    variation_option2 VARCHAR(255),               -- opção variante 2 (xlsx col10), se houver
    variation_image   TEXT,                       -- imagem da variação  (xlsx col8)
    synced_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_upv_product_id ON upseller_product_variations(product_id);
