-- Fase 4: controle de acesso por módulo (perfis × módulos × usuário)

CREATE TABLE IF NOT EXISTS access_profiles (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(120) NOT NULL UNIQUE,
    is_admin   BOOLEAN NOT NULL DEFAULT false,   -- true = acesso total (ignora lista de módulos)
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_profile_modules (
    profile_id BIGINT NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL,
    PRIMARY KEY (profile_id, module_key)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_id BIGINT REFERENCES access_profiles(id);

-- Perfil Administrador (acesso total) se ainda não houver perfis
INSERT INTO access_profiles (name, is_admin)
SELECT 'Administrador', true
WHERE NOT EXISTS (SELECT 1 FROM access_profiles);
