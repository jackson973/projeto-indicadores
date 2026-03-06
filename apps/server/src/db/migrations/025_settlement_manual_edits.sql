-- Track manual quantity/price edits on settlement items
ALTER TABLE terceiros_settlement_items
  ADD COLUMN IF NOT EXISTS original_quantity NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS original_unit_price NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN NOT NULL DEFAULT false;
