-- Add WhatsApp phone number to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20);
