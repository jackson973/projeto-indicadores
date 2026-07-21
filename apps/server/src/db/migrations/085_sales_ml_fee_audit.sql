-- Auditoria do Lucro ML: registrar o percentual de tarifa aplicado e a fonte
-- usada no cálculo de cada pedido, para conferência contra a tela do ML
-- (ex.: tarifa 19% vs 15% na faixa >= R$150).
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS ml_fee_pct     numeric(5,2),
  ADD COLUMN IF NOT EXISTS ml_fees_source varchar(30);
