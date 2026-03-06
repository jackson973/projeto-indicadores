-- Add 'draft' status to terceiros_settlements and draft_data column
ALTER TABLE terceiros_settlements DROP CONSTRAINT IF EXISTS terceiros_settlements_status_check;
ALTER TABLE terceiros_settlements ADD CONSTRAINT terceiros_settlements_status_check
  CHECK (status IN ('draft', 'open', 'paid'));

-- Store draft state (selected OF ids, manual prices, edited quantities, etc.)
ALTER TABLE terceiros_settlements ADD COLUMN IF NOT EXISTS draft_data JSONB;
