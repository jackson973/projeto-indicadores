-- ============================================================
-- Códigos de barras vinculados aos produtos do catálogo de pedidos
-- Mapeamento N:1 — muitos EANs apontam para um produto+tamanho
-- Usado para scanner/bipagem na separação e criação de pedidos
-- ============================================================

-- Coluna EAN na tabela de produtos do Sisplan (preenchida pelo sync)
ALTER TABLE sisplan_products ADD COLUMN IF NOT EXISTS ean VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sisplan_products_ean ON sisplan_products(ean) WHERE ean IS NOT NULL;

-- Tabela de barcodes vinculados ao catálogo de pedidos
CREATE TABLE IF NOT EXISTS order_catalog_barcodes (
    id                  BIGSERIAL PRIMARY KEY,
    catalog_product_id  BIGINT NOT NULL REFERENCES order_catalog_products(id) ON DELETE CASCADE,
    size_name           VARCHAR(50) NOT NULL,
    barcode             VARCHAR(100) NOT NULL UNIQUE,
    sisplan_sku         VARCHAR(255),
    label               VARCHAR(500),          -- descrição visual (ex: "Conj Soft Panda Azul Bebe")
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_catalog_barcodes_product ON order_catalog_barcodes(catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_order_catalog_barcodes_barcode ON order_catalog_barcodes(barcode);
