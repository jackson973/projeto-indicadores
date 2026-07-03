# Terceiros — Fechamento parcial / Saldo remanescente

> Registro completo do desenvolvimento feito nesta sessão (jul/2026). Módulo: **Fechamento de
> Terceiros** (`apps/*/src/**/terceiros*`, `TerceirosSettlement.jsx`). Serve como referência
> para manutenção e continuidade.

## 1. Problema original

No fechamento de terceiros era possível fechar uma OF parcialmente (ajustar a quantidade de um
tamanho, ex.: 226 de 288), mas:

- O sistema marcava a **OF inteira como paga** (`terceiros_ofs.settlement_id`), então o **saldo
  remanescente sumia** e não dava para fechar o restante num mês seguinte.
- A disponibilidade era filtrada por `settlement_id IS NULL`; o front marcava "PAGO" por
  `of.settlementId`. Não existia conceito de **quantidade consumida vs. saldo** dentro de uma
  linha.

Caso real usado de referência: **OF 006087** (fornecedor `00512`, etapa `81 - EMBALAGEM`),
produto 00420, cores 00058 (BRANCO) e 00077 (MESCLA), 5 tamanhos (RN,P,M,G,GG).

## 2. Modelo de dados (regra central)

Migration **`apps/server/src/db/migrations/078_settlement_writeoff.sql`**: adiciona
`terceiros_settlement_items.writeoff_quantity NUMERIC(12,2) DEFAULT 0`.

Definições (em `apps/server/src/db/terceirosRepository.js`):

- **Base do saldo/sugestão** = `BASE_QTY_EXPR` = **`fac_quant`** (o **conferido** pelo ERP naquela
  etapa — o que se sugere pagar ao terceiro). É por fornecedor/linha, então não precisa de exceção
  de OF dividida. **(v1.4.3, reverte o `bad0310`/v1.2.0 que havia trocado para `fac_qt_orig`; o
  original forçava o operador a reajustar quase todo lançamento.)**
- **Referência da OF p/ excedente** = `ORDERED_QTY_EXPR` = **`fac_qt_orig`** (original pedido na
  OF). Usado **só** para o alerta informativo de excedente. **Exceção:** OF/tamanho dividida entre
  **2+ fornecedores** → usa `fac_quant` (evita excedente falso, pois `fac_qt_orig` é o total). Exposto
  como `orderedQty` em `getOfs`/`getSettlement`.
- **Saldo** de uma OF: `saldo = baseQty(conferido) − Σ(quantity + writeoff_quantity)` dos
  `settlement_items` em fechamentos com `status <> 'draft'`. Pagar o conferido fecha 100% (sem
  "sobra"); conferido a menos que a OF **não** vira sobra/ajuste.
- **Excedente (alerta)** = `Σ(quantity + writeoff) > orderedQty(fac_qt_orig)`. Informativo (badge
  "excedente" na lista; "+N a mais que a OF" na célula). A **confirmação** ao digitar dispara ao
  passar do **conferido** (o saldo), independente do excedente vs OF.
- **`terceiros_ofs.settlement_id`** deixa de ser o gate de disponibilidade e passa a significar
  **"linha totalmente consumida"**: setado no último fechamento quando `saldo <= 0`; **NULL**
  enquanto houver saldo. Mantido em sincronia por `syncOfSettlementFlag(ofId)`.
- **`writeoff_quantity`** = parcela consumida como **ajuste final/perda** (encerra sem pagar).

Fechar menos que o disponível → o usuário declara o destino da diferença:
- **Deixar saldo** (`shortfallAction: 'remainder'`, writeoff 0) → volta como saldo.
- **Ajuste final** (`shortfallAction: 'final'`) → `writeoff = disponível − pago`, zera o saldo.

Múltiplos fechamentos parciais são nativos: cada parcial é uma linha própria em
`terceiros_settlement_items` (mesmo `of_id`, `settlement_id` distinto, permitido pelo
`UNIQUE(settlement_id, of_id)`).

## 3. Backend — funções-chave (`terceirosRepository.js`)

- `computeOfBalance(queryFn, ofId)` → `{ facQuant(=baseQty), consumed, remaining }`.
- `resolveWriteoff` / `prepareItemBalance` → valida `quantity <= saldo` e resolve o writeoff.
- `syncOfSettlementFlag(queryFn, ofId)` → liga/desliga `settlement_id` conforme o saldo.
- `reopenOfBalance(ofIds)` → limpa `settlement_id` das OFs com saldo (reabre; **preserva o
  pago**). Usada pelo botão "Reabrir saldo".
- `getOfSettlementHistory(ofId)` → linha do tempo dos fechamentos da OF.
- `deleteSettlement(id)` → deleta itens/fechamento e **recalcula `syncOfSettlementFlag` de cada
  OF afetada** (não zera `settlement_id` cegamente). Assim o saldo volta ao estado correto ao
  deletar (deletar todos os fechamentos de uma OF → volta ao original).
- `getOfs(...)` (ramo `unsettledOnly`) expõe por linha: `paidQty`, `writeoffQty`, `baseQty`,
  `remainingQty` e **`paidPeriods`** (JSON `[{month,year,qty}]` — meses pagos, para o informativo
  multi-mês).
- `getSettlement(id)` items expõem `baseQty`, `paidOther` (pago em **outros** fechamentos),
  `writeoffOther` — usados na tela de edição.
- `createSettlement` / `promoteDraft` / `addSettlementItems` / `updateSettlementItem`: aceitam
  `writeoffQuantity`/`shortfallAction`; usam `prepareItemBalance` + `syncOfSettlementFlag`.
- `batchUpsertOfs`: **soma** `fac_quant` de movimentos com a mesma chave e usa **MAX** de
  `fac_qt_orig` (ver §5).

Rotas novas (`apps/server/src/routes/terceiros.js`):
- `GET /api/terceiros/ofs/:id/settlement-history`
- `POST /api/terceiros/ofs/reopen-balance` `{ ofIds: [...] }`
- Erros de saldo/validação retornam **400** com a mensagem (surface ao usuário).

## 4. Frontend — UX (`apps/client/src/components/TerceirosSettlement.jsx`)

**Criar Fechamento:**
- Quantidade default por célula = **saldo** (remanescente quando houve parcial).
- Informativos de pagamento **empilhados, um por mês** ("Pago em Maio/2026: N pç", ...) — vem de
  `paidPeriods`. Antes só mostrava um mês e quebrava o layout.
- Badge **"Saldo remanescente"** com popover de histórico (`RemnantHistoryPopover`).
- Botão **"Reabrir saldo (N pç)"** em OFs marcadas como pagas que ainda têm saldo (fechamentos
  antigos anteriores à feature). Confirma → reabre → vira remanescente selecionável.
- Célula sugestiva: `OF 288 · pago 226 · pagar 62 · saldo/quitado`.
- Toggle **"Deixar saldo / Ajuste final"** por tamanho ao pagar menos que o saldo.
- **Excedente permitido (v1.4.2):** pode-se lançar acima do saldo (peças a mais que a OF). Ao
  exceder, o input pede **confirmação** (window.confirm) no blur; a célula fica **vermelha** com
  "+N a mais"; o total/envio incluem as peças a mais. Sinalizado na lista por badge "excedente"
  (`overageCount`). Vale para criar, editar e fechamento parcial.

**Editar Fechamento:** mesma célula `OF / pago (outros) / pagar / saldo` e o toggle
"Deixar saldo / Ajuste final" por item (usa `shortfallAction` no `updateSettlementItem`).

## 5. Bug de sync corrigido (importante)

A `faccao3` (Sisplan/Firebird) pode ter **vários movimentos (lançamentos) por tamanho**. Ex.: OF
006087, cor 00077, tam G, etapa 81 → 2 movimentos: **226 (mai) + 50 (jun) = 276** conferido;
`qt_orig` = 288; saldo de produção = 12 (ainda não conferido).

O `batchUpsertOfs` fazia dedup por chave com **"último vence"** (a chave não inclui o lançamento),
então **perdia** movimentos (guardava 226 em vez de 276). Corrigido: **somar `fac_quant`** dos
movimentos da mesma chave e usar **MAX de `fac_qt_orig`**.

**⚠️ Requer re-sync das OFs** para recalcular os valores já importados.

Decomposição de uma OF por tamanho (regra final acordada):
`enviado (qt_orig 288) = pago + saldo-a-pagar + saldo-de-produção`. O sistema paga contra o
**valor da OF (288)**; o que não vier pode ser encerrado via **Ajuste final**.

## 6. Versão visível + Forçar atualização (cache PWA)

Problema recorrente: o app é PWA com service worker; deploys não apareciam por **cache**.

- **Causa raiz:** `nginx.conf` marcava **todo `.js` (inclusive `sw.js`) como `immutable` 1 ano** →
  o navegador nunca rebaixava o service worker. Corrigido: `sw.js`, `registerSW.js`, `index.html`,
  `manifest.webmanifest` com **`no-cache`**; assets com hash continuam imutáveis. (O `deploy.sh`
  já injeta no-cache p/ sw.js e index.html na config viva.)
- **Versão visível:** rodapé da sidebar mostra `vX.Y.Z · <data UTC> · <git sha>`, injetada no
  build via Vite (`__APP_VERSION__`, `__BUILD_LABEL__`, `__GIT_SHA__` em `vite.config.js`). Serve
  de termômetro: se não muda após deploy, é cache.
- **Trava de versão / force-update:** `GET /api/version` (backend, público, `no-store`) devolve o
  `sha` do commit (o servidor reinicia a cada deploy). O componente
  `apps/client/src/VersionGate.jsx` compara com o `sha` do build; se diferente, mostra banner
  **"Nova versão — Atualizar agora"** que **desregistra o SW, limpa os caches e recarrega**.
  (Bootstrap: o 1º deploy dessa feature ainda exige um hard-reload; depois é automático.)

## 7. Arquivos alterados / criados

Backend: `db/migrations/078_settlement_writeoff.sql` (novo), `db/terceirosRepository.js`,
`routes/terceiros.js`, `index.js` (rota `/api/version`).
Frontend: `components/TerceirosSettlement.jsx`, `App.jsx` (rodapé versão + `<VersionGate/>`),
`VersionGate.jsx` (novo), `vite.config.js`, `api.js` (`reopenOfBalance`,
`fetchOfSettlementHistory`), `package.json` (versão).
Infra: `nginx.conf`.

## 8. SQL úteis (Postgres — nosso banco)

Saldo/pago por tamanho de uma OF:
```sql
SELECT fac_cor, fac_tam, fac_qt_orig, fac_quant, settlement_id
FROM terceiros_ofs
WHERE fac_numero='006087' AND fac_codcli='00512' AND fac_codsetor='81'
ORDER BY fac_cor, fac_tam;
```

Todas as OFs marcadas como pagas que ainda têm saldo oculto (candidatas a "Reabrir saldo"):
```sql
SELECT o.fac_codcli, o.fac_numero, o.fac_cor, o.fac_tam,
       o.fac_qt_orig AS qtd_of, bal.pago, bal.ajuste,
       o.fac_qt_orig - bal.pago - bal.ajuste AS saldo, o.settlement_id
FROM terceiros_ofs o
JOIN LATERAL (
  SELECT COALESCE(SUM(si.quantity),0) AS pago,
         COALESCE(SUM(si.writeoff_quantity),0) AS ajuste
  FROM terceiros_settlement_items si
  JOIN terceiros_settlements s ON s.id = si.settlement_id AND s.status <> 'draft'
  WHERE si.of_id = o.id
) bal ON true
WHERE o.settlement_id IS NOT NULL
  AND o.fac_qt_orig - bal.pago - bal.ajuste > 0
ORDER BY saldo DESC;
```

Query de origem (Firebird/faccao3) — ver detalhe por movimento de um tamanho:
```sql
SELECT FACCAO3.lancto, FACCAO3.dt_lan, FACCAO3.qt_orig, FACCAO3.quant, FACCAO3.pago
FROM faccao3_001 FACCAO3
INNER JOIN faccao_001 FACCAO ON (FACCAO3.numero=FACCAO.numero AND FACCAO3.codigo=FACCAO.codigo
  AND FACCAO3.cor=FACCAO.cor AND FACCAO3.tam=FACCAO.tam AND FACCAO3.op=FACCAO.op
  AND FACCAO3.id_ant=FACCAO.id)
WHERE FACCAO3.numero='006087' AND FACCAO3.codcli='00512' AND FACCAO3.op='81'
  AND FACCAO3.cor='00077' AND FACCAO3.tam='G'
ORDER BY FACCAO3.lancto;
```

## 9. Histórico de deploys (branch por mudança; tudo mergeado em `main` por fast-forward)

| commit | versão | o quê |
|---|---|---|
| `eeecc46` | 1.1.0 | saldo remanescente + histórico + migration 078 |
| `09f4797` | — | botão Reabrir saldo + fix célula mostrando 0 |
| `ab791ce` | — | versão visível na sidebar |
| `752d442` | — | sync: somar movimentos da faccao3 |
| `bad0310` | 1.2.0 | base do saldo = valor da OF (`fac_qt_orig`) |
| `de0e9cd` | 1.2.1 | célula sugestiva OF/pago/saldo |
| `29c56a1` | 1.2.2 | travar qtd acima do saldo + rótulo pagar/saldo |
| `662aa95` | — | backend: edição (writeoff) + multi-mês (paidPeriods/paidOther) |
| `d1fa40a` | 1.3.0 | UI multi-mês empilhado + edição com toggle |
| `c47e858` | 1.3.1 | rótulo "pagar N" na edição |
| `529d1ff` | 1.4.0 | forçar atualização: nginx no-cache + /api/version + VersionGate |
| `c07ffab` | 1.4.1 | `deleteSettlement` recalcula flag (syncOfSettlementFlag) + badge de saldo sem "(N já pagas)" |
| _(este)_ | 1.4.2 | **permitir excedente** (pagar mais peças que a OF): remove travas de saldo em `prepareItemBalance`/`updateSettlementItem`; UI confirma ao exceder (create+edição) e sinaliza em vermelho "+N a mais"; `overageCount` na lista de fechamentos (badge "excedente") |
| _(este)_ | 1.4.3 | **base do saldo = conferido (`fac_quant`)** de novo (reverte parcial do `bad0310`): sugere o conferido, fecha 100% ao pagar o conferido. `ORDERED_QTY_EXPR` (`fac_qt_orig`) vira só referência do excedente (`orderedQty` em `getOfs`/`getSettlement`; `overageCount` compara vs ela). Confirmação dispara ao passar do conferido; badge "+N a mais que a OF" |

## 10. Pontos de atenção

- **Re-sync obrigatório** após o fix de sync para recalcular `fac_quant` (soma dos movimentos).
- **Cache PWA:** confira a versão no rodapé após deploy; use o banner "Atualizar agora" ou
  Ctrl+Shift+R. Atualizar o nginx da produção a partir do template para pegar registerSW/manifest.
- **Custo & Preço (Fase 1)** é um desenvolvimento paralelo com WIP **não-commitado** no working
  tree (branch `feat/custo-preco-fase1`). Todos os commits desta feature foram isolados — o
  custo-preço nunca foi para `main`. Cuidado ao commitar `App.jsx`, `api.js`, `index.js` (têm WIP
  do custo-preço junto): stagear só os hunks da feature.
