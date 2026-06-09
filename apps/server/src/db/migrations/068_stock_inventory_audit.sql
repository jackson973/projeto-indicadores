-- Inventário: corrige fuso dos timestamps e adiciona auditoria por item.
--
-- 1) Timestamps das sessões viram TIMESTAMPTZ (instante real).
--    Os valores naive existentes foram gravados em UTC (CURRENT_TIMESTAMP do
--    servidor), então rotulamos como UTC ao converter — assim o instante fica
--    correto e a exibição em America/Sao_Paulo passa a bater.
ALTER TABLE stock_inventory_sessions
  ALTER COLUMN created_at  TYPE TIMESTAMPTZ USING created_at  AT TIME ZONE 'UTC',
  ALTER COLUMN created_at  SET DEFAULT now(),
  ALTER COLUMN finished_at TYPE TIMESTAMPTZ USING finished_at AT TIME ZONE 'UTC';

-- 2) Auditoria por item contado: quem lançou e quando (criação e última edição).
ALTER TABLE stock_inventory_counts
  ADD COLUMN IF NOT EXISTS counted_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS counted_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3) Movimentos de estoque também viram TIMESTAMPTZ, para que os filtros de
--    data do relatório de movimentações respeitem o fuso de Brasília.
ALTER TABLE stock_movements
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at SET DEFAULT now();
