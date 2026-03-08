-- Daily snapshots of ML listings for trend calculation
CREATE TABLE IF NOT EXISTS ml_anuncios_snapshots (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER     NOT NULL,
  item_id         VARCHAR(50) NOT NULL,
  snapshot_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  visits          INTEGER     DEFAULT 0,
  sold_quantity   INTEGER     DEFAULT 0,
  available_quantity INTEGER  DEFAULT 0,
  price           NUMERIC(10,2) DEFAULT 0,
  UNIQUE(store_id, item_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ml_snapshots_lookup
  ON ml_anuncios_snapshots(store_id, item_id, snapshot_date DESC);
