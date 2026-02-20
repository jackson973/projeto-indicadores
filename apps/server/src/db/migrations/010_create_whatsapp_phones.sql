-- History of connected WhatsApp phone numbers
CREATE TABLE IF NOT EXISTS whatsapp_phones (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  label VARCHAR(100),
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
