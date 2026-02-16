-- Tabela cashflow_boxes
CREATE TABLE IF NOT EXISTS cashflow_boxes (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_cashflow_boxes_updated_at BEFORE UPDATE
    ON cashflow_boxes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Box padrão
INSERT INTO cashflow_boxes (name) VALUES ('Caixa Principal');

-- box_id em cashflow_entries (nullable -> migrar -> NOT NULL)
ALTER TABLE cashflow_entries ADD COLUMN IF NOT EXISTS box_id BIGINT REFERENCES cashflow_boxes(id);
UPDATE cashflow_entries SET box_id = (SELECT id FROM cashflow_boxes WHERE name = 'Caixa Principal' LIMIT 1) WHERE box_id IS NULL;
ALTER TABLE cashflow_entries ALTER COLUMN box_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_box ON cashflow_entries (box_id);

-- box_id em cashflow_balances
ALTER TABLE cashflow_balances ADD COLUMN IF NOT EXISTS box_id BIGINT REFERENCES cashflow_boxes(id);
UPDATE cashflow_balances SET box_id = (SELECT id FROM cashflow_boxes WHERE name = 'Caixa Principal' LIMIT 1) WHERE box_id IS NULL;
ALTER TABLE cashflow_balances ALTER COLUMN box_id SET NOT NULL;
ALTER TABLE cashflow_balances DROP CONSTRAINT IF EXISTS cashflow_balances_year_month_key;
ALTER TABLE cashflow_balances ADD CONSTRAINT cashflow_balances_year_month_box_key UNIQUE (year, month, box_id);

-- box_id em cashflow_recurrences
ALTER TABLE cashflow_recurrences ADD COLUMN IF NOT EXISTS box_id BIGINT REFERENCES cashflow_boxes(id);
UPDATE cashflow_recurrences SET box_id = (SELECT id FROM cashflow_boxes WHERE name = 'Caixa Principal' LIMIT 1) WHERE box_id IS NULL;
ALTER TABLE cashflow_recurrences ALTER COLUMN box_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashflow_recurrences_box ON cashflow_recurrences (box_id);
