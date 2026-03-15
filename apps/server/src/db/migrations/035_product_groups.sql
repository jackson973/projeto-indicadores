-- ============================================================
-- Grupos de Produtos — módulo independente (Gerenciamento de Produtos)
-- Agrupa anúncios (ad_name da tabela sales) em grupos lógicos
-- ============================================================

CREATE TABLE IF NOT EXISTS product_groups (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_product_groups_updated_at BEFORE UPDATE
    ON product_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS product_group_items (
    id          BIGSERIAL PRIMARY KEY,
    group_id    BIGINT NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
    ad_name     VARCHAR(500) NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ad_name)
);

CREATE INDEX IF NOT EXISTS idx_product_group_items_group ON product_group_items(group_id);
CREATE INDEX IF NOT EXISTS idx_product_group_items_ad ON product_group_items(ad_name);
