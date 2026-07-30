-- Cadastro completo de clientes sincronizado do Sisplan (ENTIDADE_001)
CREATE TABLE IF NOT EXISTS sisplan_customers (
    id                  BIGSERIAL PRIMARY KEY,
    codcli              VARCHAR(50) NOT NULL UNIQUE,   -- idERP
    company_name        VARCHAR(500),                  -- razão social (NOME)
    fantasy_name        VARCHAR(500),                  -- FANTASIA (ou NOME se vazio)
    cnpj                VARCHAR(30),
    customer_category   VARCHAR(10),
    customer_type       VARCHAR(20),
    cep                 VARCHAR(20),
    street              TEXT,
    address_number      VARCHAR(20),
    neighborhood        VARCHAR(255),
    billing_cep         VARCHAR(20),
    billing_street      TEXT,
    billing_neighborhood VARCHAR(255),
    state_inscription   VARCHAR(50),
    credit_limit        NUMERIC(14,2),
    city_id             VARCHAR(20),
    uf                  VARCHAR(5),
    city                VARCHAR(255),
    is_no_tax           BOOLEAN DEFAULT false,
    active              BOOLEAN DEFAULT true,          -- financialSituation (ATIVO)
    suframa             VARCHAR(50),
    activity_id         VARCHAR(20),
    is_final_customer   BOOLEAN DEFAULT true,
    representative_id   VARCHAR(50),
    ddd_fone            VARCHAR(10),
    telefone            VARCHAR(50),
    fone_compl          VARCHAR(100),
    created_erp         DATE,
    last_order_numero   VARCHAR(50),
    last_order_date     TIMESTAMP,
    last_order_value    NUMERIC(14,2),
    synced_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sisplan_customers_uf    ON sisplan_customers (uf);
CREATE INDEX IF NOT EXISTS idx_sisplan_customers_city  ON sisplan_customers (city);
CREATE INDEX IF NOT EXISTS idx_sisplan_customers_last_order ON sisplan_customers (last_order_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_sisplan_customers_search
  ON sisplan_customers USING gin (
    to_tsvector('portuguese',
      coalesce(company_name,'') || ' ' || coalesce(fantasy_name,'') || ' ' ||
      coalesce(codcli,'') || ' ' || coalesce(cnpj,'')
    )
  );
