const PDFDocument = require('pdfkit');

/**
 * Gerador do PDF "Lucro por venda — Mercado Livre".
 *
 * Porte fiel do layout aprovado pelo cliente (handover, seção 9 /
 * build_pdf.py — Lucro_ML_Basico_16-07-2026.pdf como referência visual):
 * A4 paisagem, faixa de 9 KPIs, Resumo por anúncio, Detalhe por pedido,
 * cores por dedução/crédito e caixa de margem por faixa.
 */

const MM = 72 / 25.4;

// Paleta (seção 9)
const NAVY   = '#1F4E78';
const LBLUE  = '#EEF4FA';
const BORD   = '#CBD8E6';
const RED    = '#C0392B';
const GREEN  = '#1E7E34';
const ZEBRA  = '#F6F9FC';
const GREY   = '#6B7683';
const HGRID  = '#E7EDF3';
const LGREEN = '#E4F2E8';
const BLACK  = '#000000';

// Caixa da margem por faixa (regra do cliente, seção 9.6)
function mfill(m) {
  if (m === null || m === undefined) return { bg: '#FFFFFF', fg: BLACK };
  if (m < 10) return { bg: '#F6CFD3', fg: '#A52834' };
  if (m > 13) return { bg: '#CFE0F5', fg: NAVY };
  return { bg: '#CDEBD6', fg: '#1B7A31' };
}

// 1234.56 -> "1.234,56" (padrão brasileiro; seção 9.8)
function br(v, { sign = false } = {}) {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v);
  const s = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v < -1e-9) return `-${s}`;
  if (sign && v > 1e-9) return `+${s}`;
  return s;
}

function brPct(m) {
  if (m === null || m === undefined) return '-';
  return `${m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtDateBr(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const M_LEFT = 13 * MM;
const M_RIGHT = 13 * MM;
const M_TOP = 12 * MM;
const M_BOTTOM = 11 * MM;
const PW = PAGE_W - M_LEFT - M_RIGHT; // ≈ 271 mm
const BOTTOM_Y = PAGE_H - M_BOTTOM;

// ── Célula de tabela ─────────────────────────────────────────────────────────
// { segments: [{text, color, bold, link, underline, size}], align, bg, fg }
function cellHeight(doc, cell, colW, fontSize, padV) {
  const w = colW - 7; // padding lateral 3,5 + 3,5
  const text = (cell.segments || []).map((s) => s.text).join('');
  const size = cell.size || fontSize;
  doc.font(cell.segments?.some((s) => s.bold) ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
  const h = doc.heightOfString(text || ' ', { width: w });
  return h + padV * 2;
}

function drawCell(doc, cell, x, y, colW, rowH, fontSize, padV) {
  const w = colW - 7;
  const size = cell.size || fontSize;
  const text = (cell.segments || []).map((s) => s.text).join('');
  doc.fontSize(size);
  doc.font('Helvetica');
  const textH = doc.heightOfString(text || ' ', { width: w });
  let ty = y + (rowH - textH) / 2;
  if (ty < y + 1) ty = y + 1;

  const segs = cell.segments || [];
  segs.forEach((seg, i) => {
    doc
      .font(seg.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(seg.size || size)
      .fillColor(seg.color || BLACK);
    const opts = {
      width: w,
      align: cell.align || 'left',
      continued: i < segs.length - 1,
      underline: !!seg.underline,
      link: seg.link || null,
    };
    if (i === 0) doc.text(seg.text, x + 3.5, ty, opts);
    else doc.text(seg.text, opts);
  });
}

/**
 * Desenha uma tabela com cabeçalho repetido a cada página.
 * headers: [{text, align}] · rows: [{cells, bg, isTotal, marginBg}]
 * marginCol: índice da coluna "Margem" (fundo por faixa + risco branco à esquerda)
 */
function drawTable(doc, { headers, rows, colWidths, fontSize, padV, marginCol, startY }) {
  const headerPad = 6;
  const headerFont = 9.5;
  let y = startY;
  let boxTop = y;

  const drawHeader = () => {
    const hH = headerFont + headerPad * 2 + 2;
    doc.save().rect(M_LEFT, y, PW, hH).fill(NAVY).restore();
    let x = M_LEFT;
    headers.forEach((h, i) => {
      doc.font('Helvetica-Bold').fontSize(headerFont).fillColor('#FFFFFF');
      doc.text(h.text, x + 3.5, y + headerPad, { width: colWidths[i] - 7, align: h.align || 'right' });
      x += colWidths[i];
    });
    y += hH;
  };

  const strokeBox = (top, bottom) => {
    doc.lineWidth(0.6).strokeColor(BORD).rect(M_LEFT, top, PW, bottom - top).stroke();
  };

  drawHeader();

  rows.forEach((row, ri) => {
    // Altura da linha = célula mais alta
    let rowH = 0;
    row.cells.forEach((cell, ci) => {
      rowH = Math.max(rowH, cellHeight(doc, cell, colWidths[ci], fontSize, padV));
    });

    if (y + rowH > BOTTOM_Y) {
      strokeBox(boxTop, y);
      doc.addPage();
      y = M_TOP;
      boxTop = y;
      drawHeader();
    }

    // Fundos: zebra / total / caixa da margem
    if (row.bg) doc.save().rect(M_LEFT, y, PW, rowH).fill(row.bg).restore();
    if (marginCol !== undefined && row.marginBg) {
      const mx = M_LEFT + colWidths.slice(0, marginCol).reduce((a, b) => a + b, 0);
      doc.save().rect(mx, y, colWidths[marginCol], rowH).fill(row.marginBg).restore();
      doc.lineWidth(0.5).strokeColor('#FFFFFF')
        .moveTo(mx, y).lineTo(mx, y + rowH).stroke();
    }

    let x = M_LEFT;
    row.cells.forEach((cell, ci) => {
      drawCell(doc, cell, x, y, colWidths[ci], rowH, fontSize, padV);
      x += colWidths[ci];
    });

    if (row.isTotal) {
      doc.lineWidth(0.8).strokeColor(NAVY)
        .moveTo(M_LEFT, y).lineTo(M_LEFT + PW, y).stroke();
    } else if (ri < rows.length - 1) {
      doc.lineWidth(0.3).strokeColor(HGRID)
        .moveTo(M_LEFT, y + rowH).lineTo(M_LEFT + PW, y + rowH).stroke();
    }

    y += rowH;
  });

  strokeBox(boxTop, y);
  return y;
}

// ── Faixa de KPIs (seção 9.4) ────────────────────────────────────────────────
function drawKpiBand(doc, totals, y) {
  const m = mfill(totals.margem);
  const rs = (v, opts) => (v === null || v === undefined ? '-' : `R$ ${br(v, opts)}`);
  const neg = (v) => (v === null || v === undefined ? null : -v);
  const kpis = [
    { label: 'Faturamento', value: rs(totals.fat), color: BLACK },
    { label: 'Comissão ML', value: rs(totals.comissao), color: RED },
    { label: 'Frete ML', value: rs(totals.frete), color: RED },
    { label: 'Estorno ML', value: rs(totals.estorno, { sign: true }), color: GREEN },
    { label: 'Líquido ML', value: rs(totals.liquido), color: BLACK },
    { label: 'NF 8%', value: rs(neg(totals.nf)), color: RED },
    { label: 'Custo', value: rs(neg(totals.custo)), color: RED },
    { label: 'LUCRO', value: rs(totals.lucro), color: GREEN, bg: LGREEN },
    { label: 'Margem', value: brPct(totals.margem), color: m.fg, bg: m.bg },
  ];

  const cardW = PW / 9;
  const labelH = 9 * MM;
  const valueH = 12.5 * MM;
  const totalH = labelH + valueH;

  doc.save().rect(M_LEFT, y, PW, totalH).fill(LBLUE).restore();
  kpis.forEach((k, i) => {
    if (k.bg) {
      doc.save().rect(M_LEFT + i * cardW, y, cardW, totalH).fill(k.bg).restore();
    }
  });

  // Divisórias verticais + borda
  for (let i = 1; i < 9; i++) {
    doc.lineWidth(0.5).strokeColor(BORD)
      .moveTo(M_LEFT + i * cardW, y).lineTo(M_LEFT + i * cardW, y + totalH).stroke();
  }
  doc.lineWidth(0.7).strokeColor(BORD).rect(M_LEFT, y, PW, totalH).stroke();

  kpis.forEach((k, i) => {
    const x = M_LEFT + i * cardW;
    // Rótulo: 9,5pt cinza, alinhado à base da linha de rótulo
    doc.font('Helvetica').fontSize(9.5).fillColor(GREY);
    doc.text(k.label, x + 3, y + labelH - 9.5 - 3, { width: cardW - 6, align: 'center' });
    // Valor: 12pt negrito no topo da linha de valor
    doc.font('Helvetica-Bold').fontSize(12).fillColor(k.color);
    doc.text(k.value, x + 3, y + labelH + 3, { width: cardW - 6, align: 'center' });
  });

  return y + totalH;
}

// ── Documento completo ───────────────────────────────────────────────────────
function storeDisplayName(storeLabel) {
  return String(storeLabel).replace(/\(.*?\)/g, '').trim();
}

/**
 * Cria o PDFDocument do relatório. O chamador faz doc.pipe(destino).
 * @param {object} data - resultado de mlProfitReportService.getReportData()
 */
function createProfitPdf(data) {
  const { rows, resumo, totals, date, store } = data;
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    info: { Title: `Lucro por venda ML — ${storeDisplayName(store)} — ${fmtDateBr(date)}` },
    bufferPages: false,
  });

  const nfLabel = `NF ${Math.round((data.nfPct || 0.08) * 100)}%`;

  // Título + subtítulo (seção 9.3)
  let y = M_TOP;
  doc.font('Helvetica-Bold').fontSize(19).fillColor(NAVY);
  doc.text(`Lucro por venda — Mercado Livre · ${storeDisplayName(store)}`, M_LEFT, y, {
    width: PW, align: 'center',
  });
  y = doc.y + 3;

  doc.font('Helvetica').fontSize(8.5).fillColor(GREY);
  doc.text(
    `Vendas de ${fmtDateBr(date)}  ·  Comissão, frete e estorno = valores reais do detalhe de cada venda no Mercado Livre  ·  ` +
    `NF = ${Math.round((data.nfPct || 0.08) * 100)}% do faturamento  ·  Custo = kit × custo do produto de estoque vinculado`,
    M_LEFT, y, { width: PW, align: 'center' }
  );
  y = doc.y + 2;

  const pctCusto = totals.pedidos ? Math.round((100 * totals.comCusto) / totals.pedidos) : 0;
  const pctFees = totals.pedidos ? Math.round((100 * totals.comFees) / totals.pedidos) : 0;
  doc.text(
    `${totals.pedidos} pedidos  ·  custo cadastrado em ${pctCusto}%  ·  tarifas reais do ML em ${pctFees}%`,
    M_LEFT, y, { width: PW, align: 'center' }
  );
  y = doc.y + 9;

  // KPIs
  y = drawKpiBand(doc, totals, y);

  // ── Resumo por anúncio ────────────────────────────────────────────────────
  y += 13;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY);
  doc.text('Resumo por anúncio', M_LEFT, y);
  y = doc.y + 7;

  const linkSeg = (url, label) =>
    url ? [{ text: '  ' }, { text: label, color: NAVY, underline: true, link: url }] : [];

  const money = (v, color, { sign, bold } = {}) => ({
    segments: [{ text: br(v, { sign }), color: v === null ? BLACK : color, bold }],
    align: 'right',
  });

  const headResumo = [
    { text: 'Anúncio', align: 'left' }, { text: 'Qtd', align: 'center' },
    { text: 'Faturam.' }, { text: 'Comissão' }, { text: 'Frete' }, { text: 'Estorno' },
    { text: 'Líq. ML' }, { text: nfLabel }, { text: 'Custo' }, { text: 'Lucro' }, { text: 'Margem' },
  ];
  const colResumo = [83, 11, 20, 20, 20, 20, 20, 20, 20, 20, 17].map((w) => w * MM);

  const resumoRows = resumo.map((a, i) => ({
    bg: i % 2 === 1 ? ZEBRA : null,
    marginBg: mfill(a.margem).bg,
    cells: [
      { segments: [{ text: a.ad }, ...linkSeg(a.adUrl, 'ver anúncio')], align: 'left' },
      { segments: [{ text: String(Math.round(a.qty)) }], align: 'center' },
      money(a.fat, BLACK),
      money(a.comissao, RED),
      money(a.frete, RED),
      money(a.estorno, GREEN, { sign: true }),
      money(a.liquido, BLACK),
      money(a.nf === null ? null : -a.nf, RED),
      money(a.custo === null ? null : -a.custo, RED),
      money(a.lucro, GREEN, { bold: true }),
      { segments: [{ text: brPct(a.margem), color: mfill(a.margem).fg, bold: true }], align: 'center' },
    ],
  }));
  resumoRows.push({
    bg: LBLUE,
    isTotal: true,
    marginBg: mfill(totals.margem).bg,
    cells: [
      { segments: [{ text: 'TOTAL', bold: true }], align: 'left' },
      { segments: [{ text: String(Math.round(totals.qty)), bold: true }], align: 'center' },
      money(totals.fat, BLACK, { bold: true }),
      money(totals.comissao, BLACK, { bold: true }),
      money(totals.frete, BLACK, { bold: true }),
      money(totals.estorno, BLACK, { sign: true, bold: true }),
      money(totals.liquido, BLACK, { bold: true }),
      money(-totals.nf, BLACK, { bold: true }),
      money(totals.custo === null ? null : -totals.custo, BLACK, { bold: true }),
      money(totals.lucro, BLACK, { bold: true }),
      { segments: [{ text: brPct(totals.margem), color: mfill(totals.margem).fg, bold: true }], align: 'center' },
    ],
  });

  y = drawTable(doc, {
    headers: headResumo, rows: resumoRows, colWidths: colResumo,
    fontSize: 10, padV: 5, marginCol: 10, startY: y,
  });

  // ── Detalhe por pedido ────────────────────────────────────────────────────
  if (y + 60 > BOTTOM_Y) { doc.addPage(); y = M_TOP; } else { y += 13; }
  doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY);
  doc.text('Detalhe por pedido', M_LEFT, y);
  y = doc.y + 7;

  const headDetalhe = [
    { text: 'Pedido ML', align: 'left' }, { text: 'Anúncio', align: 'left' }, { text: 'Qtd', align: 'center' },
    { text: 'Faturam.' }, { text: 'Comissão' }, { text: 'Frete' }, { text: 'Estorno' },
    { text: 'Líq. ML' }, { text: nfLabel }, { text: 'Custo' }, { text: 'Lucro' }, { text: 'Marg.' },
  ];
  const colDetalhe = [30, 63, 10, 19, 19, 19, 19, 19, 19, 19, 19, 16].map((w) => w * MM);

  const detalheRows = rows.map((r, i) => ({
    bg: i % 2 === 1 ? ZEBRA : null,
    marginBg: mfill(r.margem).bg,
    cells: [
      {
        // Nº do pedido em 7,3pt para caber em uma linha (seção 9.7)
        segments: [{
          text: r.oid, color: NAVY, underline: true, size: 7.3,
          link: `https://www.mercadolivre.com.br/vendas/${r.oid}/detalhe`,
        }],
        size: 7.3,
        align: 'left',
      },
      { segments: [{ text: r.ad.slice(0, 28) }, ...linkSeg(r.adUrl, '(ver)')], align: 'left' },
      { segments: [{ text: String(Math.round(r.qty)) }], align: 'center' },
      money(r.fat, BLACK),
      money(r.comissao, RED),
      money(r.frete, RED),
      money(r.estorno, GREEN, { sign: true }),
      money(r.liquido, BLACK),
      money(r.nf === null ? null : -r.nf, RED),
      money(r.custo === null ? null : -r.custo, RED),
      money(r.lucro, GREEN, { bold: true }),
      { segments: [{ text: brPct(r.margem), color: mfill(r.margem).fg, bold: true }], align: 'center' },
    ],
  }));
  detalheRows.push({
    bg: LBLUE,
    isTotal: true,
    marginBg: mfill(totals.margem).bg,
    cells: [
      { segments: [{ text: 'TOTAL', bold: true }], align: 'left' },
      { segments: [{ text: '' }] },
      { segments: [{ text: String(Math.round(totals.qty)), bold: true }], align: 'center' },
      money(totals.fat, BLACK, { bold: true }),
      money(totals.comissao, BLACK, { bold: true }),
      money(totals.frete, BLACK, { bold: true }),
      money(totals.estorno, BLACK, { sign: true, bold: true }),
      money(totals.liquido, BLACK, { bold: true }),
      money(-totals.nf, BLACK, { bold: true }),
      money(totals.custo === null ? null : -totals.custo, BLACK, { bold: true }),
      money(totals.lucro, BLACK, { bold: true }),
      { segments: [{ text: brPct(totals.margem), color: mfill(totals.margem).fg, bold: true }], align: 'center' },
    ],
  });

  y = drawTable(doc, {
    headers: headDetalhe, rows: detalheRows, colWidths: colDetalhe,
    fontSize: 9, padV: 4.4, marginCol: 11, startY: y,
  });

  // ── Legenda + notas (seções 9.6/9.9) ─────────────────────────────────────
  if (y + 60 > BOTTOM_Y) { doc.addPage(); y = M_TOP; } else { y += 10; }

  // Legenda: quadradinhos desenhados (o glifo ■ não existe na Helvetica padrão)
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLACK);
  doc.text('Legenda da margem:', M_LEFT, y, { lineBreak: false });
  let lx = M_LEFT + doc.widthOfString('Legenda da margem:') + 8;
  const legend = [
    { color: '#A52834', label: 'abaixo de 10%' },
    { color: '#1B7A31', label: 'de 10% a 13%' },
    { color: NAVY, label: 'acima de 13%.' },
  ];
  doc.font('Helvetica').fontSize(8.5);
  for (const item of legend) {
    doc.save().rect(lx, y + 0.5, 7, 7).fill(item.color).restore();
    lx += 11;
    doc.fillColor(GREY).text(item.label, lx, y, { lineBreak: false });
    lx += doc.widthOfString(item.label) + 14;
  }
  y += 12.5;

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREY).text('Notas. ', M_LEFT, y, { continued: true, width: PW });
  doc.font('Helvetica').text(
    `Comissão, Frete e Estorno: valores reais do detalhe de cada venda no ML (conta ${storeDisplayName(store)}). ` +
    `Líquido ML = Faturamento + Comissão + Frete + Estorno. ${nfLabel} = premissa sobre o faturamento. ` +
    'Custo = kit × custo do produto de estoque vinculado ao anúncio no control. ' +
    'Lucro = Líquido ML - NF - Custo. Margem = Lucro ÷ Faturamento.',
    { continued: false }
  );

  doc.end();
  return doc;
}

module.exports = { createProfitPdf, mfill, br };
