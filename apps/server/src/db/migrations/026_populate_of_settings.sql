-- Populate OF (Ordem de Fabricacao) SQL query and column mapping in sisplan_settings
UPDATE sisplan_settings
SET of_active = true,
    of_sql_query = 'SELECT
       FACCAO.dt_s                               FAC_DT_S,
       FACCAO.lancto,
       FACCAO3.dt_lan                            FAC_DT_LAN,
       FACCAO.dt_r                               FAC_DT_PREV_RET,
       FACCAO3.numero                            FAC_NUMERO,
       FACCAO3.op                                FAC_CODSETOR,
       CADFLUXO.descricao                        FAC_DESCSETOR,
       FACCAO3.qt_orig                           FAC_QT_ORIG,
       FACCAO3.quant                             FAC_QUANT,
       FACCAO3.tam                               FAC_TAM,
       FACCAO3.cor                               FAC_COR,
       CADCOR.descricao                          FAC_DESCCOR,
       FACCAO3.parte                             FAC_PARTE,
       TIPO_APL.descricao                        FAC_DESCPARTE,
       PRODUTO.codigo                            FAC_CODIGO_PRODUTO,
       PRODUTO.descricao                         FAC_DESC_PRODUTO,
       PRODUTO.unidade                           PRODUTO_UNIDADE,
       FACCAO3.codcli                            FAC_CODCLI,
       CLIENTE.nome                              CLIENTE_NOME,
       CLIENTE.ddd_fone                          DDD_FONE,
       CLIENTE.telefone                          CLIENTE_FONE,
       CLIENTE.fone_compl                        FONE_COMPL,
       CLIENTE.endereco,
       CLIENTE.numero                            NUM_END,
       CLIENTE.bairro,
       CLIENTE.cep,
       (SELECT scid.COD_UF  FROM CADCEP_001 scep INNER JOIN CIDADE scid ON scid.CODIGO = scep.CODMUN WHERE cliente.CEP = scep.CEP ) AS "UF",
       (SELECT scid.NOME  FROM CADCEP_001 scep INNER JOIN CIDADE scid ON scid.CODIGO = scep.CODMUN WHERE cliente.CEP = scep.CEP ) AS "CIDADE",
       CLIENTE.complemento,
       CLIENTE.cnpj,
       CLIENTE.inscricao,
       CLIENTE.fantasia,
       CLIENTE.fax,
       OF1.periodo						FAC_PERIODO_OF
FROM   (SELECT codigo,
               codcli,
               dt_lan,
               numero,
               op,
               preco,
               qt_orig,
               obs,
               ficha,
               quant,
               quant_2,
               quant_i,
               quant_f,
               valor,
               lancto,
               unitario,
               nota,
               pago,
               pedido,
               tam,
               cor,
               parte,
               num_ap,
               dt_pagto,
               identificador,
               id_ant,
               mov,
               mov_ant,
               mov_ligacao,
               funcionario,
               maquina,
               perc,
               perc_pontualidade,
               perc_qual,
               perc_100
        FROM   faccao3_001) FACCAO3
       INNER JOIN faccao_001 FACCAO
               ON ( FACCAO3.numero = FACCAO.numero
                    AND FACCAO3.codigo = FACCAO.codigo
                    AND faccao3.cor = faccao.cor
                    AND faccao3.tam = faccao.tam
                    AND FACCAO3.op = FACCAO.op
                    AND faccao3.id_ant = faccao.id )
       LEFT JOIN of1_001 OF1
              ON ( FACCAO3.numero = OF1.numero )
       LEFT JOIN of_iten_001 OF_ITEN
              ON ( FACCAO3.numero = OF_ITEN.numero
                   AND FACCAO3.codigo = OF1.codigo
                   AND FACCAO3.cor = OF_ITEN.cor
                   AND FACCAO3.tam = OF_ITEN.tam )
       INNER JOIN (SELECT codcli,
                          nome,
                          cep,
                          fax,
                          fantasia,
                          inscricao,
                          cred_consignado,
                          royal,
                          cnpj,
                          complemento,
                          bairro,
                          numero,
                          endereco,
                          abvtex,
                          bonificacao,
                          telefone,
                          ddd_fone,
                          fone_compl,
                          dia_pagto_faccao
                   FROM   entidade_001) CLIENTE
               ON ( FACCAO3.codcli = CLIENTE.codcli )
       LEFT JOIN (SELECT codcli,
                         nome
                  FROM   entidade_001) CLIENTE1
              ON ( OF1.codcli = CLIENTE1.codcli )
       INNER JOIN cadfluxo_001 CADFLUXO
               ON ( FACCAO3.op = CADFLUXO.codigo )
       INNER JOIN cadcor_001 CADCOR
               ON ( FACCAO3.cor = CADCOR.cor )
       INNER JOIN produto_001 PRODUTO
               ON ( FACCAO3.codigo = PRODUTO.codigo )
       LEFT JOIN faixa_iten_001 FAIXA
              ON ( FAIXA.faixa = PRODUTO.faixa
                   AND FAIXA.tamanho = FACCAO3.tam )
       LEFT JOIN colecao_001 COLECAO
              ON ( PRODUTO.colecao = COLECAO.codigo )
       LEFT JOIN grupo_pa_001 GRUPO_PA
              ON ( PRODUTO.grupo = GRUPO_PA.codigo )
       LEFT JOIN unidade_001 UNIDADE
              ON ( UNIDADE.unidade = PRODUTO.unidade )
       LEFT JOIN tipo_apl_001 TIPO_APL
              ON ( FACCAO3.parte = TIPO_APL.codigo )
       LEFT JOIN etq_prod_001 ETIQUETA
              ON ( PRODUTO.etiqueta = ETIQUETA.codigo )
       LEFT JOIN comb_parte_001 COMB
              ON ( COMB.parte = FACCAO3.parte
                   AND COMB.codigo = FACCAO3.codigo
                   AND COMB.cor = FACCAO3.cor )
       LEFT JOIN cadcor_001 COR1
              ON COR1.cor = COMB.cor_parte
       LEFT JOIN pedido_001 PEDIDO
              ON ( OF1.pedido = PEDIDO.numero )
       LEFT JOIN tipo_001 TIPO
              ON ( TIPO.id = OF1.id_tipo )
       LEFT JOIN maquina_001 MAQUINA
              ON ( FACCAO3.maquina = MAQUINA.maquina )
       LEFT JOIN pessoal_001 PESSOAL
              ON ( PESSOAL.codigo = FACCAO3.funcionario )
       LEFT JOIN marca_001 MARCA
              ON ( MARCA.codigo = PRODUTO.marca )
       LEFT JOIN tabfis_001 TABFIS
              ON ( TABFIS.codigo = PRODUTO.codfis )
       LEFT JOIN auxiliar_001 AUXILIAR
              ON ( AUXILIAR.id = PRODUTO.categoria )
WHERE  1 = 1
       AND ( ( FACCAO3.quant + FACCAO3.quant_2
               + FACCAO3.quant_i + FACCAO3.quant_f ) > 0 )
       AND ( FACCAO3.dt_lan >= ''2026-01-01'' )
     --  AND ( FACCAO3.dt_lan <= ''2026-03-10'' )
     --  AND ( FACCAO3.codcli IN ( ''00596'' ) )
      -- AND ( FACCAO3.numero IN ( ''005035'' ) )
       AND ( FACCAO3.pago <> ''S'' )
GROUP  BY FACCAO3.codcli,
          FACCAO.dt_s,
          FACCAO.lancto,
          FACCAO3.dt_lan,
          FACCAO.dt_r,
          FACCAO3.numero,
          FACCAO3.op,
          CADFLUXO.descricao,
          OF1.id_tipo,
          TIPO.descricao,
          FACCAO3.preco,
          FACCAO3.qt_orig,
          FACCAO3.obs,
          FACCAO3.ficha,
          FACCAO3.quant,
          FACCAO3.quant_2,
          FACCAO3.quant_i,
          FACCAO3.quant_f,
          FACCAO3.valor,
          FACCAO.unitario,
          FACCAO3.lancto,
          FACCAO3.unitario,
          FACCAO3.nota,
          FACCAO3.pago,
          PRODUTO.codigo,
          PRODUTO.prototipo,
          PRODUTO.colecao,
          COLECAO.descricao,
          PRODUTO.grupo,
          GRUPO_PA.descricao,
          FACCAO3.pedido,
          FACCAO3.tam,
          FACCAO3.cor,
          FACCAO3.parte,
          TIPO_APL.descricao,
          COMB.cor_parte,
          COR1.descricao,
          TIPO_APL.estoque,
          CLIENTE.fone_compl,
          PRODUTO.descricao,
          PRODUTO.unidade,
          PRODUTO.largura,
          PRODUTO.estimativa_mes,
          PRODUTO.etiqueta,
          ETIQUETA.descricao,
          PRODUTO.codfis,
          TABFIS.descricao,
          UNIDADE.qtde,
          CLIENTE.nome,
          CLIENTE.ddd_fone,
          CLIENTE.telefone,
          CLIENTE.bonificacao,
          CADCOR.descricao,
          FACCAO3.dt_pagto,
          FACCAO3.mov,
          FACCAO3.identificador,
          OF1.codcli,
          CLIENTE1.nome,
          OF1.pedido,
          OF1.periodo,
          FACCAO3.id_ant,
          CLIENTE.dia_pagto_faccao,
          FACCAO3.numero,
          FACCAO3.op,
          FACCAO3.mov,
          PEDIDO.ped_cli,
          CLIENTE.abvtex,
          FACCAO3.mov_ligacao,
          PEDIDO.entrega,
          PEDIDO.dt_orig_entrega,
          CLIENTE.endereco,
          CLIENTE.numero,
          CLIENTE.bairro,
          CLIENTE.cep,
          CLIENTE.complemento,
          CLIENTE.cnpj,
          FACCAO3.funcionario,
          PESSOAL.nome,
          FACCAO3.maquina,
          MAQUINA.descricao,
          PESSOAL.turno,
          PRODUTO.marca,
          MARCA.descricao,
          FACCAO3.dt_lan,
          OF_ITEN.qtde,
          OF_ITEN.qtde_b,
          FACCAO3.mov_ant,
          FACCAO.mov,
          FACCAO3.perc,
          PRODUTO.codigo2,
          FAIXA.posicao,
          PRODUTO.quant,
          PRODUTO.cubagem,
          FACCAO.parte,
          OF1.emp_id,
          FACCAO.codigo,
          PRODUTO.linha,
          OF1.observacao,
          OF1.tipo,
          CLIENTE.royal,
          CLIENTE.cred_consignado,
          CLIENTE.inscricao,
          CLIENTE.fantasia,
          CLIENTE.fax,
          OF1.receita,
          OF1.codigo_ofpai,
          FACCAO3.perc_pontualidade,
          FACCAO3.perc_qual,
          FACCAO3.perc_100,
          FACCAO.obs,
          OF1.programacao,
          PRODUTO.categoria,
          AUXILIAR.descricao
ORDER  BY FACCAO3.codcli,
          FACCAO3.numero,
          PRODUTO.codigo',
    of_column_mapping = '{
      "fac_numero": "FAC_NUMERO",
      "fac_lancto": "LANCTO",
      "fac_dt_s": "FAC_DT_S",
      "fac_dt_lan": "FAC_DT_LAN",
      "fac_dt_prev_ret": "FAC_DT_PREV_RET",
      "fac_codsetor": "FAC_CODSETOR",
      "fac_descsetor": "FAC_DESCSETOR",
      "fac_qt_orig": "FAC_QT_ORIG",
      "fac_quant": "FAC_QUANT",
      "fac_tam": "FAC_TAM",
      "fac_cor": "FAC_COR",
      "fac_desccor": "FAC_DESCCOR",
      "fac_parte": "FAC_PARTE",
      "fac_descparte": "FAC_DESCPARTE",
      "fac_codigo_produto": "FAC_CODIGO_PRODUTO",
      "fac_desc_produto": "FAC_DESC_PRODUTO",
      "produto_unidade": "PRODUTO_UNIDADE",
      "fac_codcli": "FAC_CODCLI",
      "cliente_nome": "CLIENTE_NOME",
      "ddd_fone": "DDD_FONE",
      "cliente_fone": "CLIENTE_FONE",
      "fone_compl": "FONE_COMPL",
      "cliente_endereco": "ENDERECO",
      "num_end": "NUM_END",
      "cliente_bairro": "BAIRRO",
      "cliente_cep": "CEP",
      "cliente_uf": "UF",
      "cliente_cidade": "CIDADE",
      "cliente_complemento": "COMPLEMENTO",
      "cliente_cnpj": "CNPJ",
      "cliente_inscricao": "INSCRICAO",
      "cliente_fantasia": "FANTASIA",
      "cliente_fax": "FAX",
      "fac_periodo_of": "FAC_PERIODO_OF"
    }'::jsonb
WHERE id = 1;
