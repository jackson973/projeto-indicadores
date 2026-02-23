const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const { authenticate, requireAdmin } = require('../middleware/auth');
const repo = require('../db/cashflowRepository');
const { getSaoPauloYear, getSaoPauloMonth } = require('../lib/timezone');

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();
router.use(authenticate);

// ── Boxes ──

router.get('/boxes', async (req, res) => {
  try {
    const boxes = await repo.getBoxes();
    return res.json(boxes);
  } catch (error) {
    console.error('List boxes error:', error);
    return res.status(500).json({ message: 'Erro ao listar caixas.' });
  }
});

router.post('/boxes', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome é obrigatório.' });
    const box = await repo.createBox(name.trim());
    return res.status(201).json(box);
  } catch (error) {
    console.error('Create box error:', error);
    return res.status(500).json({ message: 'Erro ao criar caixa.' });
  }
});

router.put('/boxes/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome é obrigatório.' });
    const box = await repo.updateBox(req.params.id, name.trim());
    if (!box) return res.status(404).json({ message: 'Caixa não encontrado.' });
    return res.json(box);
  } catch (error) {
    console.error('Update box error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar caixa.' });
  }
});

router.delete('/boxes/:id', async (req, res) => {
  try {
    const result = await repo.deleteBox(req.params.id);
    if (!result) return res.status(404).json({ message: 'Caixa não encontrado.' });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.json({ message: 'Caixa desativado.' });
  } catch (error) {
    console.error('Delete box error:', error);
    return res.status(500).json({ message: 'Erro ao desativar caixa.' });
  }
});

// ── Categories ──

router.get('/categories', async (req, res) => {
  try {
    const categories = await repo.getCategories();
    return res.json(categories);
  } catch (error) {
    console.error('List categories error:', error);
    return res.status(500).json({ message: 'Erro ao listar categorias.' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome é obrigatório.' });
    const category = await repo.createCategory(name.trim());
    return res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    return res.status(500).json({ message: 'Erro ao criar categoria.' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Nome é obrigatório.' });
    const category = await repo.updateCategory(req.params.id, name.trim());
    if (!category) return res.status(404).json({ message: 'Categoria não encontrada ou é pré-definida.' });
    return res.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar categoria.' });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const deleted = await repo.deleteCategory(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Categoria não encontrada ou é pré-definida.' });
    return res.json({ message: 'Categoria desativada.' });
  } catch (error) {
    console.error('Delete category error:', error);
    return res.status(500).json({ message: 'Erro ao desativar categoria.' });
  }
});

// ── Entries ──

router.get('/entries', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || getSaoPauloYear();
    const month = parseInt(req.query.month) || getSaoPauloMonth();
    const boxId = parseInt(req.query.boxId);
    if (!boxId) return res.status(400).json({ message: 'boxId é obrigatório.' });
    // Auto-generate recurrence entries for this month (non-blocking)
    try {
      await repo.generateRecurrenceEntries(year, month, req.user.id, boxId);
    } catch (genErr) {
      console.error('Auto-generate recurrences error (non-blocking):', genErr);
    }
    const entries = await repo.getEntries(year, month, boxId);
    return res.json(entries);
  } catch (error) {
    console.error('List entries error:', error);
    return res.status(500).json({ message: 'Erro ao listar lançamentos.' });
  }
});

router.post('/entries', async (req, res) => {
  try {
    const { date, categoryId, description, type, amount, status, boxId } = req.body;
    if (!date || !categoryId || !description || !type || amount === undefined || !boxId) {
      return res.status(400).json({ message: 'Data, categoria, histórico, tipo, valor e caixa são obrigatórios.' });
    }
    const entry = await repo.createEntry({
      date, categoryId, description: description.trim(), type, amount,
      status: status || 'pending', createdBy: req.user.id, boxId
    });
    return res.status(201).json(entry);
  } catch (error) {
    console.error('Create entry error:', error);
    return res.status(500).json({ message: 'Erro ao criar lançamento.' });
  }
});

router.put('/entries/:id', async (req, res) => {
  try {
    const { date, categoryId, description, type, amount, status } = req.body;
    if (!date || !categoryId || !description || !type || amount === undefined) {
      return res.status(400).json({ message: 'Data, categoria, histórico, tipo e valor são obrigatórios.' });
    }
    const entry = await repo.updateEntry(req.params.id, {
      date, categoryId, description: description.trim(), type, amount, status
    });
    if (!entry) return res.status(404).json({ message: 'Lançamento não encontrado.' });
    return res.json(entry);
  } catch (error) {
    console.error('Update entry error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar lançamento.' });
  }
});

router.put('/entries/:id/status', async (req, res) => {
  try {
    const result = await repo.toggleEntryStatus(req.params.id);
    if (!result) return res.status(404).json({ message: 'Lançamento não encontrado.' });
    return res.json(result);
  } catch (error) {
    console.error('Toggle status error:', error);
    return res.status(500).json({ message: 'Erro ao alterar status.' });
  }
});

router.delete('/entries/:id', async (req, res) => {
  try {
    const deleted = await repo.deleteEntry(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Lançamento não encontrado.' });
    return res.json({ message: 'Lançamento excluído.' });
  } catch (error) {
    console.error('Delete entry error:', error);
    return res.status(500).json({ message: 'Erro ao excluir lançamento.' });
  }
});

// ── Balance ──

router.get('/balance', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || getSaoPauloYear();
    const month = parseInt(req.query.month) || getSaoPauloMonth();
    const boxId = parseInt(req.query.boxId);
    if (!boxId) return res.status(400).json({ message: 'boxId é obrigatório.' });
    const openingBalance = await repo.getBalance(year, month, boxId);
    return res.json({ openingBalance });
  } catch (error) {
    console.error('Get balance error:', error);
    return res.status(500).json({ message: 'Erro ao buscar saldo.' });
  }
});

router.put('/balance', async (req, res) => {
  try {
    const { year, month, openingBalance, boxId } = req.body;
    if (!year || !month || openingBalance === undefined || !boxId) {
      return res.status(400).json({ message: 'Ano, mês, saldo inicial e caixa são obrigatórios.' });
    }
    await repo.setBalance(year, month, openingBalance, boxId);
    return res.json({ message: 'Saldo inicial atualizado.' });
  } catch (error) {
    console.error('Set balance error:', error);
    return res.status(500).json({ message: 'Erro ao definir saldo.' });
  }
});

// ── Summary ──

router.get('/summary', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || getSaoPauloYear();
    const month = parseInt(req.query.month) || getSaoPauloMonth();
    const boxId = parseInt(req.query.boxId);
    if (!boxId) return res.status(400).json({ message: 'boxId é obrigatório.' });
    const summary = await repo.getSummary(year, month, boxId);
    return res.json(summary);
  } catch (error) {
    console.error('Summary error:', error);
    return res.status(500).json({ message: 'Erro ao gerar resumo.' });
  }
});

// ── Alerts ──

router.get('/alerts', async (req, res) => {
  try {
    const boxId = parseInt(req.query.boxId);
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);

    if (!boxId) return res.status(400).json({ message: 'boxId é obrigatório.' });
    if (!year || !month) return res.status(400).json({ message: 'year e month são obrigatórios.' });

    const alerts = await repo.getAlerts(boxId, year, month);
    return res.json(alerts);
  } catch (error) {
    console.error('Alerts error:', error);
    return res.status(500).json({ message: 'Erro ao buscar alertas.' });
  }
});

// ── Dashboard ──

router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const defaultEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
    const defaultStartDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const defaultStart = `${defaultStartDate.getFullYear()}-${String(defaultStartDate.getMonth() + 1).padStart(2, '0')}-01`;

    const startDate = req.query.startDate || defaultStart;
    const endDate = req.query.endDate || defaultEnd;
    const grouping = req.query.grouping || 'month';

    const boxId = req.query.boxId ? parseInt(req.query.boxId) : null;
    const data = await repo.getDashboardData(startDate, endDate, grouping, boxId);
    return res.json(data);
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ message: 'Erro ao gerar dashboard.' });
  }
});

// ── Recurrences ──

router.get('/recurrences', async (req, res) => {
  try {
    const boxId = parseInt(req.query.boxId);
    if (!boxId) return res.status(400).json({ message: 'boxId é obrigatório.' });
    const recurrences = await repo.getRecurrences(boxId);
    return res.json(recurrences);
  } catch (error) {
    console.error('List recurrences error:', error);
    return res.status(500).json({ message: 'Erro ao listar recorrências.' });
  }
});

router.post('/recurrences', async (req, res) => {
  try {
    const { categoryId, description, type, amount, frequency, dayOfMonth, startDate, endDate, installment, boxId } = req.body;
    if (!categoryId || !description || !type || amount === undefined || !startDate || !boxId) {
      return res.status(400).json({ message: 'Categoria, descrição, tipo, valor, data início e caixa são obrigatórios.' });
    }
    const recurrence = await repo.createRecurrence({
      categoryId, description: description.trim(), type, amount, frequency: frequency || 'monthly',
      dayOfMonth, startDate, endDate, installment, createdBy: req.user.id, boxId
    });
    return res.status(201).json(recurrence);
  } catch (error) {
    console.error('Create recurrence error:', error);
    return res.status(500).json({ message: 'Erro ao criar recorrência.' });
  }
});

router.put('/recurrences/:id', async (req, res) => {
  try {
    const { categoryId, description, type, amount, frequency, dayOfMonth, startDate, endDate, installment, boxId } = req.body;
    const recurrence = await repo.updateRecurrence(req.params.id, {
      categoryId, description: description.trim(), type, amount, frequency,
      dayOfMonth, startDate, endDate, installment, boxId
    });
    if (!recurrence) return res.status(404).json({ message: 'Recorrência não encontrada.' });
    return res.json(recurrence);
  } catch (error) {
    console.error('Update recurrence error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar recorrência.' });
  }
});

router.delete('/recurrences/:id', async (req, res) => {
  try {
    const deleted = await repo.deleteRecurrence(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Recorrência não encontrada.' });
    return res.json({ message: 'Recorrência desativada.' });
  } catch (error) {
    console.error('Delete recurrence error:', error);
    return res.status(500).json({ message: 'Erro ao desativar recorrência.' });
  }
});

router.post('/recurrences/generate', async (req, res) => {
  try {
    const { year, month, boxId } = req.body;
    if (!year || !month || !boxId) return res.status(400).json({ message: 'Ano, mês e caixa são obrigatórios.' });
    const count = await repo.generateRecurrenceEntries(year, month, req.user.id, boxId);
    return res.json({ message: `${count} lançamento(s) gerado(s).`, count });
  } catch (error) {
    console.error('Generate recurrences error:', error);
    return res.status(500).json({ message: 'Erro ao gerar lançamentos.' });
  }
});

// ── Import from Excel ──

const MONTH_MAP = {
  'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
  'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
  'outubro': 10, 'novembro': 11, 'dezembro': 12,
  'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
  'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
};

function parseMonthYear(title) {
  // e.g. "FLUXO DE CAIXA OUTUBRO/2025" or sheet name "Jan26", "Outubro"
  const text = title.toLowerCase().replace(/[^a-záàâãéèêíïóôõúç0-9\/\s]/gi, '').trim();

  // Try "mes/ano" pattern in title
  const slashMatch = text.match(/([a-záàâãéèêíïóôõúç]+)\s*\/\s*(\d{4})/);
  if (slashMatch) {
    const month = MONTH_MAP[slashMatch[1]];
    const year = parseInt(slashMatch[2]);
    if (month && year) return { month, year };
  }

  // Try short format like "Jan26", "Fev26"
  const shortMatch = text.match(/^([a-záàâãéèêíïóôõúç]+)(\d{2,4})$/);
  if (shortMatch) {
    const month = MONTH_MAP[shortMatch[1]];
    let year = parseInt(shortMatch[2]);
    if (year < 100) year += 2000;
    if (month && year) return { month, year };
  }

  // Try just month name (assume current year)
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    if (text.includes(name)) {
      return { month: num, year: getSaoPauloYear() };
    }
  }

  return null;
}

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel epoch: 1899-12-30
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + serial * 86400000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Import Duplicate Check ──
router.get('/import/check', async (req, res) => {
  try {
    const boxId = parseInt(req.query.boxId);
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);

    if (!boxId || !year || !month) {
      return res.status(400).json({
        message: 'boxId, year e month são obrigatórios.'
      });
    }

    // Get existing entries for this period
    const entries = await repo.getEntries(year, month, boxId);

    if (entries.length === 0) {
      return res.json({ hasEntries: false, count: 0 });
    }

    // Calculate date range of existing entries
    const dates = entries.map(e => new Date(e.date));
    const startDate = new Date(Math.min(...dates));
    const endDate = new Date(Math.max(...dates));

    return res.json({
      hasEntries: true,
      count: entries.length,
      dateRange: {
        start: startDate.toISOString().slice(0, 10),
        end: endDate.toISOString().slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Import check error:', error);
    return res.status(500).json({
      message: 'Erro ao verificar registros existentes.'
    });
  }
});

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo é obrigatório.' });
    }
    const boxId = parseInt(req.body.boxId);
    if (!boxId) {
      return res.status(400).json({ message: 'Caixa é obrigatório.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

    // Load existing categories for mapping
    const existingCategories = await repo.getCategories();
    const categoryMap = {};
    for (const cat of existingCategories) {
      categoryMap[cat.name.toUpperCase().trim()] = cat.id;
    }

    let totalImported = 0;
    let totalSkipped = 0;
    const sheetsProcessed = [];

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws['!ref']) continue;

      const range = xlsx.utils.decode_range(ws['!ref']);

      // Try to get month/year from title row (row 0)
      let monthYear = null;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[xlsx.utils.encode_cell({ r: 0, c })];
        if (cell && cell.v) {
          monthYear = parseMonthYear(String(cell.v));
          if (monthYear) break;
        }
      }

      // Fallback: parse sheet name
      if (!monthYear) {
        monthYear = parseMonthYear(sheetName);
      }

      if (!monthYear) {
        totalSkipped++;
        continue;
      }

      const { year, month } = monthYear;

      // Find SALDO INICIAL (row 2, column G or last column)
      const saldoInicialCell = ws[xlsx.utils.encode_cell({ r: 2, c: 6 })]; // Column G = index 6
      if (saldoInicialCell && typeof saldoInicialCell.v === 'number') {
        await repo.setBalance(year, month, saldoInicialCell.v, boxId);
      }

      // Parse data rows (row 3+)
      let sheetCount = 0;
      for (let r = 3; r <= range.e.r; r++) {
        const statusCell = ws[xlsx.utils.encode_cell({ r, c: 0 })];
        const dateCell = ws[xlsx.utils.encode_cell({ r, c: 1 })];
        const tipoCell = ws[xlsx.utils.encode_cell({ r, c: 2 })];
        const historicoCell = ws[xlsx.utils.encode_cell({ r, c: 3 })];
        const despesaCell = ws[xlsx.utils.encode_cell({ r, c: 4 })];
        const receitaCell = ws[xlsx.utils.encode_cell({ r, c: 5 })];

        // Skip rows without date or description
        if (!dateCell || !historicoCell || !historicoCell.v) continue;

        // Parse date
        let dateStr = null;
        if (typeof dateCell.v === 'number') {
          dateStr = excelDateToISO(dateCell.v);
        } else if (dateCell.v) {
          // Try parsing as date string
          const d = new Date(dateCell.v);
          if (!isNaN(d.getTime())) {
            dateStr = d.toISOString().slice(0, 10);
          }
        }
        if (!dateStr) continue;

        // Determine type and amount
        const despesa = despesaCell && typeof despesaCell.v === 'number' ? despesaCell.v : 0;
        const receita = receitaCell && typeof receitaCell.v === 'number' ? receitaCell.v : 0;

        if (despesa === 0 && receita === 0) continue;

        const type = receita > 0 ? 'income' : 'expense';
        const amount = receita > 0 ? receita : despesa;

        // Map category
        const tipoName = tipoCell && tipoCell.v ? String(tipoCell.v).toUpperCase().trim() : 'OUTROS';
        let categoryId = categoryMap[tipoName];
        if (!categoryId) {
          // Create new category
          const newCat = await repo.createCategory(tipoName);
          categoryId = newCat.id;
          categoryMap[tipoName] = categoryId;
        }

        // Status
        const status = statusCell && String(statusCell.v).toUpperCase().trim() === 'OK' ? 'ok' : 'pending';

        // Description
        const description = String(historicoCell.v).trim();

        await repo.createEntry({
          date: dateStr,
          categoryId,
          description,
          type,
          amount: Math.abs(amount),
          status,
          createdBy: req.user.id,
          boxId
        });

        sheetCount++;
      }

      totalImported += sheetCount;
      sheetsProcessed.push(`${sheetName} (${sheetCount} lançamentos)`);
    }

    return res.json({
      message: `Importação concluída: ${totalImported} lançamento(s) importado(s) de ${sheetsProcessed.length} aba(s).`,
      totalImported,
      sheets: sheetsProcessed
    });
  } catch (error) {
    console.error('Import cashflow error:', error);
    return res.status(500).json({ message: 'Erro ao importar fluxo de caixa.' });
  }
});

// ── Clear All Data (Admin Only) ──

router.delete('/', requireAdmin, async (req, res) => {
  try {
    await repo.clearCashflow();
    return res.json({ message: 'Dados de fluxo de caixa excluídos com sucesso.' });
  } catch (error) {
    console.error('Clear cashflow error:', error);
    return res.status(500).json({ message: 'Erro ao excluir dados de fluxo de caixa.' });
  }
});

module.exports = router;
