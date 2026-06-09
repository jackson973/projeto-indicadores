import { useEffect, useMemo, useState } from "react";
import {
  Box, Flex, SimpleGrid, Text, HStack, VStack, Spinner, Badge,
  Button, Select, useColorModeValue,
} from "@chakra-ui/react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import { fetchStockSeparationDashboard, fetchStockSeparationOptions } from "../api";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const COLORS = ["#3b5bdb", "#5c7cfa", "#0ca678", "#7048e8", "#e64980", "#f08c00", "#15aabf", "#f783ac", "#2f9e44"];
const SIZE_ORDER = ["RN", "P", "M", "G", "GG", "XG", "XGG", "1", "2", "3", "4", "6", "8", "10", "12", "14", "16"];
// Cor estável por tamanho (mesmo tamanho = mesma cor em todos os gráficos)
const SIZE_COLORS = {
  RN: "#15aabf", P: "#3b5bdb", M: "#5c7cfa", G: "#0ca678", GG: "#7048e8", XG: "#e64980", XGG: "#f783ac",
  "1": "#f08c00", "2": "#e8590c", "3": "#e64980", "4": "#ae3ec9", "6": "#7048e8", "8": "#4263eb",
  "10": "#1098ad", "12": "#0ca678", "14": "#66a80f", "16": "#f59f00",
};
function sizeColor(s, i = 0) { return SIZE_COLORS[s] || COLORS[i % COLORS.length]; }
function orderSizes(list) {
  return [
    ...SIZE_ORDER.filter(s => list.includes(s)),
    ...list.filter(s => !SIZE_ORDER.includes(s)),
  ];
}

function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function ddmm(iso) { return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ""; }
function addDays(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function nf(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function pct(cur, prev) {
  if (!prev) return cur ? { v: 100, dir: "up" } : { v: 0, dir: "flat" };
  const v = ((cur - prev) / prev) * 100;
  return { v: Math.abs(v), dir: v > 0.5 ? "up" : v < -0.5 ? "down" : "flat" };
}

const RANGES = [
  { key: "today", label: "Hoje", days: 0 },
  { key: "7d", label: "7 dias", days: 6 },
  { key: "30d", label: "30 dias", days: 29 },
  { key: "month", label: "Mês corrente", days: null },
];

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, delta, sub, spark, color = "#3b5bdb" }) {
  const gid = `sp-${label.replace(/[^a-zA-Z0-9]/g, "")}`;
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");
  const deltaColor = { up: "green.500", down: "red.500", flat: "gray.500" };
  const deltaBg = {
    up: useColorModeValue("green.50", "rgba(47,158,68,.14)"),
    down: useColorModeValue("red.50", "rgba(224,49,49,.14)"),
    flat: useColorModeValue("gray.100", "whiteAlpha.200"),
  };
  const arrow = { up: "▲", down: "▼", flat: "●" };
  return (
    <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="xl" p={4} boxShadow="sm">
      <Text fontSize="xs" fontWeight="600" color={subtle} textTransform="uppercase" letterSpacing="0.4px">{label}</Text>
      <Text fontSize="3xl" fontWeight="800" lineHeight="1.1" mt={1} letterSpacing="-1px">{value}</Text>
      <HStack mt={2} spacing={2}>
        {delta && (
          <Badge color={deltaColor[delta.dir]} bg={deltaBg[delta.dir]} borderRadius="full" px={2} py="2px" fontWeight="700">
            {arrow[delta.dir]} {delta.dir === "flat" ? "estável" : `${delta.v.toFixed(1).replace(".", ",")}%`}
          </Badge>
        )}
        {sub && <Text fontSize="xs" color={subtle}>{sub}</Text>}
      </HStack>
      {spark && spark.length > 1 && (
        <Box h="34px" mt={2}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="pcs" stroke={color} strokeWidth={2} fill={`url(#${gid})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
  );
}

function Panel({ title, subtitle, children, h = 320 }) {
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");
  return (
    <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="xl" p={4} boxShadow="sm">
      <Text fontWeight="700" fontSize="md">{title}</Text>
      {subtitle && <Text fontSize="xs" color={subtle} mb={2}>{subtitle}</Text>}
      <Box h={`${h}px`}>{children}</Box>
    </Box>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function StockSeparationDashboard() {
  const subtle = useColorModeValue("gray.500", "gray.400");
  const gridColor = useColorModeValue("#eef1f8", "#2d3748");
  const axisColor = useColorModeValue("#718096", "#a0aec0");
  const tooltipBg = useColorModeValue("#fff", "#1a202c");
  const tooltipBorder = useColorModeValue("#e2e8f0", "#2d3748");
  const heatEmpty = useColorModeValue("#eef1f8", "#2d3748");

  const [rangeKey, setRangeKey] = useState("7d");
  const [productFilter, setProductFilter] = useState("");
  const [familiaFilter, setFamiliaFilter] = useState("");
  const [options, setOptions] = useState({ products: [], familias: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Opções dos filtros (produtos + famílias)
  useEffect(() => {
    let alive = true;
    fetchStockSeparationOptions()
      .then(o => { if (alive) setOptions({ products: o.products || [], familias: o.familias || [] }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Produtos do select: filtrados pela família escolhida (quando houver)
  const productOptions = useMemo(() => (
    familiaFilter ? options.products.filter(p => p.familia === familiaFilter) : options.products
  ), [options.products, familiaFilter]);

  const { from, to } = useMemo(() => {
    const today = toISO(new Date());
    const r = RANGES.find(x => x.key === rangeKey);
    if (r.days === null) return { from: `${today.slice(0, 8)}01`, to: today };
    return { from: addDays(today, -r.days), to: today };
  }, [rangeKey]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr("");
    fetchStockSeparationDashboard(from, to, { product_codigo: productFilter, familia: familiaFilter })
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(e.message || "Erro ao carregar"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to, productFilter, familiaFilter]);

  const tooltipStyle = {
    contentStyle: { background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 10, fontSize: 12 },
    labelStyle: { color: axisColor },
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    if (!data) return [];
    const curMap = Object.fromEntries(data.series.map(r => [r.dia, r.pcs]));
    const prevMap = Object.fromEntries(data.prevSeries.map(r => [r.dia, r.pcs]));
    const len = Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000) + 1;
    const out = [];
    for (let i = 0; i < len; i++) {
      const cd = addDays(from, i), pd = addDays(data.prevPeriod.from, i);
      out.push({ label: ddmm(cd), atual: curMap[cd] || 0, anterior: prevMap[pd] || 0 });
    }
    return out;
  }, [data, from, to]);

  const sparkData = useMemo(() => (data ? data.series.map(r => ({ pcs: r.pcs })) : []), [data]);
  const sizeData = useMemo(() => (data ? data.bySize.map(r => ({ name: r.tamanho, value: r.pcs })) : []), [data]);
  const familyData = useMemo(() => (data ? data.byFamily.slice(0, 8).map(r => ({ name: r.familia, pcs: r.pcs })) : []), [data]);
  // Top produtos empilhados por tamanho
  const topProd = useMemo(() => {
    if (!data) return { rows: [], sizes: [] };
    const top = data.byProduct.slice(0, 8);
    const codes = new Set(top.map(r => r.codigo));
    const ps = (data.productSize || []).filter(r => codes.has(r.codigo));
    const sizes = orderSizes([...new Set(ps.map(r => r.tamanho))]);
    const byCode = {};
    for (const r of ps) (byCode[r.codigo] ||= {})[r.tamanho] = r.pcs;
    const rows = top.map(r => ({
      name: `${r.codigo} ${r.descricao}`.slice(0, 28),
      total: r.pcs,
      ...(byCode[r.codigo] || {}),
    }));
    return { rows, sizes };
  }, [data]);

  const compareData = useMemo(() => {
    if (!data) return [];
    const k = data.kpis;
    return [
      { label: "Hoje × ontem", atual: k.today, anterior: k.yesterday },
      { label: "Semana", atual: k.week, anterior: k.prevWeek },
      { label: "Mês", atual: k.month, anterior: k.prevMonth },
    ];
  }, [data]);

  // Heatmap matrix: famílias (top 6) × tamanhos
  const heat = useMemo(() => {
    if (!data) return null;
    const fams = data.byFamily.slice(0, 6).map(f => f.familia);
    const sizesPresent = [...new Set(data.familySize.map(r => r.tamanho))];
    const sizes = [
      ...SIZE_ORDER.filter(s => sizesPresent.includes(s)),
      ...sizesPresent.filter(s => !SIZE_ORDER.includes(s)),
    ];
    const map = {};
    let max = 0;
    for (const r of data.familySize) { map[`${r.familia}|${r.tamanho}`] = r.pcs; if (r.pcs > max) max = r.pcs; }
    return { fams, sizes, map, max };
  }, [data]);

  function heatColor(v) {
    if (!v) return heatEmpty;
    const t = heat.max ? v / heat.max : 0;
    // interpola transparência sobre o azul da marca
    const alpha = 0.15 + t * 0.85;
    return `rgba(59,91,219,${alpha.toFixed(2)})`;
  }

  if (loading && !data) {
    return <Flex h="60vh" align="center" justify="center"><Spinner size="xl" color="blue.500" thickness="3px" /></Flex>;
  }
  if (err) {
    return <Box p={6}><Text color="red.500">Erro: {err}</Text></Box>;
  }

  const k = data.kpis;
  const dToday = pct(k.today, k.yesterday);
  const dWeek = pct(k.week, k.prevWeek);
  const dMonth = pct(k.month, k.prevMonth);

  return (
    <Box>
      {/* Header */}
      <Flex justify="space-between" align="flex-end" wrap="wrap" gap={3} mb={4}>
        <Box>
          <Text fontSize="xl" fontWeight="bold">Dashboard de Separação</Text>
          <Text fontSize="sm" color={subtle}>Análise das peças bipadas como saída — peças, tamanhos, famílias e tendências.</Text>
        </Box>
        <HStack spacing={3} wrap="wrap">
          <Select
            size="sm" borderRadius="lg" maxW="190px" value={familiaFilter}
            placeholder="Todas as famílias"
            onChange={e => { setFamiliaFilter(e.target.value); setProductFilter(""); }}
          >
            {options.familias.map(f => <option key={f} value={f}>{f}</option>)}
          </Select>

          <Select
            size="sm" borderRadius="lg" maxW="230px" value={productFilter}
            placeholder="Todos os produtos"
            onChange={e => setProductFilter(e.target.value)}
          >
            {productOptions.map(p => (
              <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.descricao}</option>
            ))}
          </Select>

          <HStack bg={useColorModeValue("gray.100", "gray.700")} borderRadius="lg" p="3px" spacing="2px">
            {RANGES.map(r => (
              <Button
                key={r.key} size="sm" variant={rangeKey === r.key ? "solid" : "ghost"}
                colorScheme={rangeKey === r.key ? "blue" : "gray"}
                onClick={() => setRangeKey(r.key)} fontWeight="600"
              >{r.label}</Button>
            ))}
          </HStack>
        </HStack>
      </Flex>

      {(familiaFilter || productFilter) && (
        <HStack mb={3} spacing={2}>
          <Text fontSize="sm" color={subtle}>Filtros:</Text>
          {familiaFilter && (
            <Badge colorScheme="purple" borderRadius="full" px={2} py="2px">
              Família: {familiaFilter}
            </Badge>
          )}
          {productFilter && (
            <Badge colorScheme="blue" borderRadius="full" px={2} py="2px">
              Produto: {productFilter}
            </Badge>
          )}
          <Button size="xs" variant="link" colorScheme="red"
            onClick={() => { setFamiliaFilter(""); setProductFilter(""); }}>
            limpar
          </Button>
        </HStack>
      )}

      {/* KPIs */}
      <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} spacing={4} mb={4}>
        <KpiCard label="Peças hoje" value={nf(k.today)} delta={dToday} sub="vs ontem" spark={sparkData} color="#3b5bdb" />
        <KpiCard label="Semana atual" value={nf(k.week)} delta={dWeek} sub="vs semana ant." spark={sparkData} color="#0ca678" />
        <KpiCard label="Mês corrente" value={nf(k.month)} delta={dMonth} sub="vs mês ant." spark={sparkData} color="#5c7cfa" />
        <KpiCard label="No período" value={nf(data.period.total)} sub={`${ddmm(from)}–${ddmm(to)}`} spark={sparkData} color="#7048e8" />
        <KpiCard
          label="Pico — melhor dia"
          value={nf(data.period.best?.pcs || 0)}
          sub={data.period.best ? ddmm(data.period.best.dia) : "—"}
          spark={sparkData} color="#f08c00"
        />
      </SimpleGrid>

      {/* Tendência + tamanho */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mb={4} templateColumns={{ lg: "1.55fr 1fr" }}>
        <Panel title="Peças separadas por dia" subtitle="Período atual vs período anterior (sobreposto)" h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 10, right: 12, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="gAtual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b5bdb" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b5bdb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} tickLine={false} axisLine={false} width={44} />
              <Tooltip {...tooltipStyle} formatter={(v, n) => [nf(v), n === "atual" ? "Atual" : "Período anterior"]} />
              <Area type="monotone" dataKey="anterior" stroke="#cbd3e8" strokeWidth={2} strokeDasharray="5 4" fill="#cbd3e833" dot={false} />
              <Area type="monotone" dataKey="atual" stroke="#3b5bdb" strokeWidth={3} fill="url(#gAtual)" dot={{ r: 3, fill: "#3b5bdb" }} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Por tamanho" subtitle="Distribuição das peças separadas" h={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={sizeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={105} paddingAngle={2}
                label={({ name, percent }) => `Tam. ${name} · ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {sizeData.map((d, i) => <Cell key={i} fill={sizeColor(d.name, i)} />)}
              </Pie>
              <Tooltip {...tooltipStyle} formatter={(v, n) => [`${nf(v)} pçs`, `Tam. ${n}`]} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </SimpleGrid>

      {/* Família + Heatmap */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mb={4} templateColumns={{ lg: "1fr 1.4fr" }}>
        <Panel title="Ranking por família" subtitle="Agrupa linhas de mesmo nome (ex.: Soft Menino + Menina)" h={340}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={familyData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={86} tick={{ fontSize: 12, fill: axisColor }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} formatter={v => [`${nf(v)} pçs`, "Peças"]} cursor={{ fill: gridColor }} />
              <Bar dataKey="pcs" radius={[0, 6, 6, 0]} barSize={20} label={{ position: "right", fontSize: 11, fill: axisColor, formatter: nf }}>
                {familyData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Famílias × tamanho" subtitle="Mapa de calor — onde está o volume de cada linha na grade" h={340}>
          {heat && heat.fams.length > 0 ? (
            <Box overflowX="auto" h="100%">
              <Box minW="fit-content">
                {/* header de tamanhos */}
                <Flex pl="92px" mb={1}>
                  {heat.sizes.map(s => (
                    <Text key={s} flex="1" minW="34px" textAlign="center" fontSize="11px" fontWeight="600" color={axisColor}>{s}</Text>
                  ))}
                </Flex>
                {heat.fams.map(fam => (
                  <Flex key={fam} align="center" mb="3px">
                    <Text w="92px" pr={2} fontSize="12px" color={axisColor} noOfLines={1} textAlign="right">{fam}</Text>
                    {heat.sizes.map(s => {
                      const v = heat.map[`${fam}|${s}`] || 0;
                      return (
                        <Flex key={s} flex="1" minW="34px" h="34px" mx="2px" align="center" justify="center"
                          borderRadius="6px" bg={heatColor(v)} title={`${fam} · Tam. ${s}: ${nf(v)} pçs`}>
                          <Text fontSize="10px" fontWeight="600" color={v > heat.max * 0.5 ? "white" : axisColor}>{v || ""}</Text>
                        </Flex>
                      );
                    })}
                  </Flex>
                ))}
              </Box>
            </Box>
          ) : <Flex h="100%" align="center" justify="center"><Text color={subtle} fontSize="sm">Sem dados no período.</Text></Flex>}
        </Panel>
      </SimpleGrid>

      {/* Comparativos + Top produtos */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} templateColumns={{ lg: "1fr 1fr" }}>
        <Panel title="Comparativos de período" subtitle="Atual vs anterior — hoje, semana e mês" h={280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compareData} margin={{ top: 10, right: 12, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} tickLine={false} axisLine={false} width={44} />
              <Tooltip {...tooltipStyle} formatter={(v, n) => [nf(v), n === "atual" ? "Atual" : "Anterior"]} cursor={{ fill: gridColor }} />
              <Legend formatter={v => (v === "atual" ? "Atual" : "Anterior")} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="anterior" fill="#e64980" radius={[5, 5, 0, 0]} barSize={20} />
              <Bar dataKey="atual" fill="#3b5bdb" radius={[5, 5, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Top produtos do período" subtitle="Volume por produto, dividido por tamanho" h={280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topProd.rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: axisColor }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} formatter={(v, n) => [`${nf(v)} pçs`, `Tam. ${n}`]} cursor={{ fill: gridColor }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
              {topProd.sizes.map((s, i) => (
                <Bar key={s} dataKey={s} stackId="t" fill={sizeColor(s, i)} barSize={16}
                  radius={i === topProd.sizes.length - 1 ? [0, 6, 6, 0] : 0}>
                  {i === topProd.sizes.length - 1 && (
                    <LabelList dataKey="total" position="right" fontSize={11} fill={axisColor} formatter={nf} />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </SimpleGrid>
    </Box>
  );
}
