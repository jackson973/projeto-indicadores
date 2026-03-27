const XLSX = require('xlsx');
const wb = XLSX.readFile('sample-data/Export_Order20260225152706.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

// Get all Shein orders from XLS
const xlsShein = data.filter(r => r['Plataformas'] === 'Shein');
const xlsSheinIds = new Set(xlsShein.map(r => r['Nº de Pedido']));

console.log('=== SHEIN NO XLS (03/01/2026) ===');
console.log('Total:', xlsShein.length, 'linhas');
for (const r of xlsShein) {
  console.log('  ' + r['Nº de Pedido'] + ' (' + r['Nº de Pedido da Plataforma'] + ') | Hora: ' + r['Hora do Pedido'] + ' | R$ ' + r['Valor do Pedido']);
}

// BD Shein order IDs (from earlier analysis)
const bdSheinIds = [
  'UP2BZP077548', 'UP2BZP077549', 'UP2BZP077607', 'UP2BZP077608',
  'UP2BZP077613', 'UP2BZP077619', 'UP2BZP077656', 'UP2BZP077669', 'UP2BZP077671'
];

console.log('\n=== SHEIN NO BD (03/01/2026) ===');
console.log('Total:', bdSheinIds.length, 'pedidos');

// Find which BD orders are NOT in XLS
const extras = bdSheinIds.filter(id => !xlsSheinIds.has(id));
console.log('\n=== PEDIDOS SHEIN EXTRAS NO BD (não existem no XLS) ===');
console.log(extras);
