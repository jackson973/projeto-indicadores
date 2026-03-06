-- Settlement discounts
CREATE TABLE IF NOT EXISTS terceiros_settlement_discounts (
    id BIGSERIAL PRIMARY KEY,
    settlement_id BIGINT NOT NULL REFERENCES terceiros_settlements(id) ON DELETE CASCADE,
    description VARCHAR(500) NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settlement_discounts_settlement ON terceiros_settlement_discounts(settlement_id);

ALTER TABLE terceiros_settlements ADD COLUMN IF NOT EXISTS total_discounts NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE terceiros_settlements ADD COLUMN IF NOT EXISTS total_payable NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Backfill total_payable for existing settlements
UPDATE terceiros_settlements SET total_payable = total_amount WHERE total_payable = 0 AND total_amount > 0;
