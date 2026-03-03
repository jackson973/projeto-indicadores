-- Adicionar coluna CNPJ na tabela notas_fiscais
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS cnpj TEXT;
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_cnpj ON notas_fiscais (cnpj);
