-- Anúncios ↔ Estoque: cada anúncio (products/store_variation_key) aponta para
-- UM produto do cadastro de estoque (stock_products, com suas variações).
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_product_id BIGINT REFERENCES stock_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_stock_product ON products(stock_product_id);
