-- Relatório de Lucro ML: valores REAIS por pedido vindos da API do Mercado Livre.
-- Comissão/frete são armazenados com sinal negativo (débito), estorno positivo (crédito).
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS ml_fee_amount      numeric(12,2),
  ADD COLUMN IF NOT EXISTS ml_shipping_cost   numeric(12,2),
  ADD COLUMN IF NOT EXISTS ml_bonus_amount    numeric(12,2),
  ADD COLUMN IF NOT EXISTS ml_net_received    numeric(12,2),
  ADD COLUMN IF NOT EXISTS ml_fees_synced_at  timestamptz;

-- Busca dos pedidos ainda não sincronizados de um dia
CREATE INDEX IF NOT EXISTS idx_sales_ml_fees_pending
  ON sales (date)
  WHERE platform = 'Mercado Livre' AND ml_fees_synced_at IS NULL;
