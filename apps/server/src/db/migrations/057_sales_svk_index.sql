-- Functional index for the store_variation_key expression used in product groups
-- This dramatically speeds up the GROUP BY in getAllAdsWithGroup()
CREATE INDEX IF NOT EXISTS idx_sales_svk ON sales (
  (COALESCE(cod_store::text, store) || '|||' || TRIM(ad_name))
);
