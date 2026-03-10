-- Recalcula total_items de todos os fechamentos para usar SUM(quantity) em vez de COUNT(*)
UPDATE terceiros_settlements s
SET total_items = (
  SELECT COALESCE(SUM(quantity), 0)
  FROM terceiros_settlement_items
  WHERE settlement_id = s.id
);
