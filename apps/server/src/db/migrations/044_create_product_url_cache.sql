-- Cache de URLs de produtos por store_variation_key
-- Permite preencher product_url em vendas que não trouxeram a URL diretamente
CREATE TABLE IF NOT EXISTS product_url_cache (
  store_variation_key TEXT PRIMARY KEY,
  product_url         TEXT NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Popula o cache com URLs já existentes nas sales
INSERT INTO product_url_cache (store_variation_key, product_url)
SELECT
  COALESCE(cod_store::text, store) || '|||' || TRIM(ad_name) AS store_variation_key,
  MAX(product_url) AS product_url
FROM sales
WHERE product_url IS NOT NULL
  AND ad_name IS NOT NULL AND TRIM(ad_name) != ''
GROUP BY 1
ON CONFLICT (store_variation_key) DO UPDATE
  SET product_url = EXCLUDED.product_url,
      updated_at  = NOW();

-- Backfill nas sales: preenche product_url onde está null usando o cache
UPDATE sales s
SET product_url = c.product_url
FROM product_url_cache c
WHERE s.product_url IS NULL
  AND COALESCE(s.cod_store::text, s.store) || '|||' || TRIM(s.ad_name) = c.store_variation_key;
