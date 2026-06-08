-- Allow the SAME OF/sector/product/color/part/size to exist for DIFFERENT suppliers.
--
-- An OF can be split across two fornecedores within the same stage (e.g. OF 006103,
-- etapa 81-EMBALAGEM: 56 pcs to supplier A, 36 pcs to supplier B). The previous unique
-- index collapsed both suppliers into one row, so the import overwrote one with the other
-- and only one fornecedor could ever be settled.
--
-- Adding fac_codcli to the key makes (numero, setor, produto, cor, parte, tam, codcli) the
-- logical identity. This only BROADENS the constraint: existing rows are already unique on
-- the smaller key, so they remain unique on the larger one — no data conflict on apply.
DROP INDEX IF EXISTS idx_terceiros_ofs_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_terceiros_ofs_unique ON terceiros_ofs (
    fac_numero,
    COALESCE(fac_codsetor, ''),
    COALESCE(fac_codigo_produto, ''),
    COALESCE(fac_cor, ''),
    COALESCE(fac_parte, ''),
    COALESCE(fac_tam, ''),
    COALESCE(fac_codcli, '')
);
