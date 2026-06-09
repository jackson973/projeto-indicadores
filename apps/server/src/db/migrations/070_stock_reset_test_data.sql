-- ============================================================
-- Limpeza dos dados de TESTE do módulo de Estoque.
-- Zera toda a movimentação e o estoque, sem distinção de tipo:
--   • TODAS as movimentações (entradas, saídas e ajustes/inventário)
--   • Sessões e contagens de inventário
--   • Saldo materializado de todas as variantes → 0
-- Mantém o catálogo: produtos, variantes, códigos de barras e motivos.
--
-- Cleanup pontual: roda uma única vez por banco (controle em
-- schema_migrations). Em banco novo/vazio é inócuo.
-- ============================================================

-- Movimentos primeiro (referenciam sessões de inventário).
DELETE FROM stock_movements;

-- Contagens e sessões de inventário (dados de teste).
DELETE FROM stock_inventory_counts;
DELETE FROM stock_inventory_sessions;

-- Reseta o saldo materializado de todas as variantes.
UPDATE stock_variants SET balance = 0;
