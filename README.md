# Projeto Indicadores (UPseller)

Dashboard web para analisar vendas exportadas do ERP UPseller via planilha (CSV/XLSX) com UI em Ant Design.

## ✅ Funcionalidades
- Upload de planilha de vendas
- Vendas por período (dia ou mês)
- Vendas por loja
- Vendas por estado
- Vendas por plataforma
- Cancelamentos por motivo
- Ticket médio por estado
- Curva ABC de produtos

## 🧾 Formato esperado da planilha
Colunas aceitas (case-insensitive):
- `date`, `data`, `hora do pedido`
- `store`, `loja` (opcional)
- `product`, `produto` (opcional)
- `quantity`, `quantidade`, `total de pedidos`, `qtd. do produto` (opcional)
- `total`, `valor`, `valor total de vendas`, `valor do pedido`
- `estado` (opcional)
- `link da imagem` (opcional)

Veja um exemplo em `sample-data/sample-sales.csv`.

## ▶️ Como rodar

### Instalar dependências
```bash
npm install
```

### Rodar app completo (API + Frontend)
```bash
npm run dev
```

- API: http://localhost:4000
- Frontend: http://localhost:5173

## ✅ Testes
```bash
npm run test
```

## Observações
- Os dados ficam em memória após o upload (sem banco).
- Se a planilha não tiver loja/produto, o sistema assume "Todas" e "Geral".
- Se a planilha não tiver estado, o sistema assume "Não informado".
- Para produção, recomendo persistência em banco e autenticação.
