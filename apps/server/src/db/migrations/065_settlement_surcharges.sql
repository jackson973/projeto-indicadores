-- Settlement surcharges (acréscimos) — mirrors discounts but added to total
CREATE TABLE IF NOT EXISTS terceiros_settlement_surcharges (
    id BIGSERIAL PRIMARY KEY,
    settlement_id BIGINT NOT NULL REFERENCES terceiros_settlements(id) ON DELETE CASCADE,
    description VARCHAR(500) NOT NULL,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settlement_surcharges_settlement ON terceiros_settlement_surcharges(settlement_id);

ALTER TABLE terceiros_settlements ADD COLUMN IF NOT EXISTS total_surcharges NUMERIC(14,2) NOT NULL DEFAULT 0;
