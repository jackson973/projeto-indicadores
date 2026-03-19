-- Fix sales upsert key: use SKU (when available) instead of product name
-- This prevents duplicates when product name changes in ERP (Sisplan)
-- Sisplan always has SKU, so product rename won't create new rows
-- UpSeller: uses SKU if available, falls back to product name

-- Drop old unique index
DROP INDEX IF EXISTS idx_sales_order_product_variation;
DROP INDEX IF EXISTS idx_sales_order_variation;

-- Create new unique index: (order_id, sku_or_product, variation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_order_sku_variation
ON sales (order_id, COALESCE(NULLIF(sku, ''), product), COALESCE(variation, ''));
