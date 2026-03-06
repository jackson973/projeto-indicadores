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
    const { codcli, supplierName, groupId, part, price, validFrom, validUntil } = req.body;
    if (!codcli || !groupId || price == null) {
      return res.status(400).json({ message: 'Fornecedor, grupo e preco sao obrigatorios.' });
    }
    if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
      return res.status(400).json({ message: 'Data inicial deve ser anterior a data final.' });
    }
    const result = await repo.createSupplierPrice({
      codcli, supplierName, groupId, part: part || null, price,
      validFrom: validFrom || null, validUntil: validUntil || null
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

router.put('/supplier-prices/:id', async (req, res) => {
  try {
    const { codcli, supplierName, groupId, part, price, validFrom, validUntil } = req.body;
    if (!codcli || !groupId || price == null) {
      return res.status(400).json({ message: 'Fornecedor, grupo e preco sao obrigatorios.' });
    }
    if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
      return res.status(400).json({ message: 'Data inicial deve ser anterior a data final.' });
    }
    const result = await repo.updateSupplierPrice(req.params.id, {
      codcli, supplierName, groupId, part: part || null, price,
      validFrom: validFrom || null, validUntil: validUntil || null
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
    const { codcli, supplierName, referenceMonth, referenceYear, notes, items } = req.body;
    if (!codcli || !referenceMonth || !referenceYear || !items || items.length === 0) {
      return res.status(400).json({ message: 'Fornecedor, mes/ano e itens sao obrigatorios.' });
    }
    const result = await repo.createSettlement({
      codcli, supplierName, referenceMonth, referenceYear,
      notes, createdBy: req.user.id, items
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error('Create settlement error:', error);
    return res.status(500).json({ message: 'Erro ao criar fechamento.' });
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
    const { notes } = req.body;
    const result = await repo.updateSettlementNotes(req.params.id, notes);
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

    const rows = data.items.map(item => ({
      'OF': item.facNumero,
      'Produto': item.facCodigoProduto,
      'Descricao': item.facDescProduto,
      'Cor': item.facDesccor || item.facCor,
      'Parte': item.facDescparte || item.facParte,
      'Tamanho': item.facTam,
      'Qtd Original': parseFloat(item.facQtOrig) || 0,
      'Qtd Validada': parseFloat(item.quantity) || 0,
      'Preco Unit': parseFloat(item.unitPrice) || 0,
      'Total': parseFloat(item.totalPrice) || 0,
    }));

    rows.push({
      'OF': '', 'Produto': '', 'Descricao': '', 'Cor': '', 'Parte': '',
      'Tamanho': '', 'Qtd Original': '', 'Qtd Validada': 'SUBTOTAL',
      'Preco Unit': '',
      'Total': parseFloat(data.totalAmount) || 0
    });

    // Add discounts
    const discounts = data.discounts || [];
    if (discounts.length > 0) {
      for (const disc of discounts) {
        rows.push({
          'OF': '', 'Produto': '', 'Descricao': '', 'Cor': '', 'Parte': '',
          'Tamanho': '', 'Qtd Original': '', 'Qtd Validada': `Desconto: ${disc.description}`,
          'Preco Unit': '',
          'Total': -(parseFloat(disc.amount) || 0)
        });
      }
      rows.push({
        'OF': '', 'Produto': '', 'Descricao': '', 'Cor': '', 'Parte': '',
        'Tamanho': '', 'Qtd Original': '', 'Qtd Validada': 'TOTAL A PAGAR',
        'Preco Unit': '',
        'Total': parseFloat(data.totalPayable) || 0
      });
    }

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

    // Group items by OF/Product/Color/Part (same logic as frontend)
    const SIZE_ORDER = ['pre', 'rn', 'p', 'm', 'g', 'gg', '1', '2', '3', '4', '6', '8', '10', '12', '14', '16'];
    const sortSizes = (sizes) => [...sizes].sort((a, b) => {
      const ta = String(a.tam || '').trim().toLowerCase();
      const tb = String(b.tam || '').trim().toLowerCase();
      const ia = SIZE_ORDER.indexOf(ta);
      const ib = SIZE_ORDER.indexOf(tb);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      const na = parseFloat(ta), nb = parseFloat(tb);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return ta.localeCompare(tb);
    });

    const groups = [];
    const groupMap = new Map();
    for (const item of data.items) {
      const key = `${item.facNumero}|${item.facCodsetor || ''}|${item.facCodigoProduto}|${item.facCor}|${item.facParte}`;
      if (!groupMap.has(key)) {
        const g = {
          key, facNumero: item.facNumero,
          facCodsetor: item.facCodsetor, facDescsetor: item.facDescsetor,
          facCodigoProduto: item.facCodigoProduto, facDescProduto: item.facDescProduto,
          facCor: item.facCor, facDesccor: item.facDesccor,
          facParte: item.facParte, facDescparte: item.facDescparte,
          unitPrice: item.unitPrice, sizes: []
        };
        groupMap.set(key, g);
        groups.push(g);
      }
      groupMap.get(key).sizes.push({
        tam: item.facTam, qty: parseFloat(item.quantity) || 0,
        total: parseFloat(item.totalPrice) || 0, missing: false
      });
    }
    // Add missing OFs
    const missingOfs = data.missingOfs || [];
    for (const mof of missingOfs) {
      const key = `${mof.facNumero}|${mof.facCodsetor || ''}|${mof.facCodigoProduto}|${mof.facCor}|${mof.facParte}`;
      const g = groupMap.get(key);
      if (g) {
        g.sizes.push({ tam: mof.facTam, qty: parseFloat(mof.facQuant) || 0, total: 0, missing: true });
      }
    }
    for (const g of groups) { g.sizes = sortSizes(g.sizes); }

    // Build table rows
    let grandTotal = 0;
    let grandQty = 0;
    const rowsHtml = groups.map((g, idx) => {
      const groupQty = g.sizes.filter(s => !s.missing).reduce((sum, s) => sum + s.qty, 0);
      const groupTotal = g.sizes.filter(s => !s.missing).reduce((sum, s) => sum + s.total, 0);
      grandTotal += groupTotal;
      grandQty += groupQty;

      const desc = [
        g.facDescProduto || g.facCodigoProduto || '',
        g.facDesccor && g.facDesccor !== g.facCor ? g.facDesccor : (g.facCor || ''),
        g.facDescparte && g.facDescparte !== g.facParte ? g.facDescparte : (g.facParte || ''),
        g.facDescsetor ? `Etapa: ${g.facDescsetor}` : (g.facCodsetor ? `Etapa: ${g.facCodsetor}` : '')
      ].filter(Boolean).join(' / ');

      return `<tr>
        <td class="center">${g.facCodigoProduto || ''}</td>
        <td class="center">${g.facNumero || ''}</td>
        <td>${desc}</td>
        <td class="right">R$ ${formatCur(g.unitPrice)}</td>
        <td class="center">${formatNum(groupQty)}</td>
        <td class="right">R$ ${formatCur(groupTotal)}</td>
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
        <th>Ref.</th>
        <th>OF</th>
        <th style="text-align:left;">Descricao</th>
        <th>Valor (R$)</th>
        <th>Quant.</th>
        <th>Total (R$)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="4" class="right">Total de pecas</td>
        <td class="center">${formatNum(grandQty)}</td>
        <td class="right">${hasDiscounts ? 'SUBTOTAL' : 'TOTAL'} R$ ${formatCur(grandTotal)}</td>
      </tr>
      ${discountRowsHtml}
      ${hasDiscounts ? `<tr class="payable-row">
        <td colspan="5" class="right">Total a pagar</td>
        <td class="right">R$ ${formatCur(totalPayable)}</td>
      </tr>` : ''}
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
      const priceInfo = await repo.findPrice(codcli, item.productCode, item.parte, item.date || new Date().toISOString().slice(0, 10));
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

function formatNum(val) {
  const n = parseFloat(val) || 0;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCur(val) {
  const n = parseFloat(val) || 0;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = router;
