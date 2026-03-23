CREATE TABLE IF NOT EXISTS payment_conditions (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  erp_code   VARCHAR(100) NOT NULL DEFAULT '',
  sort_order INT          NOT NULL DEFAULT 0,
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO payment_conditions (name, erp_code, sort_order) VALUES
  ('À Vista',        '0  ',          0),
  ('30',             '30 ',          1),
  ('30/60',          '30 60 ',       2),
  ('30/45/60',       '30 45 60 ',    3),
  ('30/60/90',       '30 60 90 ',    4),
  ('30/60/90/105',   '30 60 90 105', 5)
ON CONFLICT DO NOTHING;
