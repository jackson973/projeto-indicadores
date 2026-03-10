const express = require('express');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const repo = require('../db/terceirosRepository');
const xlsx = require('xlsx');

const router = express.Router();
router.use(authenticate);

// ── Product Groups ──────────────────────────────────────────────────────────

router.get('/product-groups', async (req, res) => {
  try {
    const groups = await repo.getProductGroups();
    return res.json(groups);
  } catch (error) {
    console.error('Get product groups error:', error);
    return res.status(500).json({ message: 'Erro ao buscar grupos.' });
  }
});

router.post('/product-groups', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Nome do grupo e obrigatorio.' });
    }
    const group = await repo.createProductGroup(name.trim());
    return res.status(201).json(group);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Ja existe um grupo com este nome.' });
    }
    console.error('Create product group error:', error);
    return res.status(500).json({ message: 'Erro ao criar grupo.' });
  }
});

router.put('/product-groups/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Nome do grupo e obrigatorio.' });
    }
    const group = await repo.updateProductGroup(req.params.id, name.trim());
    if (!group) return res.status(404).json({ message: 'Grupo nao encontrado.' });
    return res.json(group);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Ja existe um grupo com este nome.' });
    }
    console.error('Update product group error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar grupo.' });
  }
});

router.delete('/product-groups/:id', async (req, res) => {
  try {
    const result = await repo.deleteProductGroup(req.params.id);
    if (result.inUse) {
      return res.status(400).json({
        message: `Grupo em uso por ${result.count} tabela(s) de preco. Remova as associacoes primeiro.`
      });
    }
    if (!result.deleted) return res.status(404).json({ message: 'Grupo nao encontrado.' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete product group error:', error);
    return res.status(500).json({ message: 'Erro ao excluir grupo.' });
  }
});

router.get('/product-groups/:id/products', async (req, res) => {
  try {
    const products = await repo.getGroupProducts(req.params.id);
    return res.json(products);
  } catch (error) {
    console.error('Get group products error:', error);
    return res.status(500).json({ message: 'Erro ao buscar produtos do grupo.' });
  }
});

router.post('/product-groups/:id/products', async (req, res) => {
  try {
    const { productCode, productName } = req.body;
    if (!productCode) {
      return res.status(400).json({ message: 'Codigo do produto e obrigatorio.' });
    }
    const product = await repo.addProductToGroup(req.params.id, productCode, productName || '');
    return res.status(201).json(product);
  } catch (error) {
    console.error('Add product to group error:', error);
    return res.status(500).json({ message: 'Erro ao adicionar produto ao grupo.' });
  }
});

router.post('/product-groups/:id/products/batch', async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: 'Lista de produtos e obrigatoria.' });
    }
    const results = await repo.addProductsToGroupBatch(req.params.id, products);
    return res.status(201).json(results);
  } catch (error) {
    console.error('Batch add products error:', error);
    return res.status(500).json({ message: 'Erro ao adicionar produtos ao grupo.' });
  }
});

router.delete('/product-groups/:groupId/products/batch', async (req, res) => {
  try {
    const { productCodes } = req.body;
    if (!Array.isArray(productCodes) || productCodes.length === 0) {
      return res.status(400).json({ message: 'Lista de codigos e obrigatoria.' });
    }
    const count = await repo.removeProductsFromGroupBatch(req.params.groupId, productCodes);
    return res.json({ success: true, removed: count });
  } catch (error) {
    console.error('Batch remove products error:', error);
    return res.status(500).json({ message: 'Erro ao remover produtos do grupo.' });
  }
});

router.delete('/product-groups/:groupId/products/:productCode', async (req, res) => {
  try {
    const deleted = await repo.removeProductFromGroup(req.params.groupId, decodeURIComponent(req.params.productCode));
    if (!deleted) return res.status(404).json({ message: 'Produto nao encontrado no grupo.' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Remove product from group error:', error);
    return res.status(500).json({ message: 'Erro ao remover produto do grupo.' });
  }
});

// ── Etapas ──────────────────────────────────────────────────────────────────

router.get('/etapas', async (req, res) => {
  try {
    const { codcli } = req.query;
    const etapas = await repo.getEtapas(codcli || null);
    return res.json(etapas);
  } catch (error) {
    console.error('Get etapas error:', error);
    return res.status(500).json({ message: 'Erro ao buscar etapas.' });
  }
});

// ── Supplier Prices ─────────────────────────────────────────────────────────

router.get('/supplier-prices', async (req, res) => {
  try {
    const { codcli, groupId } = req.query;
    const prices = await repo.getSupplierPrices({ codcli, groupId });
    return res.json(prices);
  } catch (error) {
    console.error('Get supplier prices error:', error);
    return res.status(500).json({ message: 'Erro ao buscar precos.' });
  }
});

router.post('/supplier-prices', async (req, res) => {
  try {
    const { codcli, supplierName, groupId, part, etapa, tamanho, price, validFrom, validUntil } = req.body;
    if (!codcli || !groupId || price == null) {
      return res.status(400).json({ message: 'Fornecedor, grupo e preco sao obrigatorios.' });
    }
    if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
      return res.status(400).json({ message: 'Data inicial deve ser anterior a data final.' });
    }
    const result = await repo.createSupplierPrice({
      codcli, supplierName, groupId, part: part || null, etapa: etapa || null,
      tamanho: tamanho || null, price, validFrom: validFrom || null, validUntil: validUntil || null
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error.message.includes('Sobreposicao')) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Create supplier price error:', error);
    return res.status(500).json({ message: 'Erro ao criar preco.' });
  }
});

router.post('/supplier-prices/batch', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Lista de precos e obrigatoria.' });
    }
    const results = [];
    const errors = [];
    for (const item of items) {
      try {
        const result = await repo.createSupplierPrice({
          codcli: item.codcli,
          supplierName: item.supplierName || '',
          groupId: item.groupId,
          part: item.part || null,
          etapa: item.etapa || null,
          tamanho: item.tamanho || null,
          price: item.price,
          validFrom: item.validFrom || null,
          validUntil: item.validUntil || null
        });
        results.push(result);
      } catch (err) {
        errors.push({ part: item.part || 'Todas', error: err.message });
      }
    }
    return res.status(201).json({ created: results, errors });
  } catch (error) {
    console.error('Batch create supplier prices error:', error);
    return res.status(500).json({ message: 'Erro ao criar precos em lote.' });
  }
});

router.put('/supplier-prices/:id', async (req, res) => {
  try {
    const { codcli, supplierName, groupId, part, etapa, tamanho, price, validFrom, validUntil } = req.body;
    if (!codcli || !groupId || price == null) {
      return res.status(400).json({ message: 'Fornecedor, grupo e preco sao obrigatorios.' });
    }
    if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
      return res.status(400).json({ message: 'Data inicial deve ser anterior a data final.' });
    }
    const result = await repo.updateSupplierPrice(req.params.id, {
      codcli, supplierName, groupId, part: part || null, etapa: etapa || null,
      tamanho: tamanho || null, price, validFrom: validFrom || null, validUntil: validUntil || null
    });
    if (!result) return res.status(404).json({ message: 'Preco nao encontrado.' });
    return res.json(result);
  } catch (error) {
    if (error.message.includes('Sobreposicao')) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Update supplier price error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar preco.' });
  }
});

router.delete('/supplier-prices/:id', async (req, res) => {
  try {
    const deleted = await repo.deleteSupplierPrice(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Preco nao encontrado.' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete supplier price error:', error);
    return res.status(500).json({ message: 'Erro ao excluir preco.' });
  }
});

// ── Supplier Prices Export ────────────────────────────────────────────────────

const formatPriceCur = (v) => {
  const num = parseFloat(v) || 0;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};

const formatDateBR = (val) => {
  if (!val || val === 'null') return '-';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '-';
    return val.toLocaleDateString('pt-BR');
  }
  const str = String(val).slice(0, 10);
  if (str.length < 10) return '-';
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
};

const vigenciaLabel = (vFrom, vUntil) => {
  const from = formatDateBR(vFrom);
  const until = formatDateBR(vUntil);
  if (from === '-' && until === '-') return 'Sem vigencia';
  if (from === '-') return `Ate ${until}`;
  if (until === '-') return `A partir de ${from}`;
  return `${from} a ${until}`;
};

router.get('/supplier-prices/export/excel', async (req, res) => {
  try {
    const { codcli } = req.query;
    if (!codcli) return res.status(400).json({ message: 'Fornecedor obrigatorio.' });

    const prices = await repo.getSupplierPrices({ codcli });
    if (prices.length === 0) return res.status(404).json({ message: 'Nenhum preco encontrado.' });

    const supplierName = prices[0].supplierName || codcli;

    const rows = prices.map(p => ({
      'Grupo': p.groupName || '',
      'Parte': p.part ? `${p.part}${p.partName ? ' - ' + p.partName : ''}` : 'Todas',
      'Preco (R$)': parseFloat(p.price) || 0,
      'Vigencia De': formatDateBR(p.validFrom),
      'Vigencia Ate': formatDateBR(p.validUntil),
    }));

    const ws = xlsx.utils.json_to_sheet(rows);
    // Set column widths
    ws['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Precos');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `precos_${supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Export supplier prices excel error:', error);
    return res.status(500).json({ message: 'Erro ao exportar Excel.' });
  }
});

router.get('/supplier-prices/export/pdf', async (req, res) => {
  try {
    const { codcli } = req.query;
    if (!codcli) return res.status(400).json({ message: 'Fornecedor obrigatorio.' });

    const prices = await repo.getSupplierPrices({ codcli });
    if (prices.length === 0) return res.status(404).json({ message: 'Nenhum preco encontrado.' });

    const supplierName = prices[0].supplierName || codcli;

    // Get system settings for logo
    const db = require('../db/connection');
    const settingsResult = await db.query('SELECT logo_path, company_name FROM system_settings WHERE id = 1');
    const sysSettings = settingsResult.rows[0] || {};

    let logoHtml = '';
    if (sysSettings.logo_path) {
      const logoFullPath = require('path').resolve(__dirname, '../../uploads', sysSettings.logo_path);
      if (fs.existsSync(logoFullPath)) {
        const logoBuffer = fs.readFileSync(logoFullPath);
        const ext = require('path').extname(sysSettings.logo_path).toLowerCase();
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
        const mime = mimeMap[ext] || 'image/png';
        logoHtml = `<img src="data:${mime};base64,${logoBuffer.toString('base64')}" style="max-height:60px;max-width:200px;" />`;
      }
    }
    const companyName = sysSettings.company_name || '';

    // Check which prices are currently active
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v;
      const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
      return isNaN(d.getTime()) ? null : d;
    };
    const isActive = (vFrom, vUntil) => {
      const from = toDate(vFrom);
      const until = toDate(vUntil);
      const fromOk = !from || from <= today;
      const untilOk = !until || until >= today;
      return fromOk && untilOk;
    };

    // Group by groupName for better organization
    const byGroup = new Map();
    for (const p of prices) {
      const gName = p.groupName || 'Sem grupo';
      if (!byGroup.has(gName)) byGroup.set(gName, []);
      byGroup.get(gName).push(p);
    }

    let rowsHtml = '';
    let currentGroup = '';
    for (const [groupName, items] of byGroup) {
      rowsHtml += `<tr class="group-header"><td colspan="4" style="background:#edf2f7;font-weight:bold;font-size:11px;padding:6px 8px;">${groupName}</td></tr>`;
      for (const p of items) {
        const active = isActive(p.validFrom, p.validUntil);
        const partLabel = p.part ? `${p.part}${p.partName ? ' - ' + p.partName : ''}` : 'Todas';
        rowsHtml += `<tr>
          <td style="padding-left:20px;">${partLabel}</td>
          <td class="right">R$ ${formatPriceCur(p.price)}</td>
          <td>${vigenciaLabel(p.validFrom, p.validUntil)}</td>
          <td class="center">${active ? '<span style="color:#38a169;font-weight:bold;">Vigente</span>' : '<span style="color:#999;">Expirado</span>'}</td>
        </tr>`;
      }
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #333; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .header-left { display: flex; align-items: center; gap: 15px; }
  .title { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 15px; }
  .supplier-info { margin-bottom: 15px; background: #f9f9f9; padding: 10px; border-radius: 4px; }
  .supplier-info p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #2d3748; color: #fff; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; font-size: 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even):not(.group-header) td { background: #f7fafc; }
  .center { text-align: center; }
  .right { text-align: right; }
  .footer { margin-top: 20px; font-size: 9px; color: #666; text-align: center; }
</style></head><body>
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div><strong>${companyName}</strong></div>
    </div>
    <div style="text-align:right;font-size:9px;color:#666;">
      ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
    </div>
  </div>
  <div class="title">Precos por Fornecedor</div>
  <div class="supplier-info">
    <p><strong>Fornecedor:</strong> ${codcli} - ${supplierName}</p>
    <p><strong>Total de precos:</strong> ${prices.length}</p>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left;">Parte</th>
      <th style="text-align:right;">Preco (R$)</th>
      <th style="text-align:left;">Vigencia</th>
      <th style="text-align:center;">Status</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</div>
</body></html>`;

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
    await browser.close();

    const filename = `precos_${supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(Buffer.from(pdf));
  } catch (error) {
    console.error('Export supplier prices PDF error:', error);
    return res.status(500).json({ message: 'Erro ao exportar PDF.' });
  }
});

// ── OFs ─────────────────────────────────────────────────────────────────────

router.get('/ofs', async (req, res) => {
  try {
    const { codcli, month, year, dateFrom, dateTo, facNumero, unsettledOnly, limit, offset } = req.query;
    const result = await repo.getOfs({
      codcli, month: month ? parseInt(month) : null,
      year: year ? parseInt(year) : null,
      dateFrom: dateFrom || null, dateTo: dateTo || null,
      facNumero, unsettledOnly,
      limit: limit ? parseInt(limit) : null,
      offset: offset ? parseInt(offset) : 0
    });
    return res.json(result);
  } catch (error) {
    console.error('Get OFs error:', error);
    return res.status(500).json({ message: 'Erro ao buscar OFs.' });
  }
});

router.get('/ofs/suppliers', async (req, res) => {
  try {
    const suppliers = await repo.getDistinctSuppliers();
    return res.json(suppliers);
  } catch (error) {
    console.error('Get suppliers error:', error);
    return res.status(500).json({ message: 'Erro ao buscar fornecedores.' });
  }
});

router.get('/ofs/sizes', async (req, res) => {
  try {
    const { codcli, groupId } = req.query;
    const sizes = await repo.getDistinctSizes(codcli || null, groupId ? parseInt(groupId) : null);
    return res.json(sizes);
  } catch (error) {
    console.error('Get sizes error:', error);
    return res.status(500).json({ message: 'Erro ao buscar tamanhos.' });
  }
});

router.get('/ofs/products', async (req, res) => {
  try {
    const products = await repo.getDistinctProducts();
    return res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    return res.status(500).json({ message: 'Erro ao buscar produtos.' });
  }
});

router.get('/ofs/parts', async (req, res) => {
  try {
    const { codcli, groupId } = req.query;
    console.log('[Parts] Filtros recebidos:', { codcli, groupId });
    const parts = await repo.getDistinctParts({ codcli, groupId: groupId ? parseInt(groupId) : null });
    console.log('[Parts] Resultado:', parts.length, 'partes encontradas');
    return res.json(parts);
  } catch (error) {
    console.error('Get parts error:', error);
    return res.status(500).json({ message: 'Erro ao buscar partes.' });
  }
});

// ── Settlements ─────────────────────────────────────────────────────────────

router.get('/settlements', async (req, res) => {
  try {
    const { codcli, month, year, status } = req.query;
    const settlements = await repo.getSettlements({
      codcli, month: month ? parseInt(month) : null,
      year: year ? parseInt(year) : null, status
    });
    return res.json(settlements);
  } catch (error) {
    console.error('Get settlements error:', error);
    return res.status(500).json({ message: 'Erro ao buscar fechamentos.' });
  }
});

router.get('/settlements/drafts/:id', async (req, res) => {
  try {
    const draft = await repo.getDraft(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Rascunho não encontrado.' });
    return res.json(draft);
  } catch (error) {
    console.error('Get draft error:', error);
    return res.status(500).json({ message: 'Erro ao buscar rascunho.' });
  }
});

router.get('/settlements/:id', async (req, res) => {
  try {
    const settlement = await repo.getSettlement(req.params.id);
    if (!settlement) return res.status(404).json({ message: 'Fechamento nao encontrado.' });
    return res.json(settlement);
  } catch (error) {
    console.error('Get settlement error:', error);
    return res.status(500).json({ message: 'Erro ao buscar fechamento.' });
  }
});

router.post('/settlements', async (req, res) => {
  try {
    const { codcli, supplierName, referenceMonth, referenceYear, notes, items, discounts, draftId } = req.body;
    if (!codcli || !referenceMonth || !referenceYear || !items || items.length === 0) {
      return res.status(400).json({ message: 'Fornecedor, mes/ano e itens sao obrigatorios.' });
    }

    // If promoting from a draft, use promoteDraft
    if (draftId) {
      const result = await repo.promoteDraft(draftId, { items, discounts });
      return res.status(201).json(result);
    }

    const result = await repo.createSettlement({
      codcli, supplierName, referenceMonth, referenceYear,
      notes, createdBy: req.user.id, items, discounts
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error('Create settlement error:', error);
    return res.status(500).json({ message: 'Erro ao criar fechamento.' });
  }
});

// ── Drafts ────────────────────────────────────────────────────────────────
router.post('/settlements/drafts', async (req, res) => {
  try {
    const { codcli, supplierName, referenceMonth, referenceYear, notes, draftData } = req.body;
    if (!codcli) {
      return res.status(400).json({ message: 'Fornecedor é obrigatório.' });
    }
    const result = await repo.saveDraft({
      codcli, supplierName, referenceMonth, referenceYear,
      notes, createdBy: req.user.id, draftData
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error('Create draft error:', error);
    return res.status(500).json({ message: 'Erro ao salvar rascunho.' });
  }
});

router.put('/settlements/drafts/:id', async (req, res) => {
  try {
    const { codcli, supplierName, referenceMonth, referenceYear, notes, draftData } = req.body;
    const result = await repo.saveDraft({
      id: req.params.id, codcli, supplierName, referenceMonth, referenceYear,
      notes, draftData
    });
    return res.json(result);
  } catch (error) {
    console.error('Update draft error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar rascunho.' });
  }
});

router.put('/settlements/:id/pay', async (req, res) => {
  try {
    const result = await repo.markSettlementPaid(req.params.id);
    if (!result) return res.status(404).json({ message: 'Fechamento nao encontrado.' });
    return res.json(result);
  } catch (error) {
    console.error('Pay settlement error:', error);
    return res.status(500).json({ message: 'Erro ao marcar como pago.' });
  }
});

router.put('/settlements/:id/unpay', async (req, res) => {
  try {
    const result = await repo.markSettlementUnpaid(req.params.id);
    if (!result) return res.status(404).json({ message: 'Fechamento nao encontrado.' });
    return res.json(result);
  } catch (error) {
    console.error('Unpay settlement error:', error);
    return res.status(500).json({ message: 'Erro ao desmarcar pagamento.' });
  }
});

router.put('/settlements/:id', async (req, res) => {
  try {
    const { notes, referenceMonth, referenceYear } = req.body;
    const result = await repo.updateSettlement(req.params.id, { notes, referenceMonth, referenceYear });
    if (!result) return res.status(404).json({ message: 'Fechamento nao encontrado.' });
    return res.json(result);
  } catch (error) {
    console.error('Update settlement error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar fechamento.' });
  }
});

router.put('/settlements/:id/items/:itemId', async (req, res) => {
  try {
    const { quantity, unitPrice } = req.body;
    if (quantity == null && unitPrice == null) {
      return res.status(400).json({ message: 'Informe quantity ou unitPrice.' });
    }
    const result = await repo.updateSettlementItem(req.params.id, req.params.itemId, { quantity, unitPrice });
    if (!result) return res.status(404).json({ message: 'Item nao encontrado.' });
    return res.json(result);
  } catch (error) {
    console.error('Update settlement item error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar item.' });
  }
});

router.delete('/settlements/:id/items/:itemId', async (req, res) => {
  try {
    const result = await repo.removeSettlementItem(req.params.id, req.params.itemId);
    if (!result) return res.status(404).json({ message: 'Item nao encontrado.' });
    return res.json(result);
  } catch (error) {
    console.error('Remove settlement item error:', error);
    return res.status(500).json({ message: 'Erro ao remover item.' });
  }
});

router.post('/settlements/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !items.length) return res.status(400).json({ message: 'Nenhum item informado.' });
    const result = await repo.addSettlementItems(req.params.id, items);
    return res.json(result);
  } catch (error) {
    console.error('Add settlement items error:', error);
    return res.status(500).json({ message: 'Erro ao adicionar itens.' });
  }
});

router.delete('/settlements/:id', async (req, res) => {
  try {
    await repo.deleteSettlement(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete settlement error:', error);
    return res.status(500).json({ message: 'Erro ao excluir fechamento.' });
  }
});

// ── Exports ─────────────────────────────────────────────────────────────────

router.get('/settlements/:id/export/excel', async (req, res) => {
  try {
    const data = await repo.getSettlementExportData(req.params.id);
    if (!data) return res.status(404).json({ message: 'Fechamento nao encontrado.' });

    // Group items by OF + Parte
    const ofGroups = new Map();
    for (const item of data.items) {
      const key = `${item.facNumero}|${item.facParte || ''}`;
      if (!ofGroups.has(key)) {
        ofGroups.set(key, {
          ofNum: item.facNumero,
          desc: item.facDescProduto || item.facCodigoProduto || '',
          parte: item.facDescparte || item.facParte || '',
          unitPrice: parseFloat(item.unitPrice) || 0,
          totalQty: 0, total: 0
        });
      }
      const g = ofGroups.get(key);
      g.totalQty += parseFloat(item.quantity) || 0;
      g.total += parseFloat(item.totalPrice) || 0;
    }

    const ofGroupsArr = [...ofGroups.values()];
    const rows = ofGroupsArr.map(g => ({
      'OF': g.ofNum,
      'Descricao': g.desc,
      'Parte': g.parte,
      'Quantidade': g.totalQty,
      'Preco Unit.': g.unitPrice,
      'Total': g.total,
    }));

    rows.push({
      'OF': '', 'Descricao': 'SUBTOTAL', 'Parte': '',
      'Quantidade': '', 'Preco Unit.': '',
      'Total': parseFloat(data.totalAmount) || 0
    });

    // Add discounts
    const discounts = data.discounts || [];
    if (discounts.length > 0) {
      for (const disc of discounts) {
        rows.push({
          'OF': '', 'Descricao': `Desconto: ${disc.description}`, 'Parte': '',
          'Quantidade': '', 'Preco Unit.': '',
          'Total': -(parseFloat(disc.amount) || 0)
        });
      }
      rows.push({
        'OF': '', 'Descricao': 'TOTAL A PAGAR', 'Parte': '',
        'Quantidade': '', 'Preco Unit.': '',
        'Total': parseFloat(data.totalPayable) || 0
      });
    }

    rows.push({
      'OF': '', 'Descricao': `Numero de OFs: ${ofGroupsArr.length}`, 'Parte': '',
      'Quantidade': '', 'Preco Unit.': '', 'Total': ''
    });

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Fechamento');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `fechamento_${data.supplierName || data.codcli}_${data.referenceMonth}_${data.referenceYear}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    console.error('Export excel error:', error);
    return res.status(500).json({ message: 'Erro ao exportar Excel.' });
  }
});

router.get('/settlements/:id/export/pdf', async (req, res) => {
  try {
    const data = await repo.getSettlementExportData(req.params.id);
    if (!data) return res.status(404).json({ message: 'Fechamento nao encontrado.' });

    // Get system settings for logo
    const db = require('../db/connection');
    const settingsResult = await db.query('SELECT logo_path, company_name FROM system_settings WHERE id = 1');
    const sysSettings = settingsResult.rows[0] || {};

    let logoHtml = '';
    if (sysSettings.logo_path) {
      const logoFullPath = require('path').resolve(__dirname, '../../uploads', sysSettings.logo_path);
      if (fs.existsSync(logoFullPath)) {
        const logoBuffer = fs.readFileSync(logoFullPath);
        const ext = require('path').extname(sysSettings.logo_path).toLowerCase();
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
        const mime = mimeMap[ext] || 'image/png';
        const b64 = logoBuffer.toString('base64');
        logoHtml = `<img src="data:${mime};base64,${b64}" style="max-height:60px;max-width:200px;" />`;
      }
    }
    const companyName = sysSettings.company_name || '';

    const supplier = data.supplier || {};
    const monthNames = ['', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    // Group items by OF + Parte
    const pdfOfGroups = new Map();
    for (const item of data.items) {
      const key = `${item.facNumero}|${item.facParte || ''}`;
      if (!pdfOfGroups.has(key)) {
        pdfOfGroups.set(key, {
          ofNum: item.facNumero,
          desc: item.facDescProduto || item.facCodigoProduto || '',
          parte: item.facDescparte || item.facParte || '',
          unitPrice: parseFloat(item.unitPrice) || 0,
          totalQty: 0, total: 0
        });
      }
      const g = pdfOfGroups.get(key);
      g.totalQty += parseFloat(item.quantity) || 0;
      g.total += parseFloat(item.totalPrice) || 0;
    }

    // Build table rows
    let grandTotal = 0;
    let grandQty = 0;
    const rowsHtml = [...pdfOfGroups.values()].map((g) => {
      grandTotal += g.total;
      grandQty += g.totalQty;

      return `<tr>
        <td class="center">${g.ofNum || ''}</td>
        <td>${g.desc}</td>
        <td class="center">${g.parte}</td>
        <td class="center">${formatNum(g.totalQty)}</td>
        <td class="right">R$ ${formatPriceCur(g.unitPrice)}</td>
        <td class="right">R$ ${formatCur(g.total)}</td>
      </tr>`;
    }).join('');

    const totalDiscounts = (data.discounts || []).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    const totalPayable = parseFloat(data.totalPayable) || (grandTotal - totalDiscounts);
    const hasDiscounts = (data.discounts || []).length > 0;

    const discountRowsHtml = hasDiscounts ? data.discounts.map(d =>
      `<tr class="discount-row">
        <td colspan="5" class="right">${d.description}</td>
        <td class="right discount-val">- R$ ${formatCur(d.amount)}</td>
      </tr>`
    ).join('') : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #333; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .header-left { display: flex; align-items: center; gap: 15px; }
  .supplier-info { margin-bottom: 15px; background: #f9f9f9; padding: 10px; border-radius: 4px; }
  .supplier-info p { margin: 2px 0; }
  .supplier-info strong { min-width: 100px; display: inline-block; }
  .title { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 15px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  th { background: #2d3748; color: #fff; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; font-size: 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f7fafc; }
  .center { text-align: center; }
  .right { text-align: right; }
  .total-row td { border-top: 2px solid #333; font-weight: bold; font-size: 11px; background: #f0f4ff !important; }
  .discount-row td { font-size: 10px; border-bottom: 1px dashed #ccc; }
  .discount-val { color: #e53e3e; font-weight: bold; }
  .payable-row td { border-top: 2px solid #333; font-weight: bold; font-size: 13px; background: #fefcbf !important; }
  .status { margin-top: 12px; padding: 8px; border-radius: 4px; text-align: center; font-weight: bold; font-size: 12px; }
  .status-paid { background: #d4edda; color: #155724; }
  .status-open { background: #fff3cd; color: #856404; }
  .footer { margin-top: 20px; font-size: 9px; color: #666; text-align: center; }
</style></head><body>
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div><strong>${companyName}</strong></div>
    </div>
    <div style="text-align:right;font-size:9px;color:#666;">
      ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
    </div>
  </div>

  <div class="title">Fechamento ${data.supplierName || ''} - ${monthNames[data.referenceMonth]}/${data.referenceYear}</div>

  <div class="supplier-info">
    <p><strong>Fornecedor:</strong> ${data.codcli} - ${data.supplierName || ''}</p>
    ${supplier.cliente_fantasia ? `<p><strong>Fantasia:</strong> ${supplier.cliente_fantasia}</p>` : ''}
    ${supplier.cliente_cnpj ? `<p><strong>CNPJ:</strong> ${supplier.cliente_cnpj}</p>` : ''}
    ${supplier.cliente_endereco ? `<p><strong>Endereco:</strong> ${supplier.cliente_endereco}${supplier.num_end ? ', ' + supplier.num_end : ''} - ${supplier.cliente_bairro || ''} - ${supplier.cliente_cidade || ''}/${supplier.cliente_uf || ''} - CEP: ${supplier.cliente_cep || ''}</p>` : ''}
    ${supplier.ddd_fone ? `<p><strong>Telefone:</strong> (${supplier.ddd_fone}) ${supplier.cliente_fone || ''}</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>OF</th>
        <th style="text-align:left;">Descricao</th>
        <th>Parte</th>
        <th>Quant.</th>
        <th>Preco Unit.</th>
        <th>Total (R$)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="3" class="right">Total de pecas</td>
        <td class="center">${formatNum(grandQty)}</td>
        <td></td>
        <td class="right">${hasDiscounts ? 'SUBTOTAL' : 'TOTAL'} R$ ${formatCur(grandTotal)}</td>
      </tr>
      ${discountRowsHtml}
      ${hasDiscounts ? `<tr class="payable-row">
        <td colspan="5" class="right">Total a pagar</td>
        <td class="right">R$ ${formatCur(totalPayable)}</td>
      </tr>` : ''}
      <tr class="of-count-row">
        <td colspan="6" style="text-align:right; font-size:10px; color:#555; padding-top:6px; border-top: 1px solid #ccc;">
          Numero de OFs: <strong>${pdfOfGroups.size}</strong>
        </td>
      </tr>
    </tbody>
  </table>

  <div class="status ${data.status === 'paid' ? 'status-paid' : 'status-open'}">
    ${data.status === 'paid' ? 'PAGO' : 'EM ABERTO'}
    ${data.paidAt ? ' em ' + new Date(data.paidAt).toLocaleDateString('pt-BR') : ''}
  </div>

  <div class="footer">Gerado pelo sistema Indicadores</div>
</body></html>`;

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
    await browser.close();

    const m = String(data.referenceMonth || 1).padStart(2, '0');
    const filename = `fechamento_${m}_${data.referenceYear}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(Buffer.from(pdf));
  } catch (error) {
    console.error('Export PDF error:', error);
    return res.status(500).json({ message: 'Erro ao exportar PDF.' });
  }
});

// ── Settlement Discounts ──────────────────────────────────────────────────

router.post('/settlements/:id/discounts', async (req, res) => {
  try {
    const { description, amount } = req.body;
    if (!description || !amount) {
      return res.status(400).json({ message: 'Descricao e valor sao obrigatorios.' });
    }
    const result = await repo.addSettlementDiscount(req.params.id, description, parseFloat(amount));
    return res.json(result);
  } catch (error) {
    console.error('Add discount error:', error);
    return res.status(500).json({ message: 'Erro ao adicionar desconto.' });
  }
});

router.put('/settlements/:id/discounts/:discountId', async (req, res) => {
  try {
    const { description, amount } = req.body;
    if (!description || !amount) {
      return res.status(400).json({ message: 'Descricao e valor sao obrigatorios.' });
    }
    const result = await repo.updateSettlementDiscount(req.params.discountId, description, parseFloat(amount));
    if (!result) return res.status(404).json({ message: 'Desconto nao encontrado.' });
    return res.json(result);
  } catch (error) {
    console.error('Update discount error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar desconto.' });
  }
});

router.delete('/settlements/:id/discounts/:discountId', async (req, res) => {
  try {
    const result = await repo.removeSettlementDiscount(req.params.discountId);
    if (!result) return res.status(404).json({ message: 'Desconto nao encontrado.' });
    return res.json(result);
  } catch (error) {
    console.error('Remove discount error:', error);
    return res.status(500).json({ message: 'Erro ao remover desconto.' });
  }
});

// Price lookup for settlement creation
router.post('/find-prices', async (req, res) => {
  try {
    const { codcli, items } = req.body;
    if (!codcli || !items) {
      return res.status(400).json({ message: 'Fornecedor e itens sao obrigatorios.' });
    }

    const results = [];
    for (const item of items) {
      const priceInfo = await repo.findPrice(codcli, item.productCode, item.parte, item.date || new Date().toISOString().slice(0, 10), item.etapa || null, item.tamanho || null);
      results.push({
        productCode: item.productCode,
        parte: item.parte,
        cor: item.cor,
        ...priceInfo
      });
    }
    return res.json(results);
  } catch (error) {
    console.error('Find prices error:', error);
    return res.status(500).json({ message: 'Erro ao buscar precos.' });
  }
});

// ── Rastreio de OF ──────────────────────────────────────────────────────────

router.get('/rastreio-of/:ofNumero', async (req, res) => {
  try {
    const { ofNumero } = req.params;
    const data = await repo.getOFRastreio(ofNumero.trim());
    return res.json(data);
  } catch (error) {
    console.error('Rastreio OF error:', error);
    return res.status(500).json({ message: 'Erro ao buscar rastreio da OF.' });
  }
});

function formatNum(val) {
  const n = parseFloat(val) || 0;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCur(val) {
  const n = parseFloat(val) || 0;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = router;
