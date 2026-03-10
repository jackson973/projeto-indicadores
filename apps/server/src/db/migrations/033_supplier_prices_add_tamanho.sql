ALTER TABLE terceiros_supplier_prices
  ADD COLUMN IF NOT EXISTS tamanho TEXT DEFAULT NULL;

COMMENT ON COLUMN terceiros_supplier_prices.tamanho IS
  'Tamanhos aplicáveis, separados por vírgula (ex: P,M,G). NULL = todos os tamanhos.';
