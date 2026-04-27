-- Observação por produto dentro de cada pedido (compartilhada entre tamanhos)
CREATE TABLE IF NOT EXISTS order_item_observations (
  order_id           BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  catalog_product_id BIGINT NOT NULL REFERENCES order_catalog_products(id) ON DELETE CASCADE,
  observation        TEXT NOT NULL,
  PRIMARY KEY (order_id, catalog_product_id)
);

CREATE INDEX IF NOT EXISTS idx_order_item_obs_order ON order_item_observations(order_id);
