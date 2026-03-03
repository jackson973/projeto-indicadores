-- Trocar colunas de texto para TEXT (sem limite) para evitar estouro com dados do Firebird
ALTER TABLE notas_fiscais ALTER COLUMN ordem_id TYPE TEXT;
ALTER TABLE notas_fiscais ALTER COLUMN codcli TYPE TEXT;
ALTER TABLE notas_fiscais ALTER COLUMN nome_cliente TYPE TEXT;
ALTER TABLE notas_fiscais ALTER COLUMN chave_acesso TYPE TEXT;
