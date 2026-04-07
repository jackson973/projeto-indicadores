-- ============================================================
-- Sync reversa de pedidos do ERP + status deletado_erp
-- ============================================================

-- 1. Permitir status 'deletado_erp' na tabela orders
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('rascunho','enviado','concluido','cancelado','deletado_erp'));

-- 2. Permitir qty = 0 (itens cancelados no ERP)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_qty_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_qty_check CHECK (qty >= 0);

-- 3. Adicionar colunas de cor nos itens (sync reversa traz cor real do ERP)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sisplan_color_code VARCHAR(50);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sisplan_color_name VARCHAR(200);
