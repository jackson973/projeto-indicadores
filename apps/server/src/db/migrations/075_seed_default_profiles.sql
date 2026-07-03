-- Fase 4b: acesso passa a ser 100% pelo perfil. Cria "Operador" e faz backfill dos usuários.

-- Perfil Operador (o que os não-admin já viam)
INSERT INTO access_profiles (name, is_admin)
SELECT 'Operador', false
WHERE NOT EXISTS (SELECT 1 FROM access_profiles WHERE name = 'Operador');

INSERT INTO access_profile_modules (profile_id, module_key)
SELECT (SELECT id FROM access_profiles WHERE name = 'Operador'), k
FROM (VALUES ('dashboard'),('financeiro'),('financial-dashboard'),('produtos'),('pedidos'),('estoque'),('terceiros')) AS m(k)
WHERE EXISTS (SELECT 1 FROM access_profiles WHERE name = 'Operador')
  AND NOT EXISTS (
    SELECT 1 FROM access_profile_modules
    WHERE profile_id = (SELECT id FROM access_profiles WHERE name = 'Operador')
  );

-- Backfill: usuários sem perfil recebem um perfil conforme o role legado
UPDATE users SET profile_id = (SELECT id FROM access_profiles WHERE name = 'Administrador' ORDER BY id LIMIT 1)
 WHERE profile_id IS NULL AND role = 'admin';

UPDATE users SET profile_id = (SELECT id FROM access_profiles WHERE name = 'Operador' ORDER BY id LIMIT 1)
 WHERE profile_id IS NULL AND role <> 'admin';
