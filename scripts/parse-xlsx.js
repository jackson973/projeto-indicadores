const XLSX = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '../sample-data/Export_Order20260225142529.xlsx');
const workbook = XLSX.readFile(filePath);

const sheetName = workbook.SheetNames[0];
console.log(`=== Sheet name: "${sheetName}" ===\n`);

const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

// 1. Column headers
const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
console.log('=== COLUMN HEADERS ===');
headers.forEach((h, i) => console.log(`  [${i}] ${h}`));

// 2. Total number of rows
console.log(`\n=== TOTAL ROWS: ${rows.length} ===\n`);

// Try to detect the key columns by common Portuguese/UpSeller names
const guessCol = (candidates) => {
  for (const c of candidates) {
    const found = headers.find(h => h.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return null;
};

const colOrder    = guessCol(['Order ID', 'Número do Pedido', 'No. do Pedido', 'No. Pedido', 'N° do pedido', 'order']);
const colPlatform = guessCol(['Plataforma', 'Platform', 'Canal']);
const colStore    = guessCol(['Loja', 'Store', 'Nome da Loja']);
const colDate     = guessCol(['Data do Pedido', 'Data', 'Order Date', 'Hora do Pedido', 'Data/Hora', 'Criado em', 'Created']);
const colAmount   = guessCol(['Valor Total', 'Total do Pedido', 'Subtotal', 'Amount', 'Valor', 'Total', 'Receita', 'Revenue', 'Grand Total', 'Payment Total']);
const colProduct  = guessCol(['Produto', 'Product', 'Nome do Produto', 'Product Name', 'SKU']);
const colQty      = guessCol(['Quantidade', 'Qty', 'Quantity', 'Qtd']);
const colStatus   = guessCol(['Status', 'Estado', 'Situação', 'Order Status', 'Status do Pedido']);

console.log('=== DETECTED KEY COLUMNS ===');
console.log(`  Order:    ${colOrder || '(not found)'}`);
console.log(`  Platform: ${colPlatform || '(not found)'}`);
console.log(`  Store:    ${colStore || '(not found)'}`);
console.log(`  Date:     ${colDate || '(not found)'}`);
console.log(`  Amount:   ${colAmount || '(not found)'}`);
console.log(`  Product:  ${colProduct || '(not found)'}`);
console.log(`  Quantity: ${colQty || '(not found)'}`);
console.log(`  Status:   ${colStatus || '(not found)'}`);

// 3. First 5 rows (focused columns)
console.log('\n=== FIRST 5 ROWS (KEY FIELDS) ===');
const keyCols = [colOrder, colPlatform, colStore, colDate, colAmount, colProduct, colQty, colStatus].filter(Boolean);
for (let i = 0; i < Math.min(5, rows.length); i++) {
  console.log(`\n--- Row ${i + 1} ---`);
  for (const col of keyCols) {
    console.log(`  ${col}: ${rows[i][col]}`);
  }
}

// Also print the full first row for debugging
console.log('\n=== FULL FIRST ROW (ALL COLUMNS) ===');
if (rows.length > 0) {
  for (const [k, v] of Object.entries(rows[0])) {
    console.log(`  ${k}: ${v}`);
  }
}

// 4. Revenue grouped by date (last 7 days)
console.log('\n=== REVENUE BY DATE (LAST 7 DAYS) ===');

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0);
  }
  const str = String(val).trim();
  // Try DD/MM/YYYY HH:mm or DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[\sT]*(\d{2}:\d{2}(?::\d{2})?)?/);
  if (brMatch) {
    const [, day, month, year, time] = brMatch;
    return new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${time || '00:00:00'}`);
  }
  // Try YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    return new Date(str);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function parseAmount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).trim();
  s = s.replace(/[R$\s]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const today = new Date('2026-02-25');
const sevenDaysAgo = new Date('2026-02-19');

const revenueByDate = {};
let todayRevenue = 0;
let totalRevenue = 0;
let parseDateFailCount = 0;

for (const row of rows) {
  const dateVal = colDate ? row[colDate] : null;
  const amountVal = colAmount ? row[colAmount] : 0;
  
  const d = parseDate(dateVal);
  const amount = parseAmount(amountVal);
  totalRevenue += amount;
  
  if (!d) {
    parseDateFailCount++;
    continue;
  }
  
  const dateStr = d.toISOString().slice(0, 10);
  
  if (d >= sevenDaysAgo && d <= new Date('2026-02-25T23:59:59')) {
    revenueByDate[dateStr] = (revenueByDate[dateStr] || 0) + amount;
  }
  
  if (dateStr === '2026-02-25') {
    todayRevenue += amount;
  }
}

const sortedDates = Object.keys(revenueByDate).sort();
if (sortedDates.length === 0) {
  console.log('  No data found in the last 7 days.');
  console.log(`  (Date parse failures: ${parseDateFailCount} out of ${rows.length})`);
  if (colDate) {
    const sampleDates = [...new Set(rows.slice(0, 10).map(r => r[colDate]))];
    console.log(`  Sample date values: ${JSON.stringify(sampleDates)}`);
  }
} else {
  let weekTotal = 0;
  for (const date of sortedDates) {
    const val = revenueByDate[date];
    weekTotal += val;
    console.log(`  ${date}: R$ ${val.toFixed(2)}`);
  }
  console.log(`  --------`);
  console.log(`  Week Total: R$ ${weekTotal.toFixed(2)}`);
}

// 5. Today's revenue
console.log(`\n=== TODAY'S REVENUE (2026-02-25) ===`);
console.log(`  R$ ${todayRevenue.toFixed(2)}`);

console.log(`\n=== OVERALL TOTAL REVENUE (ALL ROWS) ===`);
console.log(`  R$ ${totalRevenue.toFixed(2)}`);
console.log(`  (Date parse failures: ${parseDateFailCount})`);

// Extra: count by status
if (colStatus) {
  console.log('\n=== ORDER COUNT BY STATUS ===');
  const statusCount = {};
  for (const row of rows) {
    const s = row[colStatus] || '(empty)';
    statusCount[s] = (statusCount[s] || 0) + 1;
  }
  for (const [status, count] of Object.entries(statusCount).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
  }
}
