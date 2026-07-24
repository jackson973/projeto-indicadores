-- Âncora da ocorrência de recorrência.
-- A geração de lançamentos deduplicava por (recurrence_id, date) — usando a
-- data EDITÁVEL. Ao mover o vencimento de um lançamento gerado, a geração
-- deixava de encontrá-lo na data original e RECRIAVA um duplicado.
--
-- recurrence_date fixa a data que a geração planejou para aquela ocorrência.
-- A dedup passa a olhar essa âncora (nunca a data editável), então mover o
-- vencimento não recria nada. Vários vencimentos no mesmo mês (semanal /
-- parcelas em dias diferentes) seguem funcionando: cada um tem sua âncora.
--
-- IMPORTANTE: recurrence_date é usada SOMENTE na geração/dedup. Nenhum cálculo
-- financeiro (saldo, a vencer, vencidos, dashboard) a utiliza — tudo continua
-- pela coluna date real.
ALTER TABLE cashflow_entries ADD COLUMN IF NOT EXISTS recurrence_date DATE;

-- Backfill: ancora os lançamentos de recorrência já existentes onde estão hoje.
UPDATE cashflow_entries
SET recurrence_date = date
WHERE recurrence_id IS NOT NULL AND recurrence_date IS NULL;

-- Acelera a checagem de existência da geração.
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_recurrence_anchor
  ON cashflow_entries (recurrence_id, recurrence_date)
  WHERE recurrence_id IS NOT NULL;
