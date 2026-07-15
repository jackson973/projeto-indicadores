-- Fluxo de caixa: comprovantes anexos + campo de detalhes do lançamento

ALTER TABLE cashflow_entries ADD COLUMN IF NOT EXISTS details TEXT;

CREATE TABLE IF NOT EXISTS cashflow_attachments (
    id            BIGSERIAL PRIMARY KEY,
    entry_id      BIGINT NOT NULL REFERENCES cashflow_entries(id) ON DELETE CASCADE,
    file_path     VARCHAR(500) NOT NULL,   -- relativo a uploads/ (ex.: cashflow/123_...png)
    original_name VARCHAR(255),
    mime_type     VARCHAR(100),
    size_bytes    BIGINT,
    created_by    BIGINT REFERENCES users(id),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cashflow_attachments_entry ON cashflow_attachments(entry_id);
