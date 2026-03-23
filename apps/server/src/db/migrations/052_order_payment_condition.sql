ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_condition     VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_condition_erp VARCHAR(100);
