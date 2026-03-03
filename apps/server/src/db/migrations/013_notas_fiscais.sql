-- Tabela de notas fiscais sincronizadas do Firebird/Sisplan
CREATE TABLE IF NOT EXISTS notas_fiscais (
    id SERIAL PRIMARY KEY,
    numero_nf INTEGER NOT NULL,
    serie INTEGER NOT NULL DEFAULT 1,
    ordem_id VARCHAR(100),
    codcli VARCHAR(50),
    nome_cliente VARCHAR(300),
    valor NUMERIC(12,2),
    data_emissao DATE NOT NULL,
    chave_acesso VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(numero_nf, serie)
);

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_codcli ON notas_fiscais (codcli);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_nome_cliente ON notas_fiscais (nome_cliente);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_data_emissao ON notas_fiscais (data_emissao);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_ordem_id ON notas_fiscais (ordem_id);

CREATE TRIGGER update_notas_fiscais_updated_at BEFORE UPDATE
    ON notas_fiscais FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Adicionar colunas de NF na tabela sisplan_settings
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_sql_query TEXT;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_column_mapping JSONB DEFAULT '{}';
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_base_path VARCHAR(500);
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_last_sync_at TIMESTAMP;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_last_sync_status VARCHAR(50);
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_last_sync_message TEXT;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS nf_last_sync_rows INTEGER DEFAULT 0;
