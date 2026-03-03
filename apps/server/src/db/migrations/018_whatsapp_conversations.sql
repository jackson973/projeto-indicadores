-- Log de conversas do WhatsApp Bot
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(100),
  user_phone VARCHAR(20),
  question TEXT NOT NULL,
  response TEXT,
  tool_calls JSONB,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_created_at ON whatsapp_conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_user_id ON whatsapp_conversations (user_id);
