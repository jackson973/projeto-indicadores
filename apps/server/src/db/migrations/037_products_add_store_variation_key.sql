-- Adiciona chave composta cod_store + variation à tabela products
-- Substitui o campo 'nome' como identificador único do produto

ALTER TABLE products ADD COLUMN IF NOT EXISTS cod_store BIGINT REFERENCES stores(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS variation VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_variation_key VARCHAR(500);

-- Popula a chave composta: "cod_store_variation"
-- Ex: "3_Kit 3 Calças Legging P"
UPDATE products
SET store_variation_key = cod_store || '_' || variation
WHERE cod_store IS NOT NULL AND variation IS NOT NULL AND store_variation_key IS NULL;

-- Unique constraint na chave composta
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_variation_key ON products(store_variation_key);
