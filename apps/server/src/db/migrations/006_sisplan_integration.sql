-- Adicionar canal de venda na tabela sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_channel VARCHAR(20) NOT NULL DEFAULT 'online';
UPDATE sales SET sale_channel = 'online' WHERE sale_channel = 'online';
CREATE INDEX IF NOT EXISTS idx_sales_sale_channel ON sales (sale_channel);

-- Tabela de configurações do Sisplan (singleton)
CREATE TABLE IF NOT EXISTS sisplan_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    active BOOLEAN NOT NULL DEFAULT false,
    host VARCHAR(255),
    port INTEGER DEFAULT 3050,
    database_path VARCHAR(500),
    fb_user VARCHAR(255),
    fb_password_encrypted TEXT,
    sql_query TEXT,
    column_mapping JSONB DEFAULT '{}',
    sync_interval_minutes INTEGER NOT NULL DEFAULT 5,
    last_sync_at TIMESTAMP,
    last_sync_status VARCHAR(50),
    last_sync_message TEXT,
    last_sync_rows INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_sisplan_settings_updated_at BEFORE UPDATE
    ON sisplan_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir linha padrão
INSERT INTO sisplan_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
