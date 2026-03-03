ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_nome_fantasia ON notas_fiscais (nome_fantasia);
