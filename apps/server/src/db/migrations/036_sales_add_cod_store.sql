-- Add cod_store column to sales, referencing stores(id)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cod_store BIGINT REFERENCES stores(id);

-- Populate cod_store based on existing store name
UPDATE sales s
SET cod_store = st.id
FROM stores st
WHERE s.store = st.name
  AND s.cod_store IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_cod_store ON sales(cod_store);
