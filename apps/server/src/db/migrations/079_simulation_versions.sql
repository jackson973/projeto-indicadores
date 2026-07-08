-- Simulador: agrupamento de versões — cada salvamento/duplicação de um cenário
-- existente vira uma nova versão do mesmo grupo (group_id = id da v1).

ALTER TABLE pricing_simulations ADD COLUMN IF NOT EXISTS group_id BIGINT;
ALTER TABLE pricing_simulations ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Backfill: cenários existentes com o mesmo nome viram versões do mesmo grupo
-- (ordenadas por data de criação; o mais antigo é a v1 e define o grupo).
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (PARTITION BY name ORDER BY created_at, id) AS root_id,
         ROW_NUMBER()   OVER (PARTITION BY name ORDER BY created_at, id) AS rn
    FROM pricing_simulations
)
UPDATE pricing_simulations p
   SET group_id = r.root_id,
       version  = r.rn
  FROM ranked r
 WHERE p.id = r.id
   AND p.group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_sim_group ON pricing_simulations(group_id, version);
