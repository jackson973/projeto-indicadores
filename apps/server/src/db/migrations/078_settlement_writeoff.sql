-- Fechamento parcial por quantidade — saldo remanescente
--
-- Até aqui uma linha de OF (terceiros_ofs) tinha um único settlement_id: ao entrar num
-- fechamento (mesmo com quantidade reduzida na conferência) a OF inteira era marcada como
-- paga e o saldo remanescente desaparecia. Agora o saldo de uma OF é calculado como
--   fac_quant − Σ(quantity + writeoff_quantity) dos seus settlement_items (fechamentos != draft)
-- permitindo N fechamentos parciais sobre a mesma OF até o saldo zerar.
--
-- writeoff_quantity = parcela consumida como AJUSTE FINAL/PERDA neste item (a peça não veio e
-- não será cobrada depois). Fechar parcial "deixando saldo" mantém writeoff_quantity = 0.
ALTER TABLE terceiros_settlement_items
  ADD COLUMN IF NOT EXISTS writeoff_quantity NUMERIC(12,2) NOT NULL DEFAULT 0;
