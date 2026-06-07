-- ============================================================
-- Módulo de Estoque (Controle de Estoque)
-- Independente: não reaproveita o catálogo de pedidos nem
-- integra com o Sisplan. Depósito único (sem multi-local).
--
-- Unidade de estoque = produto + tamanho (stock_variants).
-- Um produto-base (stock_products) gera N variantes (grade).
-- Cada variante pode ter VÁRIOS códigos de barras (stock_barcodes),
-- mas cada código de barras aponta para UMA única variante.
-- ============================================================

-- Produto-base: código, descrição e imagem compartilhados pela grade
CREATE TABLE IF NOT EXISTS stock_products (
    id          BIGSERIAL PRIMARY KEY,
    codigo      VARCHAR(50) NOT NULL UNIQUE,        -- ex: 010
    descricao   VARCHAR(500) NOT NULL,              -- ex: Trijunto de verão Menina
    image_url   VARCHAR(1000),
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Variante (produto + tamanho) — a unidade de estoque de fato
CREATE TABLE IF NOT EXISTS stock_variants (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
    tamanho     VARCHAR(20) NOT NULL,               -- ex: P, M, G
    codigo      VARCHAR(60) NOT NULL UNIQUE,        -- ex: 010-P
    min_stock   INTEGER NOT NULL DEFAULT 0,         -- estoque mínimo (por variante)
    balance     INTEGER NOT NULL DEFAULT 0,         -- saldo atual (materializado)
    sort_order  INTEGER NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(product_id, tamanho)
);

CREATE INDEX IF NOT EXISTS idx_stock_variants_product ON stock_variants(product_id);

-- Códigos de barras (N por variante; cada EAN é único globalmente)
CREATE TABLE IF NOT EXISTS stock_barcodes (
    id          BIGSERIAL PRIMARY KEY,
    variant_id  BIGINT NOT NULL REFERENCES stock_variants(id) ON DELETE CASCADE,
    barcode     VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_barcodes_variant ON stock_barcodes(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_barcodes_barcode ON stock_barcodes(barcode);

-- Motivos de movimentação (configuráveis pelo usuário)
CREATE TABLE IF NOT EXISTS stock_reasons (
    id          BIGSERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    direcao     VARCHAR(10) NOT NULL CHECK (direcao IN ('entrada','saida')),
    active      BOOLEAN NOT NULL DEFAULT true,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessões de inventário/acerto (modo contagem ou modo rápido)
CREATE TABLE IF NOT EXISTS stock_inventory_sessions (
    id          BIGSERIAL PRIMARY KEY,
    modo        VARCHAR(10) NOT NULL CHECK (modo IN ('contagem','rapido')),
    status      VARCHAR(12) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','finalizada','cancelada')),
    note        TEXT,
    user_id     BIGINT REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP
);

-- Movimentos de estoque (entrada/saída/ajuste).
-- qty é o DELTA COM SINAL aplicado ao saldo: entrada > 0, saída < 0, ajuste +/-.
CREATE TABLE IF NOT EXISTS stock_movements (
    id                   BIGSERIAL PRIMARY KEY,
    variant_id           BIGINT NOT NULL REFERENCES stock_variants(id),
    tipo                 VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada','saida','ajuste')),
    qty                  INTEGER NOT NULL,
    reason_id            BIGINT REFERENCES stock_reasons(id),
    resulting_balance    INTEGER NOT NULL,          -- saldo após o movimento (auditoria)
    note                 TEXT,
    inventory_session_id BIGINT REFERENCES stock_inventory_sessions(id),
    user_id              BIGINT REFERENCES users(id),
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tipo    ON stock_movements(tipo);

-- Linhas de contagem de cada sessão de inventário (modo contagem)
CREATE TABLE IF NOT EXISTS stock_inventory_counts (
    id          BIGSERIAL PRIMARY KEY,
    session_id  BIGINT NOT NULL REFERENCES stock_inventory_sessions(id) ON DELETE CASCADE,
    variant_id  BIGINT NOT NULL REFERENCES stock_variants(id),
    counted_qty INTEGER NOT NULL DEFAULT 0,
    system_qty  INTEGER,                            -- saldo do sistema no momento do fechamento
    diff        INTEGER,                            -- counted_qty - system_qty
    UNIQUE(session_id, variant_id)
);

-- Motivos padrão (só insere se a tabela ainda estiver vazia)
INSERT INTO stock_reasons (nome, direcao, sort_order)
SELECT * FROM (VALUES
    ('Compra',             'entrada', 0),
    ('Devolução',          'entrada', 1),
    ('Ajuste de entrada',  'entrada', 2),
    ('Venda',              'saida',   0),
    ('Perda/Quebra',       'saida',   1),
    ('Ajuste de saída',    'saida',   2)
) AS v(nome, direcao, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM stock_reasons);
