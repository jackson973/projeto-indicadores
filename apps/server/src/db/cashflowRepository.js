const db = require('./connection');

// ── Date Utilities ──

/**
 * Get today's date in YYYY-MM-DD format (Brazil timezone UTC-3)
 */
function getTodayBrazil() {
  const now = new Date();
  const brazilTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
  return brazilTime.toISOString().slice(0, 10);
}

/**
 * Check if date is weekend and return the next Monday if so
 */
function getEffectiveDueDate() {
  const today = new Date();
  const dayOfWeek = today.getDay();

  if (dayOfWeek === 0) { // Sunday
    const monday = new Date(today);
    monday.setDate(today.getDate() + 1);
    return monday.toISOString().slice(0, 10);
  } else if (dayOfWeek === 6) { // Saturday
    const monday = new Date(today);
    monday.setDate(today.getDate() + 2);
    return monday.toISOString().slice(0, 10);
  }

  return getTodayBrazil();
}

// ── Categories ──

async function getCategories() {
  const result = await db.query(
    `SELECT id, name, preset, active, created_at AS "createdAt"
     FROM cashflow_categories WHERE active = true ORDER BY preset DESC, name`
  );
  return result.rows;
}

async function createCategory(name) {
  const result = await db.query(
    `INSERT INTO cashflow_categories (name) VALUES ($1)
     RETURNING id, name, preset, active, created_at AS "createdAt"`,
    [name]
  );
  return result.rows[0];
}

async function updateCategory(id, name) {
  const result = await db.query(
    `UPDATE cashflow_categories SET name = $1 WHERE id = $2 AND preset = false
     RETURNING id, name, preset, active, created_at AS "createdAt"`,
    [name, id]
  );
  return result.rows[0] || null;
}

async function deleteCategory(id) {
  const result = await db.query(
    `UPDATE cashflow_categories SET active = false WHERE id = $1 AND preset = false RETURNING id`,
    [id]
  );
  return result.rowCount > 0;
}

// ── Boxes ──

async function getBoxes() {
  const result = await db.query(
    `SELECT id, name, active, created_at AS "createdAt"
     FROM cashflow_boxes WHERE active = true ORDER BY id`
  );
  return result.rows;
}

async function createBox(name) {
  const result = await db.query(
    `INSERT INTO cashflow_boxes (name) VALUES ($1)
     RETURNING id, name, active, created_at AS "createdAt"`,
    [name]
  );
  return result.rows[0];
}

async function updateBox(id, name) {
  const result = await db.query(
    `UPDATE cashflow_boxes SET name = $1 WHERE id = $2 AND active = true
     RETURNING id, name, active, created_at AS "createdAt"`,
    [name, id]
  );
  return result.rows[0] || null;
}

async function deleteBox(id) {
  // Check if it's the last active box
  const countResult = await db.query('SELECT COUNT(*) AS cnt FROM cashflow_boxes WHERE active = true');
  if (parseInt(countResult.rows[0].cnt) <= 1) {
    return { error: 'Não é possível excluir o último caixa ativo.' };
  }
  const result = await db.query(
    'UPDATE cashflow_boxes SET active = false WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount > 0 ? { success: true } : null;
}

// ── Entries ──

async function getEntries(year, month, boxId) {
  const result = await db.query(
    `SELECT e.id, e.date, e.category_id AS "categoryId", c.name AS "categoryName",
            e.description, e.type, e.amount, e.status, e.recurrence_id AS "recurrenceId",
            e.created_at AS "createdAt"
     FROM cashflow_entries e
     JOIN cashflow_categories c ON c.id = e.category_id
     WHERE EXTRACT(YEAR FROM e.date) = $1 AND EXTRACT(MONTH FROM e.date) = $2 AND e.box_id = $3
     ORDER BY e.date, e.id`,
    [year, month, boxId]
  );
  return result.rows.map(row => ({ ...row, amount: parseFloat(row.amount) }));
}

async function createEntry({ date, categoryId, description, type, amount, status, recurrenceId, createdBy, boxId }) {
  const result = await db.query(
    `INSERT INTO cashflow_entries (date, category_id, description, type, amount, status, recurrence_id, created_by, box_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, date, category_id AS "categoryId", description, type, amount, status,
               recurrence_id AS "recurrenceId", created_at AS "createdAt"`,
    [date, categoryId, description, type, amount, status || 'pending', recurrenceId || null, createdBy, boxId]
  );
  return { ...result.rows[0], amount: parseFloat(result.rows[0].amount) };
}

async function updateEntry(id, { date, categoryId, description, type, amount, status }) {
  const result = await db.query(
    `UPDATE cashflow_entries SET date = $1, category_id = $2, description = $3, type = $4, amount = $5, status = $6
     WHERE id = $7
     RETURNING id, date, category_id AS "categoryId", description, type, amount, status,
               recurrence_id AS "recurrenceId", created_at AS "createdAt"`,
    [date, categoryId, description, type, amount, status, id]
  );
  if (!result.rows[0]) return null;
  return { ...result.rows[0], amount: parseFloat(result.rows[0].amount) };
}

async function toggleEntryStatus(id) {
  const result = await db.query(
    `UPDATE cashflow_entries SET status = CASE WHEN status = 'ok' THEN 'pending' ELSE 'ok' END
     WHERE id = $1
     RETURNING id, status`,
    [id]
  );
  return result.rows[0] || null;
}

async function deleteEntry(id) {
  const result = await db.query('DELETE FROM cashflow_entries WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

// ── Balances ──

async function getBalance(year, month, boxId) {
  // Check if explicit balance exists for this month and box
  const result = await db.query(
    `SELECT opening_balance FROM cashflow_balances WHERE year = $1 AND month = $2 AND box_id = $3`,
    [year, month, boxId]
  );
  if (result.rows.length > 0) {
    return parseFloat(result.rows[0].opening_balance);
  }

  // Auto-calculate from previous month's closing balance
  const prevBalance = await db.query(
    `SELECT year, month, opening_balance FROM cashflow_balances
     WHERE (year < $1 OR (year = $1 AND month < $2)) AND box_id = $3
     ORDER BY year DESC, month DESC LIMIT 1`,
    [year, month, boxId]
  );

  let baseBalance = 0;
  let sumFromDate = null;

  if (prevBalance.rows.length > 0) {
    baseBalance = parseFloat(prevBalance.rows[0].opening_balance);
    const by = prevBalance.rows[0].year;
    const bm = prevBalance.rows[0].month;
    sumFromDate = `${by}-${String(bm).padStart(2, '0')}-01`;
  }

  // End date: last day of the month before the target
  let endYear = year, endMonth = month - 1;
  if (endMonth === 0) { endMonth = 12; endYear--; }
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let query, params;
  if (sumFromDate) {
    query = `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
     FROM cashflow_entries
     WHERE date >= $1 AND date <= $2 AND box_id = $3`;
    params = [sumFromDate, endDate, boxId];
  } else {
    query = `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
     FROM cashflow_entries
     WHERE date <= $1 AND box_id = $2`;
    params = [endDate, boxId];
  }

  const sums = await db.query(query, params);
  const totalIncome = parseFloat(sums.rows[0].total_income);
  const totalExpense = parseFloat(sums.rows[0].total_expense);

  return Number((baseBalance + totalIncome - totalExpense).toFixed(2));
}

async function getAllBoxesBalance(year, month) {
  // Sum opening balances across all active boxes for dashboard "Todos os caixas"
  const boxes = await getBoxes();
  let total = 0;
  for (const box of boxes) {
    total += await getBalance(year, month, box.id);
  }
  return Number(total.toFixed(2));
}

async function setBalance(year, month, openingBalance, boxId) {
  await db.query(
    `INSERT INTO cashflow_balances (year, month, opening_balance, box_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (year, month, box_id) DO UPDATE SET opening_balance = $3`,
    [year, month, openingBalance, boxId]
  );
}

// ── Summary ──

async function getSummary(year, month, boxId) {
  const openingBalance = await getBalance(year, month, boxId);
  const entries = await getEntries(year, month, boxId);

  const totalIncome = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const totalExpense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const closingBalance = openingBalance + totalIncome - totalExpense;

  // Daily balance for chart
  const dailyMap = {};
  let runningBalance = openingBalance;
  for (const entry of entries) {
    const day = entry.date instanceof Date
      ? entry.date.toISOString().slice(0, 10)
      : String(entry.date).slice(0, 10);
    if (entry.type === 'income') runningBalance += entry.amount;
    else runningBalance -= entry.amount;
    dailyMap[day] = runningBalance;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyBalance = [];
  let lastBalance = openingBalance;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (dailyMap[key] !== undefined) lastBalance = dailyMap[key];
    dailyBalance.push({ date: key, balance: Number(lastBalance.toFixed(2)) });
  }

  return {
    openingBalance: Number(openingBalance.toFixed(2)),
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpense: Number(totalExpense.toFixed(2)),
    closingBalance: Number(closingBalance.toFixed(2)),
    dailyBalance
  };
}

// ── Recurrences ──

async function getRecurrences(boxId) {
  const result = await db.query(
    `SELECT r.id, r.category_id AS "categoryId", c.name AS "categoryName",
            r.description, r.type, r.amount, r.frequency,
            r.day_of_month AS "dayOfMonth", r.start_date AS "startDate",
            r.end_date AS "endDate", r.installment, r.active, r.created_at AS "createdAt"
     FROM cashflow_recurrences r
     JOIN cashflow_categories c ON c.id = r.category_id
     WHERE r.active = true AND r.box_id = $1
     ORDER BY r.description`,
    [boxId]
  );
  return result.rows.map(row => ({ ...row, amount: parseFloat(row.amount) }));
}

async function createRecurrence({ categoryId, description, type, amount, frequency, dayOfMonth, startDate, endDate, installment, createdBy, boxId }) {
  const result = await db.query(
    `INSERT INTO cashflow_recurrences (category_id, description, type, amount, frequency, day_of_month, start_date, end_date, installment, created_by, box_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, category_id AS "categoryId", description, type, amount, frequency,
               day_of_month AS "dayOfMonth", start_date AS "startDate", end_date AS "endDate",
               installment, active, created_at AS "createdAt"`,
    [categoryId, description, type, amount, frequency, dayOfMonth || null, startDate, endDate || null, installment || false, createdBy, boxId]
  );
  return { ...result.rows[0], amount: parseFloat(result.rows[0].amount) };
}

async function updateRecurrence(id, { categoryId, description, type, amount, frequency, dayOfMonth, startDate, endDate, installment, boxId }) {
  const result = await db.query(
    `UPDATE cashflow_recurrences SET category_id = $1, description = $2, type = $3, amount = $4,
            frequency = $5, day_of_month = $6, start_date = $7, end_date = $8, installment = $9, box_id = $10
     WHERE id = $11
     RETURNING id, category_id AS "categoryId", description, type, amount, frequency,
               day_of_month AS "dayOfMonth", start_date AS "startDate", end_date AS "endDate",
               installment, active, created_at AS "createdAt"`,
    [categoryId, description, type, amount, frequency, dayOfMonth || null, startDate, endDate || null, installment || false, boxId, id]
  );
  if (!result.rows[0]) return null;
  return { ...result.rows[0], amount: parseFloat(result.rows[0].amount) };
}

async function deleteRecurrence(id) {
  const result = await db.query(
    'UPDATE cashflow_recurrences SET active = false WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount > 0;
}

function getInstallmentLabel(rec, entryDate) {
  if (!rec.installment || !rec.endDate) return '';
  const start = new Date(rec.startDate);
  const end = new Date(rec.endDate);
  const entry = new Date(entryDate);

  if (rec.frequency === 'monthly') {
    const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    const currentMonth = (entry.getFullYear() - start.getFullYear()) * 12 + (entry.getMonth() - start.getMonth()) + 1;
    return ` ${currentMonth}/${totalMonths}`;
  } else {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const totalWeeks = Math.floor((end - start) / msPerWeek) + 1;
    const currentWeek = Math.floor((entry - start) / msPerWeek) + 1;
    return ` ${currentWeek}/${totalWeeks}`;
  }
}

async function generateRecurrenceEntries(year, month, createdBy, boxId) {
  const recurrences = await getRecurrences(boxId);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  let count = 0;

  for (const rec of recurrences) {
    const recStart = new Date(rec.startDate);
    const recEnd = rec.endDate ? new Date(rec.endDate) : null;
    if (recStart > monthEnd) continue;
    if (recEnd && recEnd < monthStart) continue;

    if (rec.frequency === 'monthly') {
      const day = rec.dayOfMonth || recStart.getDate();
      const clampedDay = Math.min(day, monthEnd.getDate());
      const entryDate = new Date(year, month - 1, clampedDay);
      if (entryDate < recStart) continue;
      if (recEnd && entryDate > recEnd) continue;

      const dateStr = entryDate.toISOString().slice(0, 10);
      const exists = await db.query(
        `SELECT id FROM cashflow_entries WHERE recurrence_id = $1 AND date = $2`,
        [rec.id, dateStr]
      );
      if (exists.rows.length === 0) {
        const label = getInstallmentLabel(rec, entryDate);
        await createEntry({
          date: dateStr,
          categoryId: rec.categoryId,
          description: rec.description + label,
          type: rec.type,
          amount: rec.amount,
          status: 'pending',
          recurrenceId: rec.id,
          createdBy,
          boxId
        });
        count++;
      }
    } else if (rec.frequency === 'weekly') {
      let current = new Date(monthStart);
      while (current <= monthEnd) {
        if (current >= recStart && (!recEnd || current <= recEnd)) {
          const dateStr = current.toISOString().slice(0, 10);
          const exists = await db.query(
            `SELECT id FROM cashflow_entries WHERE recurrence_id = $1 AND date = $2`,
            [rec.id, dateStr]
          );
          if (exists.rows.length === 0) {
            const label = getInstallmentLabel(rec, current);
            await createEntry({
              date: dateStr,
              categoryId: rec.categoryId,
              description: rec.description + label,
              type: rec.type,
              amount: rec.amount,
              status: 'pending',
              recurrenceId: rec.id,
              createdBy,
              boxId
            });
            count++;
          }
        }
        current.setDate(current.getDate() + 7);
      }
    }
  }

  return count;
}

// ── Dashboard ──

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getPeriodKey(date, grouping) {
  // Parse date string directly to avoid timezone issues
  const str = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
  const [y, m] = str.split('-').map(Number);
  switch (grouping) {
    case 'quarter': return `${y}-T${Math.ceil(m / 3)}`;
    case 'semester': return `${y}-S${Math.ceil(m / 6)}`;
    case 'year': return `${y}`;
    default: return `${y}-${String(m).padStart(2, '0')}`;
  }
}

function getPeriodLabel(key, grouping) {
  switch (grouping) {
    case 'quarter': {
      const [y, q] = key.split('-T');
      return `${q}T/${y}`;
    }
    case 'semester': {
      const [y, s] = key.split('-S');
      return `${s}S/${y}`;
    }
    case 'year': return key;
    default: {
      const [y, m] = key.split('-');
      return `${MONTH_NAMES_SHORT[parseInt(m, 10) - 1]}/${y}`;
    }
  }
}

async function getDashboardData(startDate, endDate, grouping, boxId) {
  // Parse date string directly to avoid timezone issues
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const openingBalance = boxId
    ? await getBalance(startYear, startMonth, boxId)
    : await getAllBoxesBalance(startYear, startMonth);

  let query, params;
  if (boxId) {
    query = `SELECT e.date, e.type, e.amount, c.name AS category_name
       FROM cashflow_entries e
       JOIN cashflow_categories c ON c.id = e.category_id
       WHERE e.date >= $1 AND e.date <= $2 AND e.box_id = $3
       ORDER BY e.date`;
    params = [startDate, endDate, boxId];
  } else {
    query = `SELECT e.date, e.type, e.amount, c.name AS category_name
       FROM cashflow_entries e
       JOIN cashflow_categories c ON c.id = e.category_id
       WHERE e.date >= $1 AND e.date <= $2
       ORDER BY e.date`;
    params = [startDate, endDate];
  }

  const result = await db.query(query, params);

  let totalIncome = 0;
  let totalExpense = 0;
  const periodsMap = {};
  const expCatTotals = {};
  const incCatTotals = {};
  const expCatPeriodMap = {};
  const allExpCategories = new Set();

  for (const row of result.rows) {
    const amount = parseFloat(row.amount);
    const periodKey = getPeriodKey(row.date, grouping);
    const cat = row.category_name;

    if (!periodsMap[periodKey]) {
      periodsMap[periodKey] = { income: 0, expense: 0 };
    }

    if (row.type === 'income') {
      totalIncome += amount;
      periodsMap[periodKey].income += amount;
      incCatTotals[cat] = (incCatTotals[cat] || 0) + amount;
    } else {
      totalExpense += amount;
      periodsMap[periodKey].expense += amount;
      expCatTotals[cat] = (expCatTotals[cat] || 0) + amount;
      allExpCategories.add(cat);
      if (!expCatPeriodMap[periodKey]) expCatPeriodMap[periodKey] = {};
      expCatPeriodMap[periodKey][cat] = (expCatPeriodMap[periodKey][cat] || 0) + amount;
    }
  }

  const netResult = totalIncome - totalExpense;
  const closingBalance = Number((openingBalance + totalIncome - totalExpense).toFixed(2));

  const periods = Object.keys(periodsMap).sort().map(key => ({
    period: key,
    label: getPeriodLabel(key, grouping),
    income: Number(periodsMap[key].income.toFixed(2)),
    expense: Number(periodsMap[key].expense.toFixed(2)),
    result: Number((periodsMap[key].income - periodsMap[key].expense).toFixed(2))
  }));

  const expensesByCategory = Object.entries(expCatTotals)
    .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total);

  const incomeByCategory = Object.entries(incCatTotals)
    .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total);

  const categoryList = [...allExpCategories].sort();
  const expensesByCategoryPeriod = Object.keys(expCatPeriodMap).sort().map(key => {
    const row = { period: key, label: getPeriodLabel(key, grouping) };
    for (const cat of categoryList) {
      row[cat] = Number((expCatPeriodMap[key][cat] || 0).toFixed(2));
    }
    return row;
  });

  return {
    totals: {
      openingBalance: Number(openingBalance.toFixed(2)),
      totalIncome: Number(totalIncome.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      netResult: Number(netResult.toFixed(2)),
      closingBalance
    },
    periods,
    expensesByCategory,
    incomeByCategory,
    expensesByCategoryPeriod,
    expenseCategories: categoryList
  };
}

// ── Alerts ──

/**
 * Get overdue and due-today pending expenses for a specific box
 */
async function getAlerts(boxId, year, month) {
  const today = getTodayBrazil();

  // Calculate period boundaries
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Overdue: date < today, type=expense, status=pending, within period
  const overdueQuery = `
    SELECT e.id, e.date, e.category_id AS "categoryId", c.name AS "categoryName",
           e.description, e.amount, e.box_id AS "boxId"
    FROM cashflow_entries e
    JOIN cashflow_categories c ON c.id = e.category_id
    WHERE e.date < $1
      AND e.date >= $3
      AND e.date <= $4
      AND e.type = 'expense'
      AND e.status = 'pending'
      AND e.box_id = $2
    ORDER BY e.date ASC
  `;

  // Upcoming: date >= today, type=expense, status=pending, within period
  const upcomingQuery = `
    SELECT e.id, e.date, e.category_id AS "categoryId", c.name AS "categoryName",
           e.description, e.amount, e.box_id AS "boxId"
    FROM cashflow_entries e
    JOIN cashflow_categories c ON c.id = e.category_id
    WHERE e.date >= $1
      AND e.date >= $3
      AND e.date <= $4
      AND e.type = 'expense'
      AND e.status = 'pending'
      AND e.box_id = $2
    ORDER BY e.date ASC
  `;

  const [overdueResult, upcomingResult] = await Promise.all([
    db.query(overdueQuery, [today, boxId, startDate, endDate]),
    db.query(upcomingQuery, [today, boxId, startDate, endDate])
  ]);

  const overdueItems = overdueResult.rows.map(r => ({ ...r, amount: parseFloat(r.amount) }));
  const upcomingItems = upcomingResult.rows.map(r => ({ ...r, amount: parseFloat(r.amount) }));

  // Calculate totals
  const overdueTotal = overdueItems.reduce((sum, item) => sum + item.amount, 0);
  const upcomingTotal = upcomingItems.reduce((sum, item) => sum + item.amount, 0);

  return {
    overdueCount: overdueItems.length,
    overdueTotal,
    overdueItems,
    upcomingCount: upcomingItems.length,
    upcomingTotal,
    upcomingItems
  };
}

/**
 * Get all alerts across all active boxes (used by email scheduler)
 */
async function getAllBoxesAlerts() {
  const boxes = await getBoxes();
  const today = getTodayBrazil();

  const results = [];
  for (const box of boxes) {
    const alerts = await getAlerts(box.id);
    if (alerts.overdueCount > 0 || alerts.upcomingCount > 0) {
      results.push({ box, ...alerts });
    }
  }

  return {
    boxes: results,
    today
  };
}

module.exports = {
  getBoxes,
  createBox,
  updateBox,
  deleteBox,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getEntries,
  createEntry,
  updateEntry,
  toggleEntryStatus,
  deleteEntry,
  getBalance,
  setBalance,
  getSummary,
  getRecurrences,
  createRecurrence,
  updateRecurrence,
  deleteRecurrence,
  generateRecurrenceEntries,
  getDashboardData,
  getAlerts,
  getAllBoxesAlerts,
  getTodayBrazil
};
