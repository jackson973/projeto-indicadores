-- Índice para busca rápida de clientes por nome/CNPJ/código
-- pg_trgm permite usar ILIKE/LIKE com índice GIN
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_order_customers_search
  ON order_customers USING gin (
    (COALESCE(fantasy_name, '') || ' ' || COALESCE(company_name, '') || ' ' || COALESCE(sisplan_id, '') || ' ' || COALESCE(cnpj, '') || ' ' || COALESCE(cidade, ''))
    gin_trgm_ops
  );
