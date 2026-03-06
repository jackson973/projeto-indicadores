-- ============================================================
-- Terceiros (Third-party Reconciliation) Module
-- ============================================================

-- 1. Product Groups
CREATE TABLE IF NOT EXISTS terceiros_product_groups (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_terceiros_product_groups_updated_at BEFORE UPDATE
    ON terceiros_product_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Products assigned to groups (by ERP product code)
CREATE TABLE IF NOT EXISTS terceiros_group_products (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES terceiros_product_groups(id) ON DELETE CASCADE,
    product_code VARCHAR(100) NOT NULL,
    product_name VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_code)
);

CREATE INDEX IF NOT EXISTS idx_terceiros_group_products_group ON terceiros_group_products (group_id);
CREATE INDEX IF NOT EXISTS idx_terceiros_group_products_code ON terceiros_group_products (product_code);

-- 3. Settlements (fechamentos) - created before OFs so FK can reference
CREATE TABLE IF NOT EXISTS terceiros_settlements (
    id BIGSERIAL PRIMARY KEY,
    codcli VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(500),
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
    paid_at TIMESTAMP,
    notes TEXT,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_terceiros_settlements_codcli ON terceiros_settlements (codcli);
CREATE INDEX IF NOT EXISTS idx_terceiros_settlements_month ON terceiros_settlements (reference_year, reference_month);
CREATE INDEX IF NOT EXISTS idx_terceiros_settlements_status ON terceiros_settlements (status);

CREATE TRIGGER update_terceiros_settlements_updated_at BEFORE UPDATE
    ON terceiros_settlements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. OFs (Ordens de Fabricacao) synced from Firebird/Sisplan
CREATE TABLE IF NOT EXISTS terceiros_ofs (
    id BIGSERIAL PRIMARY KEY,
    fac_numero VARCHAR(50) NOT NULL,
    fac_lancto VARCHAR(50),
    fac_dt_s DATE,
    fac_dt_lan DATE,
    fac_dt_prev_ret DATE,
    fac_codsetor VARCHAR(50),
    fac_descsetor VARCHAR(255),
    fac_qt_orig NUMERIC(12,2) DEFAULT 0,
    fac_quant NUMERIC(12,2) DEFAULT 0,
    fac_tam VARCHAR(50),
    fac_cor VARCHAR(50),
    fac_desccor VARCHAR(255),
    fac_parte VARCHAR(50),
    fac_descparte VARCHAR(255),
    fac_codigo_produto VARCHAR(100),
    fac_desc_produto VARCHAR(500),
    produto_unidade VARCHAR(20),
    fac_codcli VARCHAR(50),
    cliente_nome VARCHAR(500),
    ddd_fone VARCHAR(10),
    cliente_fone VARCHAR(50),
    fone_compl VARCHAR(100),
    cliente_endereco TEXT,
    num_end VARCHAR(20),
    cliente_bairro VARCHAR(255),
    cliente_cep VARCHAR(20),
    cliente_uf VARCHAR(5),
    cliente_cidade VARCHAR(255),
    cliente_complemento VARCHAR(255),
    cliente_cnpj VARCHAR(30),
    cliente_inscricao VARCHAR(30),
    cliente_fantasia VARCHAR(500),
    cliente_fax VARCHAR(50),
    fac_periodo_of VARCHAR(100),
    settlement_id BIGINT REFERENCES terceiros_settlements(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_terceiros_ofs_unique ON terceiros_ofs (
    fac_numero,
    COALESCE(fac_codsetor, ''),
    COALESCE(fac_codigo_produto, ''),
    COALESCE(fac_cor, ''),
    COALESCE(fac_parte, ''),
    COALESCE(fac_tam, '')
);

CREATE INDEX IF NOT EXISTS idx_terceiros_ofs_fac_numero ON terceiros_ofs (fac_numero);
CREATE INDEX IF NOT EXISTS idx_terceiros_ofs_codcli ON terceiros_ofs (fac_codcli);
CREATE INDEX IF NOT EXISTS idx_terceiros_ofs_dt_lan ON terceiros_ofs (fac_dt_lan);
CREATE INDEX IF NOT EXISTS idx_terceiros_ofs_dt_ret ON terceiros_ofs (fac_dt_prev_ret);
CREATE INDEX IF NOT EXISTS idx_terceiros_ofs_produto ON terceiros_ofs (fac_codigo_produto);
CREATE INDEX IF NOT EXISTS idx_terceiros_ofs_settlement ON terceiros_ofs (settlement_id);

CREATE TRIGGER update_terceiros_ofs_updated_at BEFORE UPDATE
    ON terceiros_ofs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Supplier-Group price association with validity periods
CREATE TABLE IF NOT EXISTS terceiros_supplier_prices (
    id BIGSERIAL PRIMARY KEY,
    codcli VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(500),
    group_id BIGINT NOT NULL REFERENCES terceiros_product_groups(id) ON DELETE CASCADE,
    part VARCHAR(50),
    price NUMERIC(12,4) NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_terceiros_supplier_prices_codcli ON terceiros_supplier_prices (codcli);
CREATE INDEX IF NOT EXISTS idx_terceiros_supplier_prices_group ON terceiros_supplier_prices (group_id);
CREATE INDEX IF NOT EXISTS idx_terceiros_supplier_prices_validity ON terceiros_supplier_prices (valid_from, valid_until);

CREATE TRIGGER update_terceiros_supplier_prices_updated_at BEFORE UPDATE
    ON terceiros_supplier_prices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Settlement items (linking OFs to a settlement)
CREATE TABLE IF NOT EXISTS terceiros_settlement_items (
    id BIGSERIAL PRIMARY KEY,
    settlement_id BIGINT NOT NULL REFERENCES terceiros_settlements(id) ON DELETE CASCADE,
    of_id BIGINT NOT NULL REFERENCES terceiros_ofs(id),
    quantity NUMERIC(12,2) NOT NULL,
    unit_price NUMERIC(12,4) NOT NULL,
    total_price NUMERIC(14,2) NOT NULL,
    price_source VARCHAR(50) DEFAULT 'table',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(settlement_id, of_id)
);

CREATE INDEX IF NOT EXISTS idx_terceiros_settlement_items_settlement ON terceiros_settlement_items (settlement_id);
CREATE INDEX IF NOT EXISTS idx_terceiros_settlement_items_of ON terceiros_settlement_items (of_id);

-- 7. Add OF sync columns to sisplan_settings
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS of_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS of_sql_query TEXT;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS of_column_mapping JSONB DEFAULT '{}';
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS of_last_sync_at TIMESTAMP;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS of_last_sync_status VARCHAR(50);
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS of_last_sync_message TEXT;
ALTER TABLE sisplan_settings ADD COLUMN IF NOT EXISTS of_last_sync_rows INTEGER DEFAULT 0;
