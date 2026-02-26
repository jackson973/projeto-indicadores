-- Tabela para cache dos dados da API per-hour do UpSeller
CREATE TABLE IF NOT EXISTS upseller_daily_analytics (
    id SERIAL PRIMARY KEY,
    reference_date DATE NOT NULL UNIQUE,
    per_hour JSONB,
    yes_per_hour JSONB,
    product_tops JSONB,
    shop_tops JSONB,
    today_order_num INTEGER DEFAULT 0,
    today_sale_amount NUMERIC(12,2) DEFAULT 0,
    yesterday_order_num INTEGER DEFAULT 0,
    yesterday_sale_amount NUMERIC(12,2) DEFAULT 0,
    yesterday_period_order_num INTEGER DEFAULT 0,
    yesterday_period_sale_amount NUMERIC(12,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'BRL',
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS set_upseller_daily_analytics_updated ON upseller_daily_analytics;
CREATE TRIGGER set_upseller_daily_analytics_updated
    BEFORE UPDATE ON upseller_daily_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
