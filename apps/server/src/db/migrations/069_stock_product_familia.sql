-- ============================================================
-- Campo "família" no produto-base do estoque.
-- Agrupa produtos de mesma linha que têm códigos diferentes
-- (ex.: "Soft Menino" e "Soft Menina" → família "Soft").
-- Usado no Dashboard de Separação para o ranking por família.
-- Quando vazio, o dashboard cai no 1º termo da descrição como heurística.
-- ============================================================

ALTER TABLE stock_products ADD COLUMN IF NOT EXISTS familia VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_stock_products_familia ON stock_products(familia) WHERE familia IS NOT NULL;
