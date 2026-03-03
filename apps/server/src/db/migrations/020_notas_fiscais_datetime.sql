ALTER TABLE notas_fiscais ALTER COLUMN data_emissao TYPE TIMESTAMP USING data_emissao::TIMESTAMP;
