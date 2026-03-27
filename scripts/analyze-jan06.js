const XLSX = require('xlsx');
const wb = XLSX.readFile('sample-data/Export_Order20260225220301.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

// Get cancel column name
const range = XLSX.utils.decode_range(ws['!ref']);
const headers = [];
for (let c = range.s.c; c <= range.e.c; c++) {
  const cell = ws[XLSX.utils.encode_cell({r:0, c})];
  headers.push(cell ? cell.v : '');
}
const cancelCol = headers.find(h => h && h.includes('Cancelado'));

// Unique orders
const orderMap = new Map();
for (const r of data) {
  const id = r['Nº de Pedido'];
  if (!orderMap.has(id)) {
    orderMap.set(id, {
      valor: parseFloat(r['Valor do Pedido']) || 0,
      platform: r['Plataformas'],
      cancelStatus: r[cancelCol] || '',
      statusPedido: r['Status do Pedido'] || '',
      statusEnvio: r['Status do Envio'] || '',
    });
  }
}

console.log('Total unique orders:', orderMap.size);

// Show all orders with cancel/special status
console.log('\n=== Pedidos com status Pós-venda/Cancelado/Devolvido ===');
for (const [id, o] of orderMap) {
  if (o.cancelStatus) {
    console.log(`${id} | ${o.platform} | R$ ${o.valor} | Cancel: "${o.cancelStatus}" | Pedido: "${o.statusPedido}" | Envio: "${o.statusEnvio}"`);
  }
}

// Summary
let totalBruto = 0, totalCancel = 0, cancelCount = 0;
for (const [id, o] of orderMap) {
  totalBruto += o.valor;
  if (o.cancelStatus.toLowerCase().includes('cancelado')) {
    totalCancel += o.valor;
    cancelCount++;
  }
}
console.log('\nTotal bruto:', totalBruto.toFixed(2));
console.log('Cancelados:', cancelCount, '/ R$', totalCancel.toFixed(2));
console.log('Válido:', (totalBruto - totalCancel).toFixed(2));

// Now check: which order is the cancelled_delivered one? (UP2BZP078042)
console.log('\n=== Pedido UP2BZP078042 (cancelled_delivered na API) ===');
const target = orderMap.get('UP2BZP078042');
if (target) {
  console.log(JSON.stringify(target, null, 2));
} else {
  console.log('NOT FOUND in XLS');
}

// Also check the other cancelled_delivered from Jan 2
console.log('\n=== Pedido UP2BZP077391 (cancelled_delivered na API, Jan 2) ===');
const target2 = orderMap.get('UP2BZP077391');
if (target2) {
  console.log(JSON.stringify(target2, null, 2));
} else {
  console.log('NOT FOUND in XLS (expected - different day)');
}
