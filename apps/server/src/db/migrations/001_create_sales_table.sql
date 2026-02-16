-- Sales table: stores all order line items
CREATE TABLE IF NOT EXISTS sales (
    id BIGSERIAL PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    date TIMESTAMP NOT NULL,
    store VARCHAR(255) NOT NULL DEFAULT 'Todas',
    product VARCHAR(500) NOT NULL DEFAULT 'Geral',
    ad_name VARCHAR(500) NOT NULL DEFAULT 'Geral',
    variation VARCHAR(255),
    sku VARCHAR(255),
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    total NUMERIC(12, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    state VARCHAR(100) NOT NULL DEFAULT 'Não informado',
    platform VARCHAR(255),
    status VARCHAR(255),
    cancel_by VARCHAR(255),
    cancel_reason TEXT,
    image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Primary composite index for UPSERT operations
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_order_product_variation
ON sales (order_id, product, COALESCE(variation, ''));

-- Performance indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_store ON sales (store);
CREATE INDEX IF NOT EXISTS idx_sales_state ON sales (state);
CREATE INDEX IF NOT EXISTS idx_sales_platform ON sales (platform);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_product ON sales (product);
CREATE INDEX IF NOT EXISTS idx_sales_ad_name ON sales (ad_name);

-- Composite indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_sales_date_store ON sales (date DESC, store);
CREATE INDEX IF NOT EXISTS idx_sales_date_state ON sales (date DESC, state);
CREATE INDEX IF NOT EXISTS idx_sales_date_platform ON sales (date DESC, platform);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE
    ON sales FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE sales IS 'Sales order line items from uploaded Excel/CSV files';
COMMENT ON COLUMN sales.order_id IS 'Order identifier from source platform (not guaranteed unique - multiple line items per order)';
COMMENT ON COLUMN sales.date IS 'Order date and time';
COMMENT ON COLUMN sales.quantity IS 'Number of units in this line item';
COMMENT ON COLUMN sales.total IS 'Total value for this line item';
COMMENT ON COLUMN sales.unit_price IS 'Price per unit (calculated or provided)';
