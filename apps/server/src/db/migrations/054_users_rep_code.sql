-- Add representative code field to users table (Sisplan integration)
ALTER TABLE users ADD COLUMN IF NOT EXISTS rep_code VARCHAR(20);
