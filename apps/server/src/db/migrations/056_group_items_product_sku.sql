-- Add product_sku column to product_group_items for reliable Fabrica product identification
-- Instead of relying on fragile descricao (ad_name), use sisplan codigo as stable key

ALTER TABLE product_group_items ADD COLUMN IF NOT EXISTS product_sku VARCHAR(100) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_group_items_product_sku ON product_group_items(product_sku);

-- Populate product_sku for existing Fabrica items using sisplan_products.codigo
-- ad_name format for Fabrica: 'Fabrica|||<descricao>'
UPDATE product_group_items gi
SET product_sku = sp.codigo
FROM (
  SELECT DISTINCT ON (descricao) descricao, codigo
  FROM sisplan_products
  WHERE active = true
  ORDER BY descricao, codigo
) sp
WHERE gi.ad_name LIKE 'Fabrica|||%'
  AND gi.product_sku IS NULL
  AND sp.descricao = SUBSTRING(gi.ad_name FROM 11);
