import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Badge, Box, Button, Flex, Input, Select, SimpleGrid, Spinner, Stat, StatLabel,
  StatNumber, Text, useColorModeValue, Accordion, AccordionItem, AccordionButton,
  AccordionPanel, AccordionIcon,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import {
  fetchSimulationBase, fetchSimulations, fetchSimulation, createSimulation,
  duplicateSimulation, deleteSimulation, deleteSimulationGroup,
} from "../api";

const BRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctBR = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dBRL = (n) => `${n >= 0 ? "+" : "−"}${BRL(Math.abs(n))}`;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MPLABEL = { mercadolivre: "Mercado Livre", shopee: "Shopee", shein: "Shein", tiktok: "TikTok" };
const COLORS = ["#3182ce", "#dd6b20", "#805ad5", "#38a169", "#d53f8c", "#319795", "#718096"];

function resolveFee(bands, platform, kitPrice) {
  const b = bands.find(x => x.marketplace === platform && Number(x.price_min) <= kitPrice && (x.price_max == null || kitPrice <= Number(x.price_max)));
  return b ? { com: Number(b.commission_pct), fixa: Number(b.fixed_per_sale) } : { com: 0, fixa: 0 };
}
function topCommission(bands, platform) {
  const list = bands.filter(x => x.marketplace === platform);
  const top = list.find(x => x.price_max == null) || list[list.length - 1];
  return top ? Number(top.commission_pct) : 0;
}
const key = (s, p) => `${s}:${p}`;

// ─── Cálculo puro do cenário (usado no editor e no PDF de cenários salvos) ────
function computeCalc(stores, products, mix, params, items) {
  const perStore = {}; let gV = 0, gF = 0, gL = 0;
  const cell = {};
  stores.forEach(s => { perStore[s.id] = { vendas: 0, fat: 0, lucro: 0 }; });
  stores.forEach(s => {
    const pp = params[s.id] || { com: 0, nf: 0, precoAjuste: 0 };
    products.forEach(p => {
      const it = items[key(s.id, p.id)] || { kit: 1, unit_price: 0, fixa: 0, frete_type: "none", frete_value: 0 };
      const kit = Number(it.kit) || 1;
      const pieces = Math.round((Number(p.saldo) || 0) * (Number(mix[s.id]) || 0) / 100);
      const kitPrice = Number(it.unit_price) * kit * (1 + (Number(pp.precoAjuste) || 0) / 100);
      const vendas = Math.floor(pieces / kit);
      const fat = kitPrice * vendas;
      const comV = fat * (Number(pp.com) || 0) / 100;
      const fixV = (Number(it.fixa) || 0) * vendas;
      const freteV = it.frete_type === "pct" ? fat * (Number(it.frete_value) || 0) / 100 : it.frete_type === "fix" ? (Number(it.frete_value) || 0) * vendas : 0;
      const nfV = fat * (Number(pp.nf) || 0) / 100;
      const cost = (Number(p.avg_cost) || 0) * vendas * kit;
      const lucro = fat - comV - fixV - freteV - nfV - cost;
      cell[key(s.id, p.id)] = { pieces, kitPrice, vendas, fat, comV, fixV, freteV, nfV, cost, lucro, margem: fat ? lucro / fat * 100 : 0 };
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
  const changes = { mix: [], params: [], items: [], base: [] };
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

  // Parâmetros por loja
  const PARAM_LABELS = { com: ["Comissão", "%"], nf: ["NF", "%"], precoAjuste: ["Ajuste de preço", "%"] };
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

// ─── Montagem do PDF (relatório + capa opcional) ─────────────────────────────
const REPORT_CSS = `*{font-family:Arial,sans-serif}h1{font-size:18px;margin:0 0 2px}.meta{color:#555;font-size:12px;margin-bottom:10px}
  .summary{display:flex;gap:26px;margin:10px 0 16px;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:12px;color:#555}.summary b{display:block;font-size:16px;color:#111}
  h3{font-size:13px;margin:16px 0 6px;background:#eef;border:1px solid #cdf;padding:5px 8px;border-radius:5px}h3 .s{font-weight:normal;color:#555}
  table.rep{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}.rep th{background:#eee;border:1px solid #ccc;padding:4px 6px;text-align:right}.rep th:first-child{text-align:left}
  .rep td{border:1px solid #ddd;padding:3px 6px}.rep td.n{text-align:right}.rep td.d{color:#c0392b}.rep tr.sub td{background:#f6f6f6;font-weight:bold;border-top:2px solid #999}
  table.rep,tr{break-inside:avoid}@page{size:A4 landscape;margin:10mm}
  .cover{page-break-after:always}.cover h1{font-size:20px}.cover h2{font-size:14px;margin:16px 0 6px;border-bottom:2px solid #3182ce;padding-bottom:3px;color:#1a365d}
  .cover ul{margin:4px 0 10px 18px;padding:0;font-size:12px;line-height:1.7}.cover li{margin-bottom:2px}
  table.kpi{border-collapse:collapse;font-size:12px;margin:8px 0 4px;min-width:60%}.kpi th{background:#1a365d;color:#fff;padding:5px 12px;text-align:right}.kpi th:first-child{text-align:left}
  .kpi td{border:1px solid #ccc;padding:5px 12px;text-align:right}.kpi td:first-child{text-align:left;font-weight:bold;background:#f5f7fa}
  .kpi .pos{color:#276749;font-weight:bold}.kpi .neg{color:#c0392b;font-weight:bold}
  .tag{display:inline-block;background:#eef;border:1px solid #cdf;border-radius:4px;padding:1px 8px;font-size:11px;color:#333;margin-left:6px}`;

function buildStoreTables(calc, stores, products, mix) {
  return stores.map(st => {
    const pRows = products.map(p => {
      const c = calc.cell[key(st.id, p.id)]; if (!c || c.vendas === 0) return "";
      return `<tr><td>${esc(p.codigo)} · ${esc(p.descricao)}</td><td class=n>${c.vendas}</td><td class=n>${BRL(c.kitPrice)}</td><td class=n>${BRL(c.fat)}</td><td class="n d">${BRL(c.comV)}</td><td class="n d">${BRL(c.fixV)}</td><td class="n d">${BRL(c.freteV)}</td><td class="n d">${BRL(c.nfV)}</td><td class="n d">${BRL(c.cost)}</td><td class=n><b>${BRL(c.lucro)}</b></td><td class=n>${c.margem.toFixed(0)}%</td></tr>`;
    }).join("");
    const ps = calc.perStore[st.id] || { vendas: 0, fat: 0, lucro: 0 };
    const m = ps.fat ? ps.lucro / ps.fat * 100 : 0;
    if (!pRows) return "";
    return `<h3>${esc(st.name)} — ${MPLABEL[st.platform] || esc(st.platform)} <span class=s>(${Math.round(Number(mix[st.id]) || 0)}% do mix)</span></h3>
      <table class=rep><thead><tr><th>Produto</th><th>Vendas</th><th>Preço kit</th><th>Faturam.</th><th>Comissão</th><th>Taxa fixa</th><th>Frete</th><th>NF</th><th>Custo</th><th>Lucro líq.</th><th>Margem</th></tr></thead>
      <tbody>${pRows}<tr class=sub><td>Subtotal ${esc(st.name)}</td><td class=n>${ps.vendas}</td><td></td><td class=n>${BRL(ps.fat)}</td><td colspan=5></td><td class=n><b>${BRL(ps.lucro)}</b></td><td class=n>${m.toFixed(0)}%</td></tr></tbody></table>`;
  }).join("");
}

function buildCoverHTML({ name, version, createdAt, iniVersion, iniCreatedAt, changes, bullets, iniTotals, curTotals }) {
  const kpiRow = (label, a, b, fmtFn, deltaFmt) => {
    const d = b - a;
    const cls = d > 0 ? "pos" : d < 0 ? "neg" : "";
    return `<tr><td>${label}</td><td>${fmtFn(a)}</td><td>${fmtFn(b)}</td><td class="${cls}">${deltaFmt(d)}</td></tr>`;
  };
  const section = (title, arr, emptyMsg) =>
    `<h2>${title}</h2>` + (arr.length ? `<ul>${arr.map(c => `<li>${c}</li>`).join("")}</ul>` : `<ul><li style="color:#777">${emptyMsg}</li></ul>`);
  const nChanges = changes.mix.length + changes.params.length + changes.items.length + changes.base.length;
  return `<div class=cover>
    <h1>Resumo da simulação — ${esc(name)} <span class=tag>v${version}</span></h1>
    <div class=meta>Versão v${version} de ${new Date(createdAt).toLocaleString("pt-BR")} · comparada com o cenário inicial (v${iniVersion} de ${new Date(iniCreatedAt).toLocaleString("pt-BR")}) · ${nChanges} alteração(ões) de configuração</div>
    <table class=kpi>
      <thead><tr><th>Indicador</th><th>Inicial (v${iniVersion})</th><th>Esta versão (v${version})</th><th>Δ</th></tr></thead>
      <tbody>
        ${kpiRow("Vendas (kits)", iniTotals.vendas, curTotals.vendas, v => v, d => (d >= 0 ? "+" : "") + d)}
        ${kpiRow("Faturamento", iniTotals.fat, curTotals.fat, BRL, dBRL)}
        ${kpiRow("Lucro líquido", iniTotals.lucro, curTotals.lucro, BRL, dBRL)}
        ${kpiRow("Margem", iniTotals.margem, curTotals.margem, v => pctBR(v) + "%", d => (d >= 0 ? "+" : "−") + pctBR(Math.abs(d)) + " pp")}
      </tbody>
    </table>
    ${section("Análise automática", bullets, "Sem variações relevantes.")}
    ${section("Mix de vendas alterado", changes.mix, "Mix inalterado.")}
    ${section("Parâmetros por loja alterados", changes.params, "Comissão, NF e ajuste de preço inalterados.")}
    ${section("Preços & itens alterados", changes.items, "Preços, kits, taxas e fretes inalterados.")}
    ${section("Base de estoque/custo", changes.base, "Mesma base de estoque e custo do cenário inicial.")}
  </div>`;
}

function buildReportDoc({ title, name, subtitle, coverHtml = "", calc, stores, products, mix }) {
  const t = calc.totals;
  return `<!doctype html><html><head><meta charset=utf-8><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body>
    ${coverHtml}
    <h1>Simulação de cenário — Mix de canais (por loja)</h1>
    <div class=meta>Cenário: <b>${esc(name)}</b>${subtitle ? ` · ${subtitle}` : ""}</div>
    <div class=summary><div>Vendas (kits)<b>${t.vendas}</b></div><div>Faturamento<b>${BRL(t.fat)}</b></div><div>Lucro líquido<b>${BRL(t.lucro)}</b></div><div>Margem<b>${t.margem.toFixed(0)}%</b></div></div>
    ${buildStoreTables(calc, stores, products, mix)}
    <div class=meta style="margin-top:14px">Fórmula: Lucro = Faturamento − Comissão% − Taxa fixa×vendas − Frete − NF% − (Custo médio × vendas × kit). Faturamento = preço do kit × vendas.</div>
    </body></html>`;
}

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
    const pr = {}; base.stores.forEach(s => { pr[s.id] = { com: topCommission(base.feeBands, s.platform), nf: Number(s.nf_pct) || 0, precoAjuste: 0 }; });
    const it = {};
    base.stores.forEach(s => base.products.forEach(p => {
      const row = base.prices.find(x => x.store_id === s.id && x.product_id === p.id);
      const kit = Number(row?.kit_qty) || p.default_kit_qty || 1;
      const unit = Number(row?.unit_price) || 0;
      const fixa = resolveFee(base.feeBands, s.platform, unit * kit).fixa;
      it[key(s.id, p.id)] = { kit, unit_price: unit, fixa, frete_type: row?.frete_type || "none", frete_value: Number(row?.frete_value) || 0 };
    }));
    setName("Novo cenário"); setMix(mx); setParams(pr); setItems(it); setSnapMeta(null); setView("editor");
  }

  async function openSaved(id) {
    try {
      const s = await fetchSimulation(id);
      const d = s.data || {};
      setName(s.name); setMix(d.mix || {}); setParams(d.params || {}); setItems(d.items || {});
      setSnapMeta({ stores: d.stores || [], products: d.products || [], group_id: s.group_id || s.id, version: s.version });
      setView("editor");
    } catch (e) { toast({ status: "error", title: "Erro ao abrir cenário", description: e.message }); }
  }

  // ─── Cálculo ────────────────────────────────────────────────────────────────
  const calc = useMemo(() => computeCalc(stores, products, mix, params, items), [stores, products, mix, params, items]);

  const mixSum = stores.reduce((s, st) => s + (Number(mix[st.id]) || 0), 0);

  const setItem = (s, p, field, value) => setItems(prev => ({ ...prev, [key(s, p)]: { ...prev[key(s, p)], [field]: value } }));
  const setParam = (s, field, value) => setParams(prev => ({ ...prev, [s]: { ...prev[s], [field]: value } }));

  async function save() {
    try {
      const data = {
        mix, params, items,
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

  function openPrint(doc) {
    const w = window.open("", "_blank");
    if (!w) { toast({ status: "warning", title: "Permita pop-ups para gerar o PDF" }); return; }
    w.document.write(doc); w.document.close();
    w.onload = () => { w.focus(); w.print(); };
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
  }

  // PDF do editor (estado atual em edição)
  function printPDF() {
    const doc = buildReportDoc({
      title: name, name, subtitle: new Date().toLocaleString("pt-BR"),
      calc, stores, products, mix,
    });
    openPrint(doc);
  }

  // PDF de um cenário salvo: capa de resumo (diff vs. versão inicial) + relatório
  async function pdfSaved(row, group) {
    setPdfBusy(row.id);
    try {
      const cur = await fetchSimulation(row.id);
      const curD = cur.data || {};
      const curCalc = computeCalc(curD.stores || [], curD.products || [], curD.mix || {}, curD.params || {}, curD.items || {});

      let coverHtml = "";
      const v1 = group.versions[group.versions.length - 1]; // menor versão = inicial
      if (v1 && v1.id !== row.id) {
        const ini = await fetchSimulation(v1.id);
        const iniD = ini.data || {};
        const iniCalc = computeCalc(iniD.stores || [], iniD.products || [], iniD.mix || {}, iniD.params || {}, iniD.items || {});
        coverHtml = buildCoverHTML({
          name: cur.name, version: cur.version || 1, createdAt: cur.created_at,
          iniVersion: ini.version || 1, iniCreatedAt: ini.created_at,
          changes: diffVersions(iniD, curD),
          bullets: buildAnalysis(iniD, curD, iniCalc, curCalc),
          iniTotals: iniCalc.totals, curTotals: curCalc.totals,
        });
      }
      const doc = buildReportDoc({
        title: `${cur.name} (v${cur.version || 1})`,
        name: cur.name,
        subtitle: `v${cur.version || 1} · ${new Date(cur.created_at).toLocaleString("pt-BR")}`,
        coverHtml,
        calc: curCalc, stores: curD.stores || [], products: curD.products || [], mix: curD.mix || {},
      });
      openPrint(doc);
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
        <Button size="sm" variant="outline" onClick={printPDF} ml="auto">🖨 Imprimir / PDF</Button>
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
      <Accordion allowMultiple defaultIndex={[0]}>
        {stores.map(s => {
          const ps = calc.perStore[s.id] || { vendas: 0, fat: 0, lucro: 0 };
          const m = ps.fat ? ps.lucro / ps.fat * 100 : 0;
          const pp = params[s.id] || { com: 0, nf: 0, precoAjuste: 0 };
          return (
            <AccordionItem key={s.id} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" mb={2}>
              <AccordionButton>
                <Box flex="1" textAlign="left"><Badge colorScheme="blue" mr={2}>{s.name}</Badge><Text as="span" fontSize="xs" color={subtle}>{MPLABEL[s.platform]} · {Math.round(Number(mix[s.id]) || 0)}% · {ps.vendas} vendas</Text></Box>
                <Text fontSize="sm" mr={3} color={ps.lucro >= 0 ? "green.500" : "red.500"} fontWeight="bold">{BRL(ps.lucro)} · {m.toFixed(0)}%</Text>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel>
                <Flex gap={4} mb={3} wrap="wrap" bg={paramBg} p={3} borderRadius="md">
                  <Box><Text fontSize="xs" color={subtle}>Comissão %</Text><Input size="sm" maxW="90px" type="number" step="0.5" value={pp.com ?? 0} onChange={e => setParam(s.id, "com", e.target.value)} /></Box>
                  <Box><Text fontSize="xs" color={subtle}>NF % (CNPJ)</Text><Input size="sm" maxW="90px" type="number" step="0.5" value={pp.nf ?? 0} onChange={e => setParam(s.id, "nf", e.target.value)} /></Box>
                  <Box><Text fontSize="xs" color={subtle}>Preço ajuste %</Text><Input size="sm" maxW="90px" type="number" step="1" value={pp.precoAjuste ?? 0} onChange={e => setParam(s.id, "precoAjuste", e.target.value)} /></Box>
                </Flex>
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
                  {products.map(p => {
                    const it = items[key(s.id, p.id)] || {};
                    const c = calc.cell[key(s.id, p.id)] || {};
                    return (
                      <Box key={p.id} borderWidth="1px" borderColor={border} borderRadius="md" p={3}>
                        <Text fontWeight="bold" fontSize="sm">{p.codigo} · {p.descricao}</Text>
                        <Text fontSize="xs" color={subtle} mb={2}>Custo {BRL(p.avg_cost)}/pç · {c.pieces || 0} pç → <b>{c.vendas || 0} vendas</b></Text>
                        <SimpleGrid columns={2} spacing={2} mb={2}>
                          <Box><Text fontSize="xs" color={subtle}>Preço unit./pç</Text><Input size="sm" type="number" step="0.01" value={it.unit_price ?? 0} onChange={e => setItem(s.id, p.id, "unit_price", e.target.value)} /></Box>
                          <Box><Text fontSize="xs" color={subtle}>Kit</Text><Input size="sm" type="number" min={1} value={it.kit ?? 1} onChange={e => setItem(s.id, p.id, "kit", e.target.value)} /></Box>
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
      <Row l={`− Comissão ${pp.com || 0}%`} v={`− ${BRL(c.comV)}`} ded />
      <Row l={`− Taxa fixa (${c.vendas} × ${BRL(it.fixa || 0)})`} v={`− ${BRL(c.fixV)}`} ded />
      <Row l={freteLbl} v={`− ${BRL(c.freteV)}`} ded />
      <Row l={`− NF ${pp.nf || 0}%`} v={`− ${BRL(c.nfV)}`} ded />
      <Row l={`− Custo (${c.vendas * kit} pç × ${BRL(p.avg_cost)})`} v={`− ${BRL(c.cost)}`} ded />
      <Row l="= Lucro líquido" v={BRL(c.lucro)} tot />
    </Box>
  );
}
