ALTER TABLE sales ADD COLUMN IF NOT EXISTS platform_order_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sales_platform_order_id ON sales (platform_order_id);
