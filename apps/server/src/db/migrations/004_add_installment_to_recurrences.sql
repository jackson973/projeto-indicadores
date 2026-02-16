ALTER TABLE cashflow_recurrences ADD COLUMN IF NOT EXISTS installment BOOLEAN NOT NULL DEFAULT false;
