-- Link catalog products directly to product groups for dynamic barcode resolution
-- Instead of copying barcodes statically, resolve EAN → grupo → catalog product on the fly
ALTER TABLE order_catalog_products ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES product_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_products_group ON order_catalog_products(group_id);
