-- Re-populate cod_store with flexible matching (TRIM + case-insensitive)
UPDATE sales s
SET cod_store = st.id
FROM stores st
WHERE LOWER(TRIM(s.store)) = LOWER(TRIM(st.name))
  AND s.cod_store IS NULL;

-- Also try matching by platform_seller_name (UpSeller shopName might match this)
UPDATE sales s
SET cod_store = st.id
FROM stores st
WHERE s.cod_store IS NULL
  AND st.platform_seller_name IS NOT NULL
  AND LOWER(TRIM(s.store)) = LOWER(TRIM(st.platform_seller_name));
