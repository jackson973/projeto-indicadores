-- Corrige ad_name em product_group_items para usar cod_store numérico
-- no lugar do nome da loja, alinhando com o formato atual das sales.
--
-- Antes: "Pula Pula Pipoquinha Moda Kids (Shopee)|||Kit 6 peças..."
-- Depois: "4|||Kit 6 peças..."

-- Matching por store.name
UPDATE product_group_items gi
SET ad_name = st.id::text || '|||' || SPLIT_PART(gi.ad_name, '|||', 2)
FROM stores st
WHERE LOWER(TRIM(SPLIT_PART(gi.ad_name, '|||', 1))) = LOWER(TRIM(st.name))
  AND gi.ad_name NOT LIKE '%|||%|||%'   -- garante que tem exatamente 1 separador
  AND SPLIT_PART(gi.ad_name, '|||', 1) ~ '^[^0-9]'; -- ainda está com nome (não numérico)

-- Matching por store.platform_seller_name
UPDATE product_group_items gi
SET ad_name = st.id::text || '|||' || SPLIT_PART(gi.ad_name, '|||', 2)
FROM stores st
WHERE st.platform_seller_name IS NOT NULL
  AND LOWER(TRIM(SPLIT_PART(gi.ad_name, '|||', 1))) = LOWER(TRIM(st.platform_seller_name))
  AND gi.ad_name NOT LIKE '%|||%|||%'
  AND SPLIT_PART(gi.ad_name, '|||', 1) ~ '^[^0-9]';
