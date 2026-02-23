-- Tabela de configurações do UpSeller (singleton)
CREATE TABLE IF NOT EXISTS upseller_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    active BOOLEAN NOT NULL DEFAULT false,

    -- Credenciais UpSeller
    upseller_email VARCHAR(255),
    upseller_password_encrypted TEXT,
    upseller_url VARCHAR(500) DEFAULT 'https://app.upseller.com/pt/login',

    -- CAPTCHA (AntiCaptcha)
    anticaptcha_key_encrypted TEXT,

    -- IMAP (para verificação de email 2FA)
    imap_host VARCHAR(255) DEFAULT 'imap.gmail.com',
    imap_port INTEGER DEFAULT 993,
    imap_user VARCHAR(255),
    imap_pass_encrypted TEXT,

    -- Configuração de sync
    sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
    default_days INTEGER NOT NULL DEFAULT 90,

    -- Status do último sync
    last_sync_at TIMESTAMP,
    last_sync_status VARCHAR(50),
    last_sync_message TEXT,
    last_sync_rows INTEGER DEFAULT 0,

    -- Cookies de sessão (reutilização entre syncs)
    session_cookies TEXT,
    session_saved_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_upseller_settings_updated_at BEFORE UPDATE
    ON upseller_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir linha padrão
INSERT INTO upseller_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
