-- ============================================================
-- Gerenciamento de Lojas (Store Management) Module
-- ============================================================

CREATE TABLE IF NOT EXISTS stores (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('mercadolivre', 'shopee', 'tiktok', 'shein')),
    platform_user_id VARCHAR(255),
    platform_seller_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
    -- Credentials stored encrypted (AES-256-GCM via SISPLAN_ENCRYPTION_KEY)
    client_id_enc TEXT,
    client_secret_enc TEXT,
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    token_expires_at TIMESTAMP,
    last_sync_at TIMESTAMP,
    total_listings INTEGER DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE
    ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_stores_platform ON stores (platform);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores (status);
