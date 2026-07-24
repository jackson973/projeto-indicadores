-- ============================================================================
-- Diagnóstico das duplicatas de recorrência criadas pelo bug (antes da âncora).
--
-- Uma recorrência MENSAL só deveria ter UM lançamento por mês de competência.
-- O bug: ao mover o vencimento de um lançamento gerado, a geração recriava o
-- original na data agendada -> 2 lançamentos da mesma recorrência no mesmo mês.
--
-- Recorrências SEMANAIS têm vários por mês legitimamente -> ficam de fora.
-- NÃO apaga nada: só LISTA para conferência humana. A limpeza é o 2º bloco.
-- ============================================================================

-- 1) Grupos suspeitos: recorrência mensal com >1 lançamento no mesmo mês
SELECT r.id                                   AS recurrence_id,
       r.description                          AS recorrencia,
       b.name                                 AS caixa,
       to_char(e.date, 'YYYY-MM')             AS competencia,
       COUNT(*)                               AS qtd_no_mes,
       array_agg(e.id ORDER BY e.date)        AS entry_ids,
       array_agg(to_char(e.date,'DD/MM') ORDER BY e.date)            AS datas,
       array_agg(to_char(e.recurrence_date,'DD/MM') ORDER BY e.date) AS ancoras,
       array_agg(e.status ORDER BY e.date)    AS status,
       SUM(e.amount)                          AS soma_no_mes
FROM cashflow_entries e
JOIN cashflow_recurrences r ON r.id = e.recurrence_id
JOIN cashflow_boxes b       ON b.id = e.box_id
WHERE e.recurrence_id IS NOT NULL
  AND r.frequency = 'monthly'
GROUP BY r.id, r.description, b.name, to_char(e.date, 'YYYY-MM')
HAVING COUNT(*) > 1
ORDER BY b.name, r.description, competencia;

-- ============================================================================
-- 2) LIMPEZA (rode SÓ depois de conferir a lista acima).
--
-- Estratégia conservadora: em cada grupo suspeito, mantém o lançamento de
-- MAIOR id (normalmente o mais recente / o que o usuário está usando) e marca
-- os demais. Ajuste o critério se, ao revisar, o "bom" for outro.
--
-- 2a) PRÉ-VISUALIZAR exatamente o que seria apagado (fantasmas = não-máximo id):
--
-- WITH grupos AS (
--   SELECT e.id, e.recurrence_id, e.box_id, to_char(e.date,'YYYY-MM') AS ym,
--          ROW_NUMBER() OVER (
--            PARTITION BY e.recurrence_id, e.box_id, to_char(e.date,'YYYY-MM')
--            ORDER BY e.id DESC
--          ) AS rn
--   FROM cashflow_entries e
--   JOIN cashflow_recurrences r ON r.id = e.recurrence_id
--   WHERE e.recurrence_id IS NOT NULL AND r.frequency = 'monthly'
-- )
-- SELECT e.* FROM cashflow_entries e
-- JOIN grupos g ON g.id = e.id
-- WHERE g.rn > 1;   -- estes seriam removidos
--
-- 2b) APAGAR (descomente para executar de fato):
--
-- WITH grupos AS (
--   SELECT e.id,
--          ROW_NUMBER() OVER (
--            PARTITION BY e.recurrence_id, e.box_id, to_char(e.date,'YYYY-MM')
--            ORDER BY e.id DESC
--          ) AS rn
--   FROM cashflow_entries e
--   JOIN cashflow_recurrences r ON r.id = e.recurrence_id
--   WHERE e.recurrence_id IS NOT NULL AND r.frequency = 'monthly'
-- )
-- DELETE FROM cashflow_entries WHERE id IN (SELECT id FROM grupos WHERE rn > 1);
-- ============================================================================
