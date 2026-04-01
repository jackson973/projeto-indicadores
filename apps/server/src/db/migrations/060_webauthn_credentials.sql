-- WebAuthn credentials for biometric login
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key BYTEA NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    device_type VARCHAR(32),
    backed_up BOOLEAN NOT NULL DEFAULT false,
    transports TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON webauthn_credentials(user_id);

-- Per-user challenge storage for ongoing WebAuthn ceremonies
ALTER TABLE users ADD COLUMN IF NOT EXISTS webauthn_challenge TEXT;
