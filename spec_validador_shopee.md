# Validador de Taxas Shopee — Especificação Completa

**Projeto:** Tuck Kids — Sistema Unificado de Canais  
**Módulo:** Fechamento e Reconciliação Shopee  
**Loja:** Basico mais Criativo (Shopee)  
**Versão da spec:** 1.0  
**Data:** Abril 2026  

---

## 1. Contexto e Objetivo

### 1.1 O problema

A Tuck Kids opera no Shopee através da loja "Basico mais Criativo" e gera pedidos diariamente registrados no sistema interno (analítico de vendas). A Shopee disponibiliza mensalmente um **Income Report** (relatório de rendimento) com o detalhamento financeiro de cada pedido liberado.

O objetivo deste módulo é cruzar automaticamente os pedidos do sistema interno com o Income Report da Shopee, identificar divergências entre o valor esperado e o valor realmente liberado, e categorizar a causa de cada divergência para ação.

### 1.2 Fontes de dados

| Fonte | Arquivo | Conteúdo |
|---|---|---|
| Sistema interno | `analitico-vendas-YYYY-MM-DD_a_YYYY-MM-DD.xlsx` | Pedidos emitidos, preço tabela, descontos |
| Income Report Shopee | `Income_lancado_br_YYYYMMDD_YYYYMMDD.xlsx` | Valores liberados, taxas, vouchers, afiliados |

### 1.3 Estrutura do Income Report (abas relevantes)

| Aba | Descrição |
|---|---|
| `Summary` | Resumo financeiro do período |
| `Renda` | Detalhe por pedido — principal fonte de dados |
| `Service Fee Details` | Decomposição da taxa de serviço por pedido |
| `Shipping Fee Discrepancy` | Pedidos com divergência de peso/frete |
| `Adjustment` | Ajustes do período |

---

## 2. Regras de Negócio Descobertas

### 2.1 A fórmula base de cálculo do valor liberado

```
Base = Preço do produto - Voucher subsidiado pelo Seller
Comissão = Base × % (conforme faixa de preço)
Taxa Fixa = R$ fixo × número de itens distintos no pedido
Liberado Esperado = Base - Comissão - Taxa Fixa - Comissão Afiliados
```

> **Atenção:** A taxa fixa é cobrada por **item distinto** (linha no income), não por pedido. Um pedido com 2 SKUs diferentes paga R$4 × 2 = R$8.

### 2.2 Tabela de faixas de preço (Shopee)

| Faixa de preço do item | Comissão % | Taxa fixa por item |
|---|---|---|
| Até R$ 79,99 | 20% | R$ 4,00 |
| R$ 80,00 – R$ 99,99 | 14% | R$ 16,00 |
| R$ 100,00 – R$ 199,99 | 14% | R$ 20,00 |
| R$ 200,00 – R$ 499,99 | 14% | R$ 26,00 |
| Acima de R$ 500,00 | 14% | R$ 26,00 |

> A faixa é determinada pelo **preço médio por item** quando o pedido tem múltiplos itens.

### 2.3 Como a Shopee divide internamente a taxa de serviço

A taxa de serviço líquida do Income Report (coluna `Taxa de serviço líquida`) é a soma de 3 componentes que aparecem na aba `Service Fee Details`:

```
Taxa de serviço líquida = Taxa por item vendido + Taxa de Transação + Taxa de serviço adicional
```

| Componente | Descrição | Valor típico |
|---|---|---|
| Taxa por item vendido | Taxa fixa da tabela (R$4, R$16, etc.) | Conforme faixa |
| Taxa de Transação | % sobre o valor pago (~2%) | ~R$ 1,38 |
| Taxa de serviço adicional | Cobrança extra em situações especiais | R$ 0 (normal) ou 2,5% |

> A Taxa de Transação (~2% do valor base) **não aparece na tabela oficial da Shopee** mas é cobrada em todos os pedidos. Isso faz a taxa de serviço real ser sempre ligeiramente maior que o fixo da tabela.

### 2.4 Comportamento do campo "Desconto" no analítico

O campo `Desconto` no analítico de vendas usa sinal invertido e mistura dois conceitos:

| Valor do campo | Significado real | Impacto no total |
|---|---|---|
| Positivo (ex: +0,40) | Voucher do seller — comprador pagou **menos** | Total = Preço - Desconto |
| Negativo (ex: -9,22) | Subsídio da Shopee — comprador pagou **mais** | Total = Preço + Subsidio |

A fórmula `Total = Preço Unit. - Desconto` funciona matematicamente nos dois casos.

No sistema, separar em dois campos:
- `desconto_seller`: valor positivo → reduz o total
- `subsidio_shopee`: valor negativo → aumenta o total (benefício, não custo)

### 2.5 Linha totalizadora no Income Report

Para cada pedido, o Income Report gera **uma linha extra** com `Nome do produto = "-"` que representa o total do pedido. Esta linha deve ser **ignorada** nos cálculos por item — usar apenas as linhas com nome de produto real.

O número de linhas com produto real = número de itens distintos = multiplicador da taxa fixa.

### 2.6 Voucher: diferença entre analítico e income

O campo `Desconto` do analítico e `Voucher subsidiado pelo Seller` do income podem ter valores ligeiramente diferentes para o mesmo pedido:
- O analítico registra o desconto aplicado sobre o preço cheio
- O income calcula o voucher sobre a base já ajustada

A diferença é pequena (centavos) e decorre de bases de cálculo distintas. Para a fórmula, usar sempre o voucher do **income** como base de cálculo.

---

## 3. Categorias de Divergência

### 3.1 Tabela de categorias

| Categoria | Condição de identificação | Impacto | Ação |
|---|---|---|---|
| ✓ OK | `\|diff\| < R$0,02` | Nenhum | Nenhuma |
| Sem income | Pedido não aparece no Income Report | — | Aguardar liberação (pedidos recentes) |
| Cancelado | Campo `Status = "Cancelado"` no analítico | — | Nenhuma |
| Multi-item | Pedido tem 2+ linhas no income (itens distintos) | Taxa fixa × n | Já contemplado na fórmula |
| Peso divergente | Pedido na aba `Shipping Fee Discrepancy` | Frete extra + serviço maior | Corrigir peso no cadastro do Seller Centre |
| Afiliado | `Taxa de comissão Afiliados do Vendedor > 0` | Comissão extra (~20%) | Avaliar programa de afiliados |
| Taxa adicional | `taxa_adicional > 0` na aba `Service Fee Details` | 2,5% do valor base | Abrir chamado na Shopee para investigar |
| Sem causa identificada | `\|diff\| >= R$0,50` e nenhuma categoria acima | Variável | Investigar manualmente |

### 3.2 Lógica de categorização (prioridade)

```python
def categorizar(pedido, income_data, sfd_fees, sfd_frete):
    if pedido.status == "Cancelado":
        return "Cancelado"
    
    if income_data is None:
        return "Sem income (em aberto)"
    
    diff = abs(income_data.liberado_real - calcular_liberado_esperado(pedido, income_data))
    
    if diff < 0.02:
        return "OK"
    
    causas = []
    
    if pedido.order_id in sfd_fees and sfd_fees[pedido.order_id].taxa_adicional > 0:
        causas.append("Taxa adicional 2,5%")
    
    if pedido.order_id in sfd_frete:
        causas.append("Peso divergente")
    
    if income_data.afiliado > 0:
        causas.append("Afiliado")
    
    if income_data.n_itens > 1:
        causas.append(f"Multi-item ({income_data.n_itens} itens)")
    
    if causas:
        return " + ".join(causas)
    
    return "Sem causa identificada"
```

---

## 4. Estrutura dos Dados

### 4.1 Schema — Analítico de Vendas

```typescript
interface LinhaAnalitico {
  data: Date;
  pedido: string;           // ID interno do sistema
  nPedidoPlataforma: string; // ID do pedido na Shopee
  loja: string;
  plataforma: string;
  status: string | null;    // null = ativo, "Cancelado" = cancelado
  sku: string;
  produto: string;
  variacao: string;
  qtd: number;
  precoUnit: number;        // Preço de tabela
  desconto: number;         // Positivo = desconto seller; Negativo = subsídio Shopee
  total: number;            // precoUnit - desconto (funciona para ambos os sinais)
}
```

### 4.2 Schema — Income Report (aba Renda)

```typescript
interface LinhaIncome {
  idPedido: string;
  nomeProduto: string;        // "-" = linha totalizadora (ignorar)
  dataCriacao: Date;
  dataConclusaoPagamento: Date | null;
  canalLiberacao: string;
  tipoPedido: string;
  precoProduto: number;
  valorReembolso: number;
  ajustePix: number;
  taxaFretePagaComprador: number;
  freteCobradorParceiro: number;
  descontoFreteShoppe: number;
  taxaEnvioReverso: number;
  incentivShopee: number;
  voucherSeller: number;      // Negativo = custo para o seller
  voucherCompartilhado: number;
  coinCashback: number;
  taxaComissaoLiquida: number; // Negativo
  taxaServicoLiquida: number;  // Negativo
  taxaTransacao: number;       // Negativo
  taxaAfiliados: number;       // Negativo
  quantiaLiberada: number;     // Valor final recebido
  metodoPagamento: string;
  parcelamento: string;
  codigoCupom: string;
  taxaComissaoBruta: number;
  taxaServicoBruta: number;
}
```

### 4.3 Schema — Service Fee Details

```typescript
interface LinhaServiceFee {
  seq: number;
  orderId: string;
  taxaTransacao: number;    // Componente 1: % sobre o valor
  taxaAdicional: number;    // Componente 2: cobrança extra (0 = normal, >0 = investigar)
  taxaItemVendido: number;  // Componente 3: taxa fixa por item (R$4, R$16, etc.)
}
```

### 4.4 Schema — Shipping Fee Discrepancy

```typescript
interface LinhaShippingDiscrepancy {
  orderId: string;
  freteEsperado: number;
  freteReal: number;
  motivo: string;  // Ex: "Possível razão: o peso real do produto é maior do que o peso informado"
}
```

### 4.5 Schema — Resultado do Cruzamento

```typescript
interface ResultadoCruzamento {
  orderId: string;
  data: Date;
  produto: string;
  qtd: number;
  statusPagamento: "Pago" | "Em aberto" | "Cancelado";
  dataLiberacao: Date | null;
  
  // Analítico
  precoTabela: number;
  descontoSeller: number;
  subsidioShopee: number;
  totalPago: number;
  
  // Income
  precoIncome: number | null;
  voucher: number | null;
  afiliado: number | null;
  comissaoReal: number | null;
  taxaServicoReal: number | null;
  totalTaxasReal: number | null;
  valorLiberado: number | null;
  
  // Fórmula calculada
  baseCalculo: number | null;       // precoIncome - voucher
  comissaoEsperada: number | null;  // base × %
  taxaFixaUnit: number | null;      // R$4, R$16, etc.
  nItens: number;                   // linhas no income (sem totalizadora)
  totalFixoEsperado: number | null; // taxaFixaUnit × nItens
  liberadoEsperado: number | null;  // base - comissao - totalFixo - afiliado
  
  // Resultado
  diff: number | null;              // liberadoReal - liberadoEsperado
  causaDivergencia: string;
  
  // Alertas extras
  freteEsperado: number | null;     // da aba Shipping Fee Discrepancy
  freteReal: number | null;
  diffFrete: number | null;
  motivoFrete: string | null;
  taxaAdicional: number | null;     // da aba Service Fee Details
}
```

---

## 5. Algoritmo de Processamento

### 5.1 Fluxo principal

```
1. Carregar analítico de vendas → filtrar pela loja "Basico mais Criativo(Shopee)"
2. Carregar Income Report → abas: Renda, Service Fee Details, Shipping Fee Discrepancy
3. Para cada pedido do analítico:
   a. Agregar linhas do mesmo pedido (mesmo nPedidoPlataforma)
   b. Buscar no income (aba Renda) pelo ID do pedido
   c. Contar itens distintos (linhas com produto != "-")
   d. Calcular liberado esperado pela fórmula
   e. Buscar taxa adicional na aba Service Fee Details
   f. Buscar divergência de frete na aba Shipping Fee Discrepancy
   g. Calcular diff e categorizar causa
4. Gerar resultado consolidado
```

### 5.2 Cálculo do liberado esperado

```python
def calcular_liberado_esperado(preco_income, voucher, n_itens, afiliado):
    """
    preco_income: soma do preço de todos os itens do pedido (excluindo linha "-")
    voucher: valor absoluto do voucher (sempre positivo aqui)
    n_itens: número de linhas com produto real no income
    afiliado: valor absoluto da comissão de afiliados
    """
    preco_medio_item = preco_income / n_itens if n_itens > 0 else preco_income
    
    # Determinar faixa
    if preco_medio_item <= 79.99:
        pct, fixo_unit = 0.20, 4.00
    elif preco_medio_item <= 99.99:
        pct, fixo_unit = 0.14, 16.00
    elif preco_medio_item <= 199.99:
        pct, fixo_unit = 0.14, 20.00
    elif preco_medio_item <= 499.99:
        pct, fixo_unit = 0.14, 26.00
    else:
        pct, fixo_unit = 0.14, 26.00
    
    base = preco_income - voucher
    comissao = round(base * pct, 2)
    total_fixo = round(fixo_unit * n_itens, 2)
    liberado = round(base - comissao - total_fixo - afiliado, 2)
    
    return {
        "base": base,
        "pct": pct,
        "fixo_unit": fixo_unit,
        "total_fixo": total_fixo,
        "comissao": comissao,
        "liberado": liberado
    }
```

### 5.3 Determinação do status de pagamento

```python
def status_pagamento(pedido_analitico, income_row):
    if pedido_analitico.status == "Cancelado":
        return "Cancelado"
    if income_row is None or income_row.dataConclusaoPagamento is None:
        return "Em aberto"
    return "Pago"
```

---

## 6. Interface do Sistema (Protótipo)

### 6.1 Fluxo de uso

O módulo de fechamento segue um fluxo linear em 2 etapas:

```
┌─────────────────────────────────────┐
│  1. Selecionar período + loja       │
│     → Carrega pedidos do sistema    │
│                                     │
│  2. Upload do Income Report Shopee  │
│     → Dispara o cruzamento          │
│     → Exibe resultado com detalhes  │
└─────────────────────────────────────┘
```

### 6.2 Tela de resultado — componentes obrigatórios

**Cards de métricas (topo):**
- Total que bate (verde)
- Em aberto / aguardando liberação (amarelo)
- Divergentes que requerem ação (vermelho)
- Impacto financeiro total — soma das diferenças (laranja)

**Filtros por causa:**
Botões de toggle para filtrar a tabela: Todos / OK / Taxa adicional / Afiliado / Peso divergente / Em aberto / Investigar

**Tabela de pedidos:**

| Coluna | Descrição |
|---|---|
| Nº Pedido | ID da Shopee |
| Data | Data de criação |
| Produto | Nome do produto (truncado) |
| Preço Tabela | Do analítico |
| Liberado Esp. | Calculado pela fórmula |
| Liberado Real | Do income report |
| Diff | Diferença (vermelho se negativo) |
| Causa | Pill colorida com categoria |

**Painel de detalhes (ao clicar na linha):**

Expande inline abaixo da linha clicada. Duas colunas:

Coluna esquerda — **Como calculamos:**
```
Preço de venda [faixa]          R$ 69,90
(–) Voucher seller [BASICO1]    R$  0,70
Base de cálculo                 R$ 69,20
─────────────────────────────────────────
(–) Comissão 20% × R$69,20      R$ 13,84
(–) Taxa fixa R$4 × 1 item      R$  4,00
Liberado esperado               R$ 51,36
```

Coluna direita — **O que a Shopee pagou:**
```
Comissão cobrada                R$ 12,46
Taxa de serviço cobrada         R$  5,38
[se houver] Taxa adicional 2,5% R$  1,73  ← laranja
[se houver] Comissão afiliado   R$ 14,20  ← azul
[se houver] Frete extra (peso)  R$  1,35  ← amarelo
─────────────────────────────────────────
Liberado real (income)          R$ 49,63
Diferença                       -R$ 1,73  ← vermelho
```

Box de explicação da causa (abaixo das duas colunas):
- Pill da categoria
- Texto explicando o que significa e qual a ação recomendada

### 6.3 Cores por status e causa

| Status/Causa | Cor de fundo | Texto |
|---|---|---|
| OK | `#EAF3DE` | `#27500A` |
| Em aberto | `#FFF2CC` | `#633806` |
| Cancelado | `#FCE4D6` | `#993C1D` |
| Taxa adicional 2,5% | `#FFF3E0` | `#7D4900` |
| Peso divergente | `#FAEEDA` | `#633806` |
| Afiliado | `#E6F1FB` | `#0C447C` |
| Investigar | `#FCEBEB` | `#791F1F` |

### 6.4 Código do protótipo (HTML/JS funcional)

O protótipo completo e funcional está disponível como componente React ou HTML standalone. Implementa:
- Seleção de período e loja
- Simulação de upload do income report
- Cards de métricas calculados dinamicamente
- Filtros por causa
- Tabela com ordenação
- Painel de detalhes inline expansível com breakdown completo da fórmula
- Explicação da causa em linguagem natural

Ver arquivo: `prototipo_validador_shopee.jsx`

---

## 7. Observações Técnicas Importantes

### 7.1 Casamento de IDs

O ID do pedido no analítico (`Nº Pedido Plataforma`) corresponde ao `ID do pedido` no Income Report. O casamento deve ser feito por string após `.strip()` nos dois lados — podem haver espaços indesejados.

### 7.2 Pedidos que aparecem no income mas não no analítico

O Income Report pode ter pedidos criados em meses anteriores (ex: criados em março, liberados em abril). Esses não terão correspondência no analítico do mês atual — ignorar no cruzamento, não tratar como erro.

### 7.3 Pedidos do analítico sem match no income

Pedidos recentes (criados nos últimos dias do período) ainda não terão liberação registrada no income. Status = "Em aberto". **Não é divergência** — é defasagem natural do ciclo de liberação da Shopee (5–10 dias após entrega confirmada).

### 7.4 Precisão numérica

Usar arredondamento com `round(valor, 2)` em cada passo da fórmula para evitar acúmulo de erros de ponto flutuante. Tolerância para "bate" = `abs(diff) < 0.02`.

### 7.5 Múltiplas lojas Shopee

O sistema da Tuck Kids opera com duas lojas Shopee:
- `Basico mais Criativo(Shopee)` — loja principal
- `Sonho Meu (Shopee)` — segunda loja

O Income Report é exportado por loja. O filtro por loja no analítico deve usar correspondência exata do campo `Loja`.

### 7.6 Sobre a taxa de serviço adicional

Identificada nos pedidos de 14–16/04/2026: 23 pedidos com taxa adicional de exatamente 2,5% do valor base. Motivo desconhecido — pode ser taxa de campanha/promoção da Shopee. O sistema deve sinalizar esses casos para acompanhamento via chamado no suporte da plataforma.

### 7.7 Programa de afiliados

21 pedidos no período com comissão de afiliados, totalizando R$340,25. A comissão é ~20% do valor base e impacta significativamente a margem. Recomenda-se análise de custo-benefício do programa.

---

## 8. Integração com o Sistema Existente

### 8.1 Posicionamento no projeto

O validador de taxas Shopee é um **sub-módulo do módulo de canais** dentro do sistema unificado de vendas da Tuck Kids. A estrutura sugerida:

```
src/
  modules/
    channels/
      shopee/
        reconciliation/
          parser.ts          # Leitura e parse dos arquivos xlsx
          calculator.ts      # Lógica da fórmula (calcular_liberado_esperado)
          categorizer.ts     # Categorização das divergências
          types.ts           # Interfaces TypeScript
        components/
          ReconciliationView.tsx   # Tela principal
          MetricsCards.tsx         # Cards de resumo
          OrdersTable.tsx          # Tabela com filtros
          OrderDetail.tsx          # Painel expansível de detalhes
          FormulaBreakdown.tsx     # Componente da fórmula passo a passo
```

### 8.2 APIs necessárias

```typescript
// Endpoint para processar os arquivos e retornar o cruzamento
POST /api/shopee/reconciliation
  body: {
    analitico: File,        // xlsx do analítico de vendas
    incomeReport: File,     // xlsx do income report
    dataInicio: string,
    dataFim: string,
    loja: string
  }
  response: {
    summary: ReconciliationSummary,
    orders: ResultadoCruzamento[]
  }

// Endpoint para buscar pedido individual
GET /api/shopee/reconciliation/:orderId
  response: ResultadoCruzamento
```

### 8.3 Persistência sugerida

Salvar os resultados de fechamento por período para:
- Histórico de divergências
- Acompanhamento de causas recorrentes (ex: produto com peso errado aparecendo mês a mês)
- Relatório de impacto financeiro acumulado

---

## 9. Casos de Teste

### 9.1 Pedido normal — deve bater

```
Pedido: 260401M7YAGP03
Preço: R$36,90 | Voucher: R$0,40 | Itens: 1 | Afiliado: R$0
Base: R$36,50 | Comissão 20%: R$7,30 | Fixa: R$4,00
Liberado esperado: R$25,20
Liberado real: R$25,20
Resultado: OK ✓
```

### 9.2 Pedido multi-item — taxa fixa multiplicada

```
Pedido: 2604088TVYWHF1
Preço total: R$76,24 (2 itens × R$38,12) | Voucher: R$0,77 | Itens: 2
Base: R$75,47 | Comissão 20%: R$15,09 | Fixa: R$4 × 2 = R$8,00
Liberado esperado: R$52,38
Liberado real: R$52,38
Resultado: OK ✓
```

### 9.3 Pedido com afiliado

```
Pedido: 260401NU5XCWUM
Preço: R$69,90 | Voucher: R$0,70 | Afiliado: R$14,18 | Itens: 1
Base: R$69,20 | Comissão 20%: R$13,84 | Fixa: R$4,00 | Afiliado: R$14,18
Liberado esperado: R$37,18
Liberado real: R$37,18
Resultado: OK ✓ (categorizado como "Afiliado" pelo impacto alto na margem)
```

### 9.4 Pedido com taxa adicional (14-16/04)

```
Pedido: 260415SU4PAE7S
Preço: R$69,90 | Voucher: R$0,70 | Itens: 1 | Taxa adicional: R$1,73
Base: R$69,20 | Liberado esperado (fórmula padrão): R$51,36
Liberado real: R$49,63
Diff: -R$1,73
Resultado: Taxa adicional 2,5% — abrir chamado Shopee
```

### 9.5 Pedido com peso divergente

```
Pedido: 260415THK1QSAX
Preço: R$69,90 | Voucher: R$0,70 | Taxa adicional: R$1,73 | Frete divergente: R$1,35
Liberado esperado: R$51,36
Liberado real: R$48,28
Diff: -R$3,08 (R$1,73 taxa adicional + R$1,35 frete extra)
Resultado: Taxa adicional 2,5% + Peso divergente
Ação: Corrigir peso cadastrado (432g → 720g real)
```

### 9.6 Pedido em aberto (sem income)

```
Pedido: 260420BJBV5GYJ (criado em 20/04)
Income Report gerado em 20/04 — pedido muito recente
Resultado: Sem income (em aberto) — aguardar próximo relatório
```

---

## 10. Melhorias Futuras

1. **Alerta automático de produto com peso errado** — quando um mesmo SKU aparecer em `Shipping Fee Discrepancy` por 2 períodos consecutivos, gerar notificação para o time de cadastro.

2. **Dashboard de tendências** — visualizar evolução mensal do impacto financeiro por categoria de divergência.

3. **Estimativa de receita a receber** — para pedidos "em aberto", calcular o liberado esperado e projetar o caixa dos próximos dias.

4. **Comparativo entre lojas** — cruzar o custo efetivo de cada plataforma (Shopee vs ML vs Shein) usando as mesmas métricas de divergência.

5. **Exportação para chamado** — botão que gera um documento formatado com a lista de pedidos com taxa adicional para enviar ao suporte da Shopee.

6. **Detecção automática do período** — ler as datas do próprio Income Report em vez de o usuário informar manualmente.

---

## Apêndice A — Resumo do que a Shopee desconta por pedido

```
Valor liberado = Preço do produto
              - Voucher subsidiado pelo seller    (cupom BASICO1/BASICO40)
              - Comissão %  × (Preço - Voucher)  (20% ou 14%)
              - Taxa fixa × nº itens distintos    (R$4 a R$26)
              - Comissão afiliados                (se pedido via afiliado)
              - Taxa serviço adicional            (se período especial)
              - Diferença de frete               (se peso cadastrado errado)
              + Subsídio de frete Shopee          (em muitos pedidos)
```

## Apêndice B — Colunas utilizadas por aba do Income Report

**Aba Renda:**
- `ID do pedido` — chave de casamento
- `Nome do produto` — filtrar `!= "-"` para contar itens
- `Data de criação do pedido`
- `Data de conclusão do pagamento` — null = em aberto
- `Preço do produto`
- `Voucher subsidiado pelo Seller`
- `Taxa de comissão líquida`
- `Taxa de serviço líquida`
- `Taxa de comissão Afiliados do Vendedor`
- `Quantia total lançada (R$)` — valor final liberado
- `Método de Pagamento do Comprador`
- `Código do Cupom`

**Aba Service Fee Details:**
- `ID do pedido`
- `Taxa de Transação`
- `Taxa de serviço adicional`
- `Taxa por item vendido`

**Aba Shipping Fee Discrepancy:**
- `ID do pedido`
- `Taxa de frete esperada`
- `Taxa de frete real cobrada pelo parceiro logístico`
- `Motivo da discrepância`
