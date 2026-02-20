-- Add client fields to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS codcli VARCHAR(100);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS nome_fantasia VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cnpj_cpf VARCHAR(20);

-- Indexes for searching
CREATE INDEX IF NOT EXISTS idx_sales_client_name ON sales (client_name);
CREATE INDEX IF NOT EXISTS idx_sales_codcli ON sales (codcli);
CREATE INDEX IF NOT EXISTS idx_sales_cnpj_cpf ON sales (cnpj_cpf);
