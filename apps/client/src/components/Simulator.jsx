import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Badge, Box, Button, Flex, Input, Select, SimpleGrid, Spinner, Stat, StatLabel,
  StatNumber, Text, useColorModeValue, Accordion, AccordionItem, AccordionButton,
  AccordionPanel, AccordionIcon,
} from "@chakra-ui/react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import useAppToast from "../hooks/useAppToast";
import {
  fetchSimulationBase, fetchSimulations, fetchSimulation, createSimulation,
  duplicateSimulation, deleteSimulation, deleteSimulationGroup, fetchSystemSettings,
} from "../api";

const BRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctBR = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dBRL = (n) => `${n >= 0 ? "+" : "−"}${BRL(Math.abs(n))}`;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MPLABEL = { mercadolivre: "Mercado Livre", shopee: "Shopee", shein: "Shein", tiktok: "TikTok" };
const COLORS = ["#3182ce", "#dd6b20", "#805ad5", "#38a169", "#d53f8c", "#319795", "#718096"];

// Faixa de Canais & Taxas correspondente ao preço do kit (null se nenhuma cobre o valor)
function findBand(bands, platform, kitPrice) {
  return bands.find(x => x.marketplace === platform && Number(x.price_min) <= kitPrice && (x.price_max == null || kitPrice <= Number(x.price_max))) || null;
}
function resolveFee(bands, platform, kitPrice) {
  const b = findBand(bands, platform, kitPrice);
  return b ? { com: Number(b.commission_pct), fixa: Number(b.fixed_per_sale) } : { com: 0, fixa: 0 };
}
const key = (s, p) => `${s}:${p}`;

// Comissão efetiva do item: fica no item (como a taxa fixa); cenários antigos
// guardavam no parâmetro da loja — fallback p/ compatibilidade.
const hasVal = (v) => v !== undefined && v !== null && v !== "";
const effCom = (it, pp) => hasVal(it?.com) ? (Number(it.com) || 0) : (Number(pp?.com) || 0);

// ─── Cálculo puro do cenário (usado no editor e no PDF de cenários salvos) ────
// selection: { store_id -> [product_id...] } — produtos na visão de cada loja; null/ausente = todos
function computeCalc(stores, products, mix, params, items, selection = null) {
  const perStore = {}; let gV = 0, gF = 0, gL = 0;
  const cell = {};
  stores.forEach(s => { perStore[s.id] = { vendas: 0, fat: 0, lucro: 0 }; });
  stores.forEach(s => {
    const pp = params[s.id] || { com: 0, nf: 0, precoAjuste: 0 };
    const selArr = selection ? selection[s.id] : null;
    const selSet = Array.isArray(selArr) ? new Set(selArr.map(Number)) : null;
    products.forEach(p => {
      if (selSet && !selSet.has(Number(p.id))) return;
      const it = items[key(s.id, p.id)] || { kit: 1, unit_price: 0, fixa: 0, frete_type: "none", frete_value: 0 };
      const kit = Number(it.kit) || 1;
      const pieces = Math.round((Number(p.saldo) || 0) * (Number(mix[s.id]) || 0) / 100);
      const kitPrice = Number(it.unit_price) * kit * (1 + (Number(pp.precoAjuste) || 0) / 100);
      const vendas = Math.floor(pieces / kit);
      const fat = kitPrice * vendas;
      const comPct = effCom(it, pp);
      const comV = fat * comPct / 100;
      const fixV = (Number(it.fixa) || 0) * vendas;
      const freteV = it.frete_type === "pct" ? fat * (Number(it.frete_value) || 0) / 100 : it.frete_type === "fix" ? (Number(it.frete_value) || 0) * vendas : 0;
      const nfV = fat * (Number(pp.nf) || 0) / 100;
      const cost = (Number(p.avg_cost) || 0) * vendas * kit;
      const lucro = fat - comV - fixV - freteV - nfV - cost;
      cell[key(s.id, p.id)] = { pieces, kitPrice, vendas, fat, comPct, comV, fixV, freteV, nfV, cost, lucro, margem: fat ? lucro / fat * 100 : 0 };
      perStore[s.id].vendas += vendas; perStore[s.id].fat += fat; perStore[s.id].lucro += lucro;
      gV += vendas; gF += fat; gL += lucro;
    });
  });
  return { perStore, cell, totals: { vendas: gV, fat: gF, lucro: gL, margem: gF ? gL / gF * 100 : 0 } };
}

const freteLabel = (it) =>
  it?.frete_type === "pct" ? `${pctBR(it.frete_value)}% do preço`
  : it?.frete_type === "fix" ? `${BRL(it.frete_value)} fixo`
  : "Sem frete";

// ─── Diff entre versões (o que foi alterado vs. cenário inicial) ─────────────
function diffVersions(iniD, curD) {
  const changes = { mix: [], params: [], items: [], base: [], visao: [] };
  const num = (v) => Number(v) || 0;
  const storeOf = (id) =>
    (curD.stores || []).find(s => String(s.id) === String(id)) ||
    (iniD.stores || []).find(s => String(s.id) === String(id));
  const storeName = (id) => { const s = storeOf(id); return s ? `${s.name} (${MPLABEL[s.platform] || s.platform})` : `Loja ${id}`; };
  const prodOf = (id) =>
    (curD.products || []).find(p => String(p.id) === String(id)) ||
    (iniD.products || []).find(p => String(p.id) === String(id));
  const prodName = (id) => { const p = prodOf(id); return p ? `${p.codigo} · ${p.descricao}` : `Produto ${id}`; };

  // Mix de vendas
  const storeIds = [...new Set([...Object.keys(iniD.mix || {}), ...Object.keys(curD.mix || {})])];
  storeIds.forEach(id => {
    const a = num((iniD.mix || {})[id]), b = num((curD.mix || {})[id]);
    if (a !== b) changes.mix.push(`${storeName(id)}: ${pctBR(a)}% → <b>${pctBR(b)}%</b>`);
  });

  // Parâmetros por loja (comissão é por item; ver diff de itens abaixo)
  const PARAM_LABELS = { nf: ["NF", "%"], precoAjuste: ["Ajuste de preço", "%"] };
  const pIds = [...new Set([...Object.keys(iniD.params || {}), ...Object.keys(curD.params || {})])];
  pIds.forEach(id => {
    const a = (iniD.params || {})[id] || {}, b = (curD.params || {})[id] || {};
    Object.entries(PARAM_LABELS).forEach(([f, [label, suf]]) => {
      if (num(a[f]) !== num(b[f])) changes.params.push(`${storeName(id)} — ${label}: ${pctBR(a[f])}${suf} → <b>${pctBR(b[f])}${suf}</b>`);
    });
  });

  // Itens (preço/kit/taxa/frete por loja × produto)
  const itemKeys = [...new Set([...Object.keys(iniD.items || {}), ...Object.keys(curD.items || {})])];
  itemKeys.forEach(k => {
    const [sid, pid] = k.split(":");
    const a = (iniD.items || {})[k] || {}, b = (curD.items || {})[k] || {};
    const diffs = [];
    if (num(a.unit_price) !== num(b.unit_price)) diffs.push(`Preço unit. ${BRL(a.unit_price)} → <b>${BRL(b.unit_price)}</b>`);
    const comA = effCom(a, (iniD.params || {})[sid]), comB = effCom(b, (curD.params || {})[sid]);
    if (comA !== comB) diffs.push(`Comissão ${pctBR(comA)}% → <b>${pctBR(comB)}%</b>`);
    if (num(a.kit) !== num(b.kit)) diffs.push(`Kit ${num(a.kit) || 1} → <b>${num(b.kit) || 1}</b>`);
    if (num(a.fixa) !== num(b.fixa)) diffs.push(`Taxa fixa ${BRL(a.fixa)} → <b>${BRL(b.fixa)}</b>`);
    if ((a.frete_type || "none") !== (b.frete_type || "none") || num(a.frete_value) !== num(b.frete_value))
      diffs.push(`Frete ${freteLabel(a)} → <b>${freteLabel(b)}</b>`);
    if (diffs.length) changes.items.push(`${storeName(sid)} — ${esc(prodName(pid))}: ${diffs.join(" · ")}`);
  });

  // Base de estoque/custo (snapshot pode ter mudado entre as versões)
  const prodIds = [...new Set([...(iniD.products || []).map(p => String(p.id)), ...(curD.products || []).map(p => String(p.id))])];
  prodIds.forEach(id => {
    const a = (iniD.products || []).find(p => String(p.id) === id);
    const b = (curD.products || []).find(p => String(p.id) === id);
    if (a && !b) { changes.base.push(`${esc(prodName(id))}: saiu do cenário`); return; }
    if (!a && b) { changes.base.push(`${esc(prodName(id))}: entrou no cenário`); return; }
    const d = [];
    if (num(a.saldo) !== num(b.saldo)) d.push(`Saldo ${num(a.saldo)} → <b>${num(b.saldo)} pç</b>`);
    if (Math.abs(num(a.avg_cost) - num(b.avg_cost)) >= 0.005) d.push(`Custo médio ${BRL(a.avg_cost)} → <b>${BRL(b.avg_cost)}</b>`);
    if (d.length) changes.base.push(`${esc(prodName(id))}: ${d.join(" · ")}`);
  });

  // Produtos na visão de cada loja (seleção; ausente = todos os produtos da versão)
  const selOf = (d, sid) => {
    const arr = d.selection?.[sid];
    return new Set(Array.isArray(arr) ? arr.map(String) : (d.products || []).map(p => String(p.id)));
  };
  const visStoreIds = [...new Set([...(iniD.stores || []).map(s => String(s.id)), ...(curD.stores || []).map(s => String(s.id))])];
  visStoreIds.forEach(sid => {
    const a = selOf(iniD, sid), b = selOf(curD, sid);
    const added = [...b].filter(x => !a.has(x)).map(x => esc(prodName(x)));
    const removed = [...a].filter(x => !b.has(x)).map(x => esc(prodName(x)));
    const parts = [];
    if (added.length) parts.push(`incluiu <b>${added.join(", ")}</b>`);
    if (removed.length) parts.push(`removeu <b>${removed.join(", ")}</b>`);
    if (parts.length) changes.visao.push(`${storeName(sid)}: ${parts.join(" · ")}`);
  });

  return changes;
}

// ─── Análise automática (impacto por loja e por produto) ─────────────────────
function buildAnalysis(iniD, curD, iniCalc, curCalc) {
  const bullets = [];
  const ti = iniCalc.totals, tc = curCalc.totals;
  const dL = tc.lucro - ti.lucro;
  const pL = ti.lucro ? dL / Math.abs(ti.lucro) * 100 : 0;
  bullets.push(`Lucro líquido ${dL >= 0 ? "subiu" : "caiu"} <b>${dBRL(dL)}</b> (${dL >= 0 ? "+" : "−"}${pctBR(Math.abs(pL))}%) em relação ao cenário inicial: ${BRL(ti.lucro)} → <b>${BRL(tc.lucro)}</b>.`);
  bullets.push(`Margem: ${pctBR(ti.margem)}% → <b>${pctBR(tc.margem)}%</b> · Faturamento: ${BRL(ti.fat)} → <b>${BRL(tc.fat)}</b>.`);
  if (tc.vendas !== ti.vendas) bullets.push(`Vendas (kits): ${ti.vendas} → <b>${tc.vendas}</b> (${tc.vendas - ti.vendas >= 0 ? "+" : ""}${tc.vendas - ti.vendas}).`);

  // Impacto por loja
  const stores = curD.stores || [];
  const storeDeltas = stores.map(s => ({
    label: `${s.name} (${MPLABEL[s.platform] || s.platform})`,
    d: (curCalc.perStore[s.id]?.lucro || 0) - (iniCalc.perStore[s.id]?.lucro || 0),
  })).filter(x => Math.abs(x.d) >= 0.01).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  if (storeDeltas.length) {
    bullets.push(`Impacto no lucro por loja: ${storeDeltas.slice(0, 3).map(x => `${esc(x.label)} <b>${dBRL(x.d)}</b>`).join(" · ")}${storeDeltas.length > 3 ? " · …" : ""}.`);
  }

  // Impacto por produto (agregado entre as lojas)
  const perProd = new Map();
  const addProd = (calcObj, dataObj, sign) => {
    (dataObj.stores || []).forEach(s => (dataObj.products || []).forEach(p => {
      const c = calcObj.cell[key(s.id, p.id)];
      if (!c) return;
      const cur = perProd.get(String(p.id)) || { label: `${p.codigo} · ${p.descricao}`, d: 0 };
      cur.d += sign * c.lucro;
      perProd.set(String(p.id), cur);
    }));
  };
  addProd(curCalc, curD, 1); addProd(iniCalc, iniD, -1);
  const prodDeltas = [...perProd.values()].filter(x => Math.abs(x.d) >= 0.01).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  if (prodDeltas.length) {
    bullets.push(`Produtos que mais mudaram o resultado: ${prodDeltas.slice(0, 3).map(x => `${esc(x.label)} <b>${dBRL(x.d)}</b>`).join(" · ")}${prodDeltas.length > 3 ? " · …" : ""}.`);
  }
  return bullets;
}

// ─── Montagem do PDF (arquivo real, baixado — abre no leitor de PDF) ─────────
const PDF_W = 297, PDF_H = 210, PDF_M = 10; // A4 paisagem, em mm
const NAVY = [26, 54, 93], BLUE = [49, 130, 206], RED = [192, 57, 43], GRAY = [85, 85, 85];

// Texto plano para o PDF: tira tags (<b>) e troca caracteres fora do WinAnsi da fonte padrão
const plain = (s) => String(s ?? "")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/→/g, "->").replace(/−/g, "-").replace(/Δ/g, "Dif.");

function pdfEnsureSpace(doc, y, need) {
  if (y + need > PDF_H - PDF_M) { doc.addPage(); return PDF_M + 6; }
  return y;
}

// Logo do sistema (mesmo upload usado no topo do app) convertido p/ PNG data-URL, com cache
let _logoPromise = null;
function loadCompanyLogo() {
  if (!_logoPromise) {
    _logoPromise = (async () => {
      const st = await fetchSystemSettings();
      if (!st?.logoPath) return null;
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `/uploads/${st.logoPath}`; });
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height;
      cv.getContext("2d").drawImage(img, 0, 0);
      return { dataUrl: cv.toDataURL("image/png"), w: cv.width, h: cv.height };
    })().catch(() => { _logoPromise = null; return null; });
  }
  return _logoPromise;
}

// ─── Capa decorativa (inspirada no relatório Básico + Criativo: céu, balões e cartão) ─
const CAPA = {
  navy: [30, 58, 95],
  coral: [224, 90, 58],
  stripes: [[195, 74, 50], [212, 100, 72], [227, 131, 103], [240, 166, 140], [248, 201, 181], [253, 231, 221]],
  cream: [250, 238, 232],
  gold: [212, 136, 12],
};

function capaBalloon(doc, cx, cy, r, fill, hi) {
  const ry = r * 1.15;
  // cordas e cesto primeiro (ficam atrás do envelope)
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.35);
  const by = cy + ry + r * 0.32, bw = r * 0.52, bh = r * 0.34;
  doc.line(cx - bw / 2, by, cx - r * 0.55, cy + ry * 0.75);
  doc.line(cx + bw / 2, by, cx + r * 0.55, cy + ry * 0.75);
  doc.setFillColor(...CAPA.gold); doc.setDrawColor(...CAPA.navy); doc.setLineWidth(0.25);
  doc.rect(cx - bw / 2, by, bw, bh, "FD");
  // envelope com contorno branco + brilho vertical
  doc.setFillColor(...fill); doc.setDrawColor(255, 255, 255); doc.setLineWidth(r * 0.055);
  doc.ellipse(cx, cy, r, ry, "FD");
  doc.setFillColor(...hi);
  doc.ellipse(cx - r * 0.1, cy - ry * 0.18, r * 0.22, ry * 0.42, "F");
}

function capaClouds(doc, spots) {
  if (!doc.GState) return;
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.13 }));
  doc.setFillColor(255, 255, 255);
  for (const [x, y, r] of spots) {
    doc.circle(x, y, r, "F");
    doc.circle(x + r * 0.9, y + r * 0.25, r * 0.75, "F");
    doc.circle(x - r * 0.85, y + r * 0.3, r * 0.65, "F");
  }
  doc.restoreGraphicsState();
}

function pdfCapa(doc, { title, subtitle, logo }) {
  // céu: faixa navy + degradê coral (pôr do sol)
  doc.setFillColor(...CAPA.navy); doc.rect(0, 0, PDF_W, 24, "F");
  const y0 = 24, n = CAPA.stripes.length, sh = (PDF_H - y0) / n;
  CAPA.stripes.forEach((c, i) => { doc.setFillColor(...c); doc.rect(0, y0 + i * sh, PDF_W, sh + 0.5, "F"); });
  capaClouds(doc, [[36, 16, 9], [150, 8, 7], [258, 14, 8], [86, 32, 8], [216, 30, 7]]);

  // balões: navy pequeno, coral grande ao centro, creme pequeno
  capaBalloon(doc, 66, 44, 9.5, CAPA.navy, [58, 88, 128]);
  capaBalloon(doc, PDF_W / 2, 44, 17, CAPA.coral, [236, 124, 96]);
  capaBalloon(doc, 232, 46, 8.5, CAPA.cream, [255, 250, 247]);

  // cartão branco arredondado (estende além da borda p/ base reta)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(9, 96, PDF_W - 18, PDF_H - 96 + 12, 9, 9, "F");

  // logo da empresa centralizado no cartão
  const cx = PDF_W / 2;
  let ty = 148;
  if (logo) {
    const maxW = 64, maxH = 30;
    const s = Math.min(maxW / logo.w, maxH / logo.h);
    const w = logo.w * s, h = logo.h * s;
    doc.addImage(logo.dataUrl, "PNG", cx - w / 2, 124 - h / 2, w, h);
    ty = 124 + h / 2 + 16;
  }

  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...NAVY);
  doc.text(plain(title), cx, ty, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(...CAPA.coral);
  doc.text(plain(subtitle), cx, ty + 8, { align: "center" });

  // divisor pontilhado rosa-claro
  doc.setDrawColor(240, 190, 175); doc.setLineWidth(0.4); doc.setLineDashPattern([1.4, 1.8], 0);
  doc.line(38, ty + 15, PDF_W - 38, ty + 15);
  doc.setLineDashPattern([], 0);

  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
  doc.text(plain("Custo & Preço  •  Simulador de Cenários"), cx, PDF_H - 9, { align: "center" });
  doc.addPage();
}

function pdfSectionTitle(doc, y, title) {
  y = pdfEnsureSpace(doc, y, 16);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text(plain(title), PDF_M, y);
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.4);
  doc.line(PDF_M, y + 1.5, PDF_W - PDF_M, y + 1.5);
  return y + 7;
}

function pdfBullets(doc, y, title, arr, emptyMsg) {
  y = pdfSectionTitle(doc, y, title);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  const items = arr.length ? arr : [emptyMsg];
  for (const item of items) {
    const lines = doc.splitTextToSize(`• ${plain(item)}`, PDF_W - PDF_M * 2 - 3);
    y = pdfEnsureSpace(doc, y, lines.length * 4.2 + 2);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    doc.text(lines, PDF_M + 2, y);
    y += lines.length * 4.2 + 1.5;
  }
  return y + 5;
}

function pdfCover(doc, { name, version, createdAt, iniVersion, iniCreatedAt, changes, bullets, iniTotals, curTotals }) {
  let y = PDF_M + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(20, 20, 20);
  doc.text(plain(`Resumo da simulação — ${name} (v${version})`), PDF_M, y); y += 6;
  const nChanges = Object.values(changes).reduce((n, a) => n + a.length, 0);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
  const meta = doc.splitTextToSize(plain(
    `Versão v${version} de ${new Date(createdAt).toLocaleString("pt-BR")} · comparada com o cenário inicial (v${iniVersion} de ${new Date(iniCreatedAt).toLocaleString("pt-BR")}) · ${nChanges} alteração(ões) de configuração`
  ), PDF_W - PDF_M * 2);
  doc.text(meta, PDF_M, y); y += meta.length * 4 + 2;

  const dv = curTotals.vendas - iniTotals.vendas;
  const dm = curTotals.margem - iniTotals.margem;
  autoTable(doc, {
    startY: y,
    margin: { left: PDF_M, right: PDF_M },
    tableWidth: 160,
    head: [["Indicador", `Inicial (v${iniVersion})`, `Esta versão (v${version})`, "Dif."]],
    body: [
      ["Vendas (kits)", String(iniTotals.vendas), String(curTotals.vendas), `${dv >= 0 ? "+" : ""}${dv}`],
      ["Faturamento", BRL(iniTotals.fat), BRL(curTotals.fat), plain(dBRL(curTotals.fat - iniTotals.fat))],
      ["Lucro líquido", BRL(iniTotals.lucro), BRL(curTotals.lucro), plain(dBRL(curTotals.lucro - iniTotals.lucro))],
      ["Margem", `${pctBR(iniTotals.margem)}%`, `${pctBR(curTotals.margem)}%`, `${dm >= 0 ? "+" : "-"}${pctBR(Math.abs(dm))} pp`],
    ],
    styles: { fontSize: 9, halign: "right", cellPadding: 1.6 },
    headStyles: { fillColor: NAVY, halign: "right" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 3) {
        const v = String(d.cell.raw);
        if (/^\+/.test(v) && !/^\+0([,.]0+)?( pp)?$/.test(v)) d.cell.styles.textColor = [39, 103, 73];
        else if (/^-/.test(v)) d.cell.styles.textColor = RED;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  y = pdfBullets(doc, y, "Análise automática", bullets, "Sem variações relevantes.");
  y = pdfBullets(doc, y, "Mix de vendas alterado", changes.mix, "Mix inalterado.");
  y = pdfBullets(doc, y, "Parâmetros por loja alterados", changes.params, "Comissão, NF e ajuste de preço inalterados.");
  y = pdfBullets(doc, y, "Preços & itens alterados", changes.items, "Preços, kits, taxas e fretes inalterados.");
  y = pdfBullets(doc, y, "Produtos na visão (por loja)", changes.visao, "Mesmos produtos do cenário inicial.");
  pdfBullets(doc, y, "Base de estoque/custo", changes.base, "Mesma base de estoque e custo do cenário inicial.");
  doc.addPage();
}

function pdfReport(doc, { name, subtitle, calc, stores, products, mix }) {
  let y = PDF_M + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(20, 20, 20);
  doc.text(plain("Simulação de cenário — Mix de canais (por loja)"), PDF_M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(plain(`Cenário: ${name}${subtitle ? ` · ${subtitle}` : ""}`), PDF_M, y); y += 4;

  const t = calc.totals;
  autoTable(doc, {
    startY: y, margin: { left: PDF_M, right: PDF_M }, tableWidth: 170,
    head: [["Vendas (kits)", "Faturamento", "Lucro líquido", "Margem"]],
    body: [[String(t.vendas), BRL(t.fat), BRL(t.lucro), `${t.margem.toFixed(0)}%`]],
    styles: { fontSize: 10, halign: "center", fontStyle: "bold", cellPadding: 1.6 },
    headStyles: { fillColor: NAVY, halign: "center" },
  });
  y = doc.lastAutoTable.finalY + 9;

  stores.forEach(st => {
    const rows = products.map(p => {
      const c = calc.cell[key(st.id, p.id)];
      if (!c || c.vendas === 0) return null;
      return [plain(`${p.codigo} · ${p.descricao}`), String(c.vendas), BRL(c.kitPrice), BRL(c.fat),
        BRL(c.comV), BRL(c.fixV), BRL(c.freteV), BRL(c.nfV), BRL(c.cost), BRL(c.lucro), `${c.margem.toFixed(0)}%`];
    }).filter(Boolean);
    if (!rows.length) return;
    const ps = calc.perStore[st.id] || { vendas: 0, fat: 0, lucro: 0 };
    const m = ps.fat ? ps.lucro / ps.fat * 100 : 0;
    rows.push([plain(`Subtotal ${st.name}`), String(ps.vendas), "", BRL(ps.fat), "", "", "", "", "", BRL(ps.lucro), `${m.toFixed(0)}%`]);

    y = pdfEnsureSpace(doc, y, 34);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
    doc.text(plain(`${st.name} — ${MPLABEL[st.platform] || st.platform} (${Math.round(Number(mix[st.id]) || 0)}% do mix)`), PDF_M, y);
    y += 2;

    autoTable(doc, {
      startY: y, margin: { left: PDF_M, right: PDF_M },
      head: [["Produto", "Vendas", "Preço kit", "Faturam.", "Comissão", "Taxa fixa", "Frete", "NF", "Custo", "Lucro líq.", "Margem"]],
      body: rows,
      styles: { fontSize: 7.5, halign: "right", cellPadding: 1.2 },
      headStyles: { fillColor: [235, 238, 245], textColor: 30, halign: "right" },
      columnStyles: { 0: { halign: "left", cellWidth: 72 } },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const sub = d.row.index === rows.length - 1;
        if (sub) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = [235, 235, 235]; }
        else if (d.column.index >= 4 && d.column.index <= 8) d.cell.styles.textColor = RED;
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  });

  y = pdfEnsureSpace(doc, y, 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRAY);
  const nota = doc.splitTextToSize(plain(
    "Fórmula: Lucro = Faturamento − Comissão% − Taxa fixa×vendas − Frete − NF% − (Custo médio × vendas × kit). Faturamento = preço do kit × vendas."
  ), PDF_W - PDF_M * 2);
  doc.text(nota, PDF_M, y);
}

function buildPdfDoc({ capa = null, cover = null, name, subtitle, calc, stores, products, mix }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  if (capa) pdfCapa(doc, capa);
  if (cover) pdfCover(doc, cover);
  pdfReport(doc, { name, subtitle, calc, stores, products, mix });
  return doc;
}

const pdfFileName = (s) => {
  const base = String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return `${base || "simulacao"}.pdf`;
};

export default function Simulator() {
  const [base, setBase] = useState(null);
  const [sims, setSims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // list | editor
  const [expandedGroups, setExpandedGroups] = useState({}); // group_id -> bool
  const [pdfBusy, setPdfBusy] = useState(null); // sim id gerando PDF
  const toast = useAppToast();

  const [name, setName] = useState("Novo cenário");
  const [mix, setMix] = useState({});       // store_id -> %
  const [params, setParams] = useState({}); // store_id -> {com, nf, precoAjuste}
  const [items, setItems] = useState({});   // `${store}:${product}` -> {kit, unit_price, fixa, frete_type, frete_value}
  const [selection, setSelection] = useState({}); // store_id -> [product_id...] (produtos na visão da loja)
  const [snapMeta, setSnapMeta] = useState(null); // when opening a saved snapshot (frozen stores/products + group)

  const subtle = useColorModeValue("gray.500", "gray.400");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const paramBg = useColorModeValue("gray.50", "gray.700");
  const versionBg = useColorModeValue("gray.50", "gray.750");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([fetchSimulationBase(), fetchSimulations()]);
      setBase(b); setSims(s);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar", description: e.message });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const stores = snapMeta?.stores || base?.stores || [];
  const products = snapMeta?.products || base?.products || [];
  const feeBands = base?.feeBands || [];

  // Agrupa versões: 1 card por simulado (group_id), com histórico dentro
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of sims) {
      const g = s.group_id || s.id;
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(s);
    }
    return [...map.entries()].map(([gid, versions]) => {
      versions.sort((a, b) => (b.version || 0) - (a.version || 0) || new Date(b.created_at) - new Date(a.created_at));
      return { gid, latest: versions[0], versions };
    }).sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));
  }, [sims]);

  function seedFromBase() {
    if (!base) return;
    const n = base.stores.length || 1;
    const per = Math.floor(100 / n);
    const mx = {}; base.stores.forEach((s, i) => { mx[s.id] = per + (i === 0 ? 100 - per * n : 0); });
    const pr = {}; base.stores.forEach(s => { pr[s.id] = { nf: Number(s.nf_pct) || 0, precoAjuste: 0 }; });
    const it = {};
    base.stores.forEach(s => base.products.forEach(p => {
      const row = base.prices.find(x => x.store_id === s.id && x.product_id === p.id);
      const kit = Number(row?.kit_qty) || p.default_kit_qty || 1;
      const unit = Number(row?.unit_price) || 0;
      // Comissão e taxa fixa sugeridas pela faixa (Canais & Taxas) do preço do kit
      const fee = resolveFee(base.feeBands, s.platform, unit * kit);
      it[key(s.id, p.id)] = { kit, unit_price: unit, com: fee.com, fixa: fee.fixa, frete_type: row?.frete_type || "none", frete_value: Number(row?.frete_value) || 0 };
    }));
    const sel = {}; base.stores.forEach(s => { sel[s.id] = base.products.map(p => p.id); });
    setName("Novo cenário"); setMix(mx); setParams(pr); setItems(it); setSelection(sel); setSnapMeta(null); setView("editor");
  }

  async function openSaved(id) {
    try {
      const s = await fetchSimulation(id);
      const d = s.data || {};
      // Cenários antigos não têm seleção salva: todos os produtos ficam na visão
      const sel = {};
      (d.stores || []).forEach(st => { sel[st.id] = d.selection?.[st.id] ?? (d.products || []).map(p => p.id); });
      // Cenários antigos guardavam a comissão na loja: materializa no item para exibir/editar
      const its = {};
      Object.entries(d.items || {}).forEach(([k, v]) => {
        its[k] = hasVal(v?.com) ? v : { ...v, com: Number(d.params?.[k.split(":")[0]]?.com) || 0 };
      });
      setName(s.name); setMix(d.mix || {}); setParams(d.params || {}); setItems(its); setSelection(sel);
      setSnapMeta({ stores: d.stores || [], products: d.products || [], group_id: s.group_id || s.id, version: s.version });
      setView("editor");
    } catch (e) { toast({ status: "error", title: "Erro ao abrir cenário", description: e.message }); }
  }

  // ─── Cálculo ────────────────────────────────────────────────────────────────
  const calc = useMemo(() => computeCalc(stores, products, mix, params, items, selection), [stores, products, mix, params, items, selection]);

  const mixSum = stores.reduce((s, st) => s + (Number(mix[st.id]) || 0), 0);

  // Ao mudar preço/kit, re-sugere comissão e taxa fixa pela faixa de Canais & Taxas
  // do novo preço do kit (se houver faixa cadastrada); ambos continuam editáveis.
  const setItem = (s, p, field, value) => setItems(prev => {
    const k = key(s, p);
    const next = { ...prev[k], [field]: value };
    if (field === "unit_price" || field === "kit") {
      const st = stores.find(x => x.id === s);
      const band = st && findBand(feeBands, st.platform, (Number(next.unit_price) || 0) * (Number(next.kit) || 1));
      if (band) { next.com = Number(band.commission_pct); next.fixa = Number(band.fixed_per_sale); }
    }
    return { ...prev, [k]: next };
  });
  const setParam = (s, field, value) => setParams(prev => ({ ...prev, [s]: { ...prev[s], [field]: value } }));

  // Produtos na visão de uma loja (fallback: todos, p/ cenários antigos sem seleção)
  const selFor = (sid) => selection[sid] ?? products.map(p => p.id);
  const addProduct = (sid, pid) => setSelection(prev => ({ ...prev, [sid]: [...(prev[sid] ?? products.map(p => p.id)), Number(pid)] }));
  const addAllProducts = (sid) => setSelection(prev => ({ ...prev, [sid]: products.map(p => p.id) }));
  const removeProduct = (sid, pid) => setSelection(prev => ({ ...prev, [sid]: (prev[sid] ?? products.map(p => p.id)).filter(id => Number(id) !== Number(pid)) }));

  async function save() {
    try {
      const data = {
        mix, params, items, selection,
        stores: stores.map(s => ({ id: s.id, name: s.name, platform: s.platform })),
        products: products.map(p => ({ id: p.id, codigo: p.codigo, descricao: p.descricao, saldo: p.saldo, avg_cost: p.avg_cost })),
      };
      await createSimulation({ name, mode: "mix", totals: calc.totals, data, group_id: snapMeta?.group_id || null });
      toast({ status: "success", title: snapMeta?.group_id ? "Nova versão salva" : "Cenário salvo" });
      setView("list"); load();
    } catch (e) { toast({ status: "error", title: "Erro ao salvar", description: e.message }); }
  }
  async function dup(id) { try { await duplicateSimulation(id); load(); } catch (e) { toast({ status: "error", title: "Erro", description: e.message }); } }
  async function delVersion(id) { if (!window.confirm("Excluir esta versão?")) return; try { await deleteSimulation(id); load(); } catch (e) { toast({ status: "error", title: "Erro", description: e.message }); } }
  async function delGroup(g) {
    const msg = g.versions.length > 1 ? `Excluir "${g.latest.name}" e todas as ${g.versions.length} versões?` : "Excluir este cenário?";
    if (!window.confirm(msg)) return;
    try { await deleteSimulationGroup(g.gid); load(); } catch (e) { toast({ status: "error", title: "Erro", description: e.message }); }
  }

  // PDF do editor (estado atual em edição) — gera o arquivo e baixa, sem sair da tela
  async function printPDF() {
    try {
      const logo = await loadCompanyLogo();
      const capa = { title: "Simulação de Cenário", subtitle: `${name} · ${new Date().toLocaleString("pt-BR")}`, logo };
      const doc = buildPdfDoc({ capa, name, subtitle: new Date().toLocaleString("pt-BR"), calc, stores, products, mix });
      doc.save(pdfFileName(name));
      toast({ status: "success", title: "PDF baixado", description: "Abra pelo leitor de PDF do aparelho (no iPhone: ícone de downloads do Safari ou app Arquivos)." });
    } catch (e) {
      toast({ status: "error", title: "Erro ao gerar PDF", description: e.message });
    }
  }

  // PDF de um cenário salvo: capa de resumo (diff vs. versão inicial) + relatório
  async function pdfSaved(row, group) {
    setPdfBusy(row.id);
    try {
      const cur = await fetchSimulation(row.id);
      const curD = cur.data || {};
      const curCalc = computeCalc(curD.stores || [], curD.products || [], curD.mix || {}, curD.params || {}, curD.items || {}, curD.selection || null);

      let cover = null;
      const v1 = group.versions[group.versions.length - 1]; // menor versão = inicial
      if (v1 && v1.id !== row.id) {
        const ini = await fetchSimulation(v1.id);
        const iniD = ini.data || {};
        const iniCalc = computeCalc(iniD.stores || [], iniD.products || [], iniD.mix || {}, iniD.params || {}, iniD.items || {}, iniD.selection || null);
        cover = {
          name: cur.name, version: cur.version || 1, createdAt: cur.created_at,
          iniVersion: ini.version || 1, iniCreatedAt: ini.created_at,
          changes: diffVersions(iniD, curD),
          bullets: buildAnalysis(iniD, curD, iniCalc, curCalc),
          iniTotals: iniCalc.totals, curTotals: curCalc.totals,
        };
      }
      const logo = await loadCompanyLogo();
      const doc = buildPdfDoc({
        capa: {
          title: "Simulação de Cenário",
          subtitle: `${cur.name} · v${cur.version || 1} · ${new Date(cur.created_at).toLocaleString("pt-BR")}`,
          logo,
        },
        cover,
        name: cur.name,
        subtitle: `v${cur.version || 1} · ${new Date(cur.created_at).toLocaleString("pt-BR")}`,
        calc: curCalc, stores: curD.stores || [], products: curD.products || [], mix: curD.mix || {},
      });
      doc.save(pdfFileName(`${cur.name}_v${cur.version || 1}`));
      toast({ status: "success", title: "PDF baixado", description: "Abra pelo leitor de PDF do aparelho (no iPhone: ícone de downloads do Safari ou app Arquivos)." });
    } catch (e) {
      toast({ status: "error", title: "Erro ao gerar PDF", description: e.message });
    } finally { setPdfBusy(null); }
  }

  if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;

  // ─── LISTA ──────────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <Box>
        <Text fontSize="xl" fontWeight="bold" mb={1}>Simulador de cenários</Text>
        <Text fontSize="sm" color={subtle} mb={4}>Distribua as vendas entre as lojas e veja o lucro líquido. Cada salvamento de um cenário aberto vira uma nova versão do mesmo simulado.</Text>
        <Button colorScheme="blue" mb={4} onClick={seedFromBase} isDisabled={!base?.products?.length}>+ Novo cenário</Button>
        {!base?.products?.length && <Text fontSize="sm" color="orange.500" mb={4}>Sem produtos com saldo. Cadastre estoque/custo antes.</Text>}
        {!groups.length ? (
          <Text fontSize="sm" color={subtle}>Nenhum cenário salvo ainda.</Text>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
            {groups.map(g => {
              const s = g.latest;
              const expanded = !!expandedGroups[g.gid];
              const older = g.versions.slice(1);
              return (
                <Box key={g.gid} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4}>
                  <Flex align="center" gap={2}>
                    <Text fontWeight="bold" noOfLines={1}>{s.name}</Text>
                    {g.versions.length > 1 && <Badge colorScheme="purple" flexShrink={0}>v{s.version}</Badge>}
                  </Flex>
                  <Text fontSize="xs" color={subtle} mb={2}>{new Date(s.created_at).toLocaleString("pt-BR")}</Text>
                  <Text fontSize="xl" fontWeight="bold" color={s.total_lucro >= 0 ? "green.500" : "red.500"}>{BRL(s.total_lucro)}</Text>
                  <Text fontSize="xs" color={subtle} mb={3}>lucro líquido · {s.total_vendas} vendas</Text>
                  <Flex gap={2} wrap="wrap">
                    <Button size="xs" colorScheme="blue" variant="outline" onClick={() => openSaved(s.id)}>Abrir</Button>
                    <Button size="xs" colorScheme="teal" variant="outline" isLoading={pdfBusy === s.id} onClick={() => pdfSaved(s, g)}>PDF</Button>
                    <Button size="xs" variant="outline" onClick={() => dup(s.id)}>Duplicar</Button>
                    <Button size="xs" colorScheme="red" variant="outline" onClick={() => delGroup(g)}>Excluir</Button>
                  </Flex>
                  {older.length > 0 && (
                    <Box mt={3}>
                      <Button size="xs" variant="ghost" color={subtle} onClick={() => setExpandedGroups(p => ({ ...p, [g.gid]: !expanded }))}>
                        {expanded ? "▾" : "▸"} {older.length} versão(ões) anterior(es)
                      </Button>
                      {expanded && (
                        <Box mt={2} borderWidth="1px" borderColor={border} borderRadius="md" bg={versionBg} p={2}>
                          {older.map(v => (
                            <Flex key={v.id} align="center" justify="space-between" gap={2} py={1.5} wrap="wrap">
                              <Box minW={0}>
                                <Text fontSize="xs"><Badge mr={1}>v{v.version}</Badge>{new Date(v.created_at).toLocaleString("pt-BR")}</Text>
                                <Text fontSize="xs" fontWeight="bold" color={v.total_lucro >= 0 ? "green.500" : "red.500"}>{BRL(v.total_lucro)} · {v.total_vendas} vendas</Text>
                              </Box>
                              <Flex gap={1} flexShrink={0}>
                                <Button size="xs" variant="ghost" colorScheme="blue" onClick={() => openSaved(v.id)}>Abrir</Button>
                                <Button size="xs" variant="ghost" colorScheme="teal" isLoading={pdfBusy === v.id} onClick={() => pdfSaved(v, g)}>PDF</Button>
                                <Button size="xs" variant="ghost" colorScheme="red" onClick={() => delVersion(v.id)}>✕</Button>
                              </Flex>
                            </Flex>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </SimpleGrid>
        )}
      </Box>
    );
  }

  // ─── EDITOR ─────────────────────────────────────────────────────────────────
  return (
    <Box pb="90px">
      <Flex align="center" gap={3} mb={4} wrap="wrap">
        <Button size="sm" variant="outline" onClick={() => setView("list")}>← Cenários</Button>
        <Input maxW="320px" fontWeight="bold" value={name} onChange={e => setName(e.target.value)} />
        {snapMeta?.version && <Badge colorScheme="purple">editando a partir da v{snapMeta.version}</Badge>}
        <Button size="sm" variant="outline" onClick={printPDF} ml="auto">⬇️ Baixar PDF</Button>
      </Flex>

      {/* Mix por loja */}
      <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4} mb={4}>
        <Text fontWeight="semibold" mb={1}>Mix de vendas por loja</Text>
        <Text fontSize="xs" color={subtle} mb={3}>% das vendas em cada loja; as peças do estoque são distribuídas por esse mix.</Text>
        <SimpleGrid columns={{ base: 2, md: 4, lg: 7 }} spacing={2} mb={3}>
          {stores.map(s => (
            <Box key={s.id}>
              <Text fontSize="xs" color={subtle} noOfLines={1}>{s.name} · {MPLABEL[s.platform]?.slice(0, 3) || s.platform}</Text>
              <Input size="sm" type="number" step="5" value={mix[s.id] ?? 0} onChange={e => setMix(m => ({ ...m, [s.id]: e.target.value }))} />
            </Box>
          ))}
        </SimpleGrid>
        <Flex h="16px" borderRadius="8px" overflow="hidden" bg="gray.100" mb={2}>
          {stores.map((s, i) => { const w = mixSum ? (Number(mix[s.id]) || 0) / mixSum * 100 : 0; return w > 0 ? <Box key={s.id} w={`${w}%`} bg={COLORS[i % COLORS.length]} /> : null; })}
        </Flex>
        <Badge colorScheme={mixSum === 100 ? "green" : "orange"}>Soma = {mixSum}%{mixSum === 100 ? " ✓" : " — ajuste para 100%"}</Badge>
      </Box>

      {/* Resumo */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={4}>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}><StatLabel fontSize="xs">Vendas (kits)</StatLabel><StatNumber fontSize="lg">{calc.totals.vendas}</StatNumber></Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}><StatLabel fontSize="xs">Faturamento</StatLabel><StatNumber fontSize="lg">{BRL(calc.totals.fat)}</StatNumber></Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}><StatLabel fontSize="xs">Lucro líquido</StatLabel><StatNumber fontSize="lg" color={calc.totals.lucro >= 0 ? "green.500" : "red.500"}>{BRL(calc.totals.lucro)}</StatNumber></Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}><StatLabel fontSize="xs">Margem</StatLabel><StatNumber fontSize="lg">{calc.totals.margem.toFixed(0)}%</StatNumber></Stat>
      </SimpleGrid>

      {/* Por loja */}
      <Accordion allowMultiple>
        {stores.map(s => {
          const ps = calc.perStore[s.id] || { vendas: 0, fat: 0, lucro: 0 };
          const m = ps.fat ? ps.lucro / ps.fat * 100 : 0;
          const pp = params[s.id] || { com: 0, nf: 0, precoAjuste: 0 };
          const selSet = new Set(selFor(s.id).map(Number));
          const visProducts = products.filter(p => selSet.has(Number(p.id)));
          const offProducts = products.filter(p => !selSet.has(Number(p.id)));
          return (
            <AccordionItem key={s.id} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" mb={2}>
              <AccordionButton>
                <Box flex="1" textAlign="left"><Badge colorScheme="blue" mr={2}>{s.name}</Badge><Text as="span" fontSize="xs" color={subtle}>{MPLABEL[s.platform]} · {Math.round(Number(mix[s.id]) || 0)}% · {ps.vendas} vendas · {visProducts.length} produto(s)</Text></Box>
                <Text fontSize="sm" mr={3} color={ps.lucro >= 0 ? "green.500" : "red.500"} fontWeight="bold">{BRL(ps.lucro)} · {m.toFixed(0)}%</Text>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel>
                <Flex gap={4} mb={3} wrap="wrap" bg={paramBg} p={3} borderRadius="md">
                  <Box><Text fontSize="xs" color={subtle}>NF % (CNPJ)</Text><Input size="sm" maxW="90px" type="number" step="0.5" value={pp.nf ?? 0} onChange={e => setParam(s.id, "nf", e.target.value)} /></Box>
                  <Box><Text fontSize="xs" color={subtle}>Preço ajuste %</Text><Input size="sm" maxW="90px" type="number" step="1" value={pp.precoAjuste ?? 0} onChange={e => setParam(s.id, "precoAjuste", e.target.value)} /></Box>
                  <Text fontSize="xs" color={subtle} alignSelf="end" pb={1.5}>Comissão e taxa fixa ficam em cada produto, sugeridas pela faixa de Canais &amp; Taxas.</Text>
                </Flex>

                {/* Produtos na visão desta loja */}
                <Flex gap={2} mb={3} align="center" wrap="wrap">
                  <Select
                    size="sm" maxW="320px" value=""
                    placeholder={offProducts.length ? "+ Adicionar produto…" : "Todos os produtos na visão"}
                    isDisabled={!offProducts.length}
                    onChange={e => e.target.value && addProduct(s.id, e.target.value)}
                  >
                    {offProducts.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => addAllProducts(s.id)} isDisabled={!offProducts.length}>
                    + Todos ({offProducts.length})
                  </Button>
                </Flex>

                {!visProducts.length && (
                  <Text fontSize="sm" color={subtle} mb={2}>Nenhum produto na visão desta loja — use “+ Adicionar produto” acima.</Text>
                )}
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
                  {visProducts.map(p => {
                    const it = items[key(s.id, p.id)] || {};
                    const c = calc.cell[key(s.id, p.id)] || {};
                    return (
                      <Box key={p.id} borderWidth="1px" borderColor={border} borderRadius="md" p={3}>
                        <Flex align="start" justify="space-between" gap={2}>
                          <Text fontWeight="bold" fontSize="sm">{p.codigo} · {p.descricao}</Text>
                          <Button
                            size="xs" variant="ghost" colorScheme="red" flexShrink={0} mt="-4px" mr="-6px"
                            title="Remover produto da visão desta loja"
                            onClick={() => removeProduct(s.id, p.id)}
                          >✕</Button>
                        </Flex>
                        <Text fontSize="xs" color={subtle} mb={2}>Custo {BRL(p.avg_cost)}/pç · {c.pieces || 0} pç → <b>{c.vendas || 0} vendas</b></Text>
                        <SimpleGrid columns={2} spacing={2} mb={2}>
                          <Box><Text fontSize="xs" color={subtle}>Preço unit./pç</Text><Input size="sm" type="number" step="0.01" value={it.unit_price ?? 0} onChange={e => setItem(s.id, p.id, "unit_price", e.target.value)} /></Box>
                          <Box><Text fontSize="xs" color={subtle}>Kit</Text><Input size="sm" type="number" min={1} value={it.kit ?? 1} onChange={e => setItem(s.id, p.id, "kit", e.target.value)} /></Box>
                          <Box><Text fontSize="xs" color={subtle}>Comissão %</Text><Input size="sm" type="number" step="0.5" value={it.com ?? 0} onChange={e => setItem(s.id, p.id, "com", e.target.value)} /></Box>
                          <Box><Text fontSize="xs" color={subtle}>Taxa fixa/venda</Text><Input size="sm" type="number" step="0.01" value={it.fixa ?? 0} onChange={e => setItem(s.id, p.id, "fixa", e.target.value)} /></Box>
                          <Box>
                            <Text fontSize="xs" color={subtle}>Frete</Text>
                            <Select size="sm" value={it.frete_type || "none"} onChange={e => setItem(s.id, p.id, "frete_type", e.target.value)}>
                              <option value="none">Sem</option><option value="pct">% preço</option><option value="fix">Fixo R$</option>
                            </Select>
                          </Box>
                          {(it.frete_type && it.frete_type !== "none") && (
                            <Box><Text fontSize="xs" color={subtle}>Valor frete</Text><Input size="sm" type="number" step="0.01" value={it.frete_value ?? 0} onChange={e => setItem(s.id, p.id, "frete_value", e.target.value)} /></Box>
                          )}
                        </SimpleGrid>
                        <Cascata c={c} p={p} it={it} pp={pp} kit={Number(it.kit) || 1} subtle={subtle} border={border} />
                        <Flex justify="space-between" align="center">
                          <Text fontSize="xs" color={subtle}>Preço kit {BRL(c.kitPrice)}</Text>
                          <Badge colorScheme={(c.lucro || 0) >= 0 ? "green" : "red"} fontSize="sm">{BRL(c.lucro)} · {(c.margem || 0).toFixed(0)}%</Badge>
                        </Flex>
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Barra fixa */}
      <Flex position="sticky" bottom={0} mt={4} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3} gap={6} align="center" wrap="wrap" boxShadow="0 -4px 16px rgba(0,0,0,.06)">
        <Box><Text fontSize="xs" color={subtle}>Lucro líquido total</Text><Text fontSize="lg" fontWeight="bold" color={calc.totals.lucro >= 0 ? "green.500" : "red.500"}>{BRL(calc.totals.lucro)}</Text></Box>
        <Box><Text fontSize="xs" color={subtle}>Margem</Text><Text fontSize="lg" fontWeight="bold">{calc.totals.margem.toFixed(0)}%</Text></Box>
        <Button colorScheme="blue" ml="auto" onClick={save} isDisabled={!name.trim()}>💾 {snapMeta?.group_id ? "Salvar nova versão" : "Salvar cenário"}</Button>
      </Flex>
    </Box>
  );
}

// Memória de cálculo (cascata) de um card
function Cascata({ c, p, it, pp, kit, subtle, border }) {
  const Row = ({ l, v, ded, tot }) => (
    <Flex justify="space-between" fontWeight={tot ? "bold" : "normal"} borderTopWidth={tot ? "1px" : 0} borderColor={border} pt={tot ? 1 : 0} mt={tot ? 1 : 0}>
      <Text as="span" color={ded ? "red.500" : (tot ? undefined : subtle)}>{l}</Text>
      <Text as="span" color={ded ? "red.500" : (tot ? (c.lucro >= 0 ? "green.600" : "red.500") : undefined)}>{v}</Text>
    </Flex>
  );
  if (!c || !c.vendas) {
    return <Box fontSize="xs" color={subtle} borderTopWidth="1px" borderColor={border} pt={2} mb={2}>Sem vendas neste mix (0 kits) — nada a apurar.</Box>;
  }
  const freteLbl = it.frete_type === "pct" ? `− Frete ${it.frete_value || 0}% do preço`
    : it.frete_type === "fix" ? `− Frete ${BRL(it.frete_value || 0)} × ${c.vendas}`
    : "− Frete (sem)";
  return (
    <Box fontSize="xs" mb={2} borderTopWidth="1px" borderColor={border} pt={2}>
      <Row l={`Faturamento (${c.vendas} × ${BRL(c.kitPrice)})`} v={BRL(c.fat)} />
      <Row l={`− Comissão ${c.comPct ?? pp.com ?? 0}%`} v={`− ${BRL(c.comV)}`} ded />
      <Row l={`− Taxa fixa (${c.vendas} × ${BRL(it.fixa || 0)})`} v={`− ${BRL(c.fixV)}`} ded />
      <Row l={freteLbl} v={`− ${BRL(c.freteV)}`} ded />
      <Row l={`− NF ${pp.nf || 0}%`} v={`− ${BRL(c.nfV)}`} ded />
      <Row l={`− Custo (${c.vendas * kit} pç × ${BRL(p.avg_cost)})`} v={`− ${BRL(c.cost)}`} ded />
      <Row l="= Lucro líquido" v={BRL(c.lucro)} tot />
    </Box>
  );
}
