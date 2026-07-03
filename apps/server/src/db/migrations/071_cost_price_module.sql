-- Módulo Análise de Custo e Preço — Fase 1 (fundação: custo médio, fornecedores, kit padrão)

-- Custo médio móvel materializado na variante
ALTER TABLE stock_variants  ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(12,4) NOT NULL DEFAULT 0;

-- Custo unitário capturado em cada entrada (por peça)
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,4);

-- Kit padrão do produto (peças por venda)
ALTER TABLE stock_products  ADD COLUMN IF NOT EXISTS default_kit_qty INTEGER NOT NULL DEFAULT 1;

-- Fornecedores (cadastro próprio, manual)
CREATE TABLE IF NOT EXISTS suppliers (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    document    VARCHAR(30),
    contact     VARCHAR(255),
    note        TEXT,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Custo por produto (× fornecedor) com vigência — referência que pré-preenche a entrada
CREATE TABLE IF NOT EXISTS stock_product_costs (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
    variant_id  BIGINT REFERENCES stock_variants(id) ON DELETE CASCADE, -- NULL = vale p/ o produto (futuro: por variante)
    supplier_id BIGINT REFERENCES suppliers(id),
    cost        NUMERIC(12,4) NOT NULL,
    valid_from  DATE NOT NULL,
    valid_until DATE,           -- NULL = vigente
    note        TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spc_product  ON stock_product_costs(product_id);
CREATE INDEX IF NOT EXISTS idx_spc_supplier ON stock_product_costs(supplier_id);
