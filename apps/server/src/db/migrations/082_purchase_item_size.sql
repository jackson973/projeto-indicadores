-- Compras: itens por tamanho (uma linha por tamanho da grade) —
-- prepara o vínculo da ordem de compra com a entrada de estoque por variante.
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS size VARCHAR(20);
