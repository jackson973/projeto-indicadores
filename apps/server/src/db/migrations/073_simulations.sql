-- Módulo Análise de Custo e Preço — Fase 3 (simulador de cenários, snapshot congelado)

CREATE TABLE IF NOT EXISTS pricing_simulations (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    mode          VARCHAR(10) NOT NULL DEFAULT 'mix',   -- 'mix' | 'single'
    user_id       BIGINT REFERENCES users(id),
    total_vendas  INTEGER NOT NULL DEFAULT 0,
    total_fat     NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_lucro   NUMERIC(14,2) NOT NULL DEFAULT 0,
    data          JSONB NOT NULL,                       -- snapshot completo do cenário
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pricing_sim_created ON pricing_simulations(created_at DESC);
