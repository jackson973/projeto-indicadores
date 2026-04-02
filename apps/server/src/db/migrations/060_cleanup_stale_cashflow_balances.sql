-- Keep only the earliest (seed) balance per box, removing stale intermediates.
-- The new getBalance() logic always calculates from the seed, so intermediate
-- records are unused and can cause confusion if they drift from reality.
DELETE FROM cashflow_balances
WHERE id NOT IN (
  SELECT DISTINCT ON (box_id) id
  FROM cashflow_balances
  ORDER BY box_id, year ASC, month ASC
);
