-- WhatsApp Bot settings (singleton table, similar to sisplan_settings)
CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1) DEFAULT 1,
  active BOOLEAN DEFAULT false,

  -- LLM Provider
  llm_provider VARCHAR(20) DEFAULT 'groq',
  llm_api_key_encrypted TEXT,
  llm_model VARCHAR(100) DEFAULT 'llama-3.1-70b-versatile',
  llm_base_url VARCHAR(255),

  -- System Prompt
  system_prompt TEXT DEFAULT 'Voce e um assistente interno da fabrica. Ajude os usuarios com informacoes sobre vendas, financeiro, boletos e notas fiscais. Seja objetivo e amigavel.',

  -- Feature toggles
  feature_sales BOOLEAN DEFAULT true,
  feature_cashflow BOOLEAN DEFAULT true,
  feature_boleto BOOLEAN DEFAULT false,
  feature_nf BOOLEAN DEFAULT false,

  -- PDF paths on Sisplan server
  boleto_path VARCHAR(500),
  nf_path VARCHAR(500),

  -- Status
  connected BOOLEAN DEFAULT false,
  connected_phone VARCHAR(20),
  last_message_at TIMESTAMP WITH TIME ZONE,
  total_interactions INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default row
INSERT INTO whatsapp_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
