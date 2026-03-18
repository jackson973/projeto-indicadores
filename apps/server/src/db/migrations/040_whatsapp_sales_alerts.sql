-- WhatsApp sales alerts: per-user periodic alert preferences
CREATE TABLE IF NOT EXISTS whatsapp_sales_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT false,
  interval_hours INTEGER NOT NULL DEFAULT 1 CHECK (interval_hours IN (1, 2, 3, 4, 6, 8, 12)),
  hour_start INTEGER NOT NULL DEFAULT 8 CHECK (hour_start >= 0 AND hour_start <= 23),
  hour_end INTEGER NOT NULL DEFAULT 22 CHECK (hour_end >= 0 AND hour_end <= 23),
  peak_alert BOOLEAN NOT NULL DEFAULT false,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sales_alerts_active ON whatsapp_sales_alerts(active) WHERE active = true;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_sales_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_sales_alerts_updated ON whatsapp_sales_alerts;
CREATE TRIGGER trg_whatsapp_sales_alerts_updated
  BEFORE UPDATE ON whatsapp_sales_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_sales_alerts_updated_at();
