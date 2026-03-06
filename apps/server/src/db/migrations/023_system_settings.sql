-- System settings (singleton table for logo, company info)
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    logo_path VARCHAR(500),
    company_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_system_settings_updated_at') THEN
        CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE
            ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

INSERT INTO system_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
