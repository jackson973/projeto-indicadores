-- ============================================================
-- Módulo de API externa (Configurações → API)
-- Credenciais (chaves) para sistemas externos (BI, integrações)
-- com escopo por rota e log de requisições.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_clients (
    id                 BIGSERIAL PRIMARY KEY,
    name               VARCHAR(120) NOT NULL,
    description        TEXT,
    key_prefix         VARCHAR(20)  NOT NULL,          -- primeiros caracteres da chave (identificação visual)
    key_hash           VARCHAR(128) NOT NULL UNIQUE,   -- sha256 da chave completa (a chave nunca é armazenada)
    scopes             TEXT[]       NOT NULL DEFAULT '{}', -- rotas liberadas (ex: sales, stock) ou '*'
    active             BOOLEAN      NOT NULL DEFAULT true,
    rate_limit_per_min INTEGER      NOT NULL DEFAULT 120,
    expires_at         TIMESTAMPTZ,
    last_used_at       TIMESTAMPTZ,
    request_count      BIGINT       NOT NULL DEFAULT 0,
    created_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_clients_active ON api_clients(active);

CREATE TABLE IF NOT EXISTS api_request_logs (
    id          BIGSERIAL PRIMARY KEY,
    client_id   BIGINT REFERENCES api_clients(id) ON DELETE CASCADE,
    method      VARCHAR(10),
    path        VARCHAR(500),
    route_key   VARCHAR(50),
    status_code INTEGER,
    duration_ms INTEGER,
    ip          VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_client ON api_request_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created ON api_request_logs(created_at DESC);
