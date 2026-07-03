-- Preço de compra inicial (semeia o custo médio) e preço de venda atual, no cadastro do produto.
ALTER TABLE stock_products ADD COLUMN IF NOT EXISTS initial_cost NUMERIC(12,4);
ALTER TABLE stock_products ADD COLUMN IF NOT EXISTS sale_price   NUMERIC(12,2);
