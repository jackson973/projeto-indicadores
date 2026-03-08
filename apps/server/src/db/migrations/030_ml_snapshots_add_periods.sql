-- Add multi-period visit columns to support 7d/15d/30d temporal analysis
ALTER TABLE ml_anuncios_snapshots
  ADD COLUMN IF NOT EXISTS visits_7d  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visits_15d INTEGER DEFAULT 0;
