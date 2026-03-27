const XLSX = require('xlsx');
const wb = XLSX.readFile('sample-data/Export_Order20260225213211.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

// Find orders with Valor do Pedido = 0 or empty
const zeroOrders = data.filter(r => {
  const v = parseFloat(r['Valor do Pedido']);
  return v === 0 || isNaN(v);
});
console.log('=== Pedidos com Valor do Pedido = 0 ===');
for (const r of zeroOrders) {
  console.log(r['Nº de Pedido'], '|', r['Plataformas'], '| ValorPedido:', r['Valor do Pedido'], '| PreçoItem:', r['Preço Unitário do Item'], '| Qtd:', r['Quantidade']);
}

console.log('\nTotal unique orders in XLS:', new Map([...data.map(r => [r['Nº de Pedido'], r])]).size);

// Item values for zero-value orders
console.log('\n=== Item values for zero-value orders ===');
for (const r of zeroOrders) {
  const itemPrice = parseFloat(r['Preço Unitário do Item']) || 0;
  const qty = parseInt(r['Quantidade']) || 1;
  console.log(r['Nº de Pedido'], '| Item:', (r['Nome do Produto'] || '').substring(0, 50), '| Price:', itemPrice, '| Qty:', qty);
}
