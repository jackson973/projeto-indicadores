-- Fix sales upsert key: use (order_id, variation) instead of (order_id, product, variation)
-- This prevents duplicates when product name changes in ERP (Sisplan)

-- Drop old unique index
DROP INDEX IF EXISTS idx_sales_order_product_variation;

-- Create new unique index on (order_id, variation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_order_variation
ON sales (order_id, COALESCE(variation, ''));
