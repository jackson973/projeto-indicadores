-- Add etapa column to supplier prices (optional - NULL means applies to all etapas)
ALTER TABLE terceiros_supplier_prices ADD COLUMN IF NOT EXISTS etapa VARCHAR(50);

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_terceiros_supplier_prices_etapa ON terceiros_supplier_prices (etapa);
