import { useEffect, useState, useMemo } from "react";
import {
  Box, Flex, Text, VStack, HStack, Grid, Select, Input,
  InputGroup, InputLeftElement, Badge, Image, Spinner, Stat,
  StatLabel, StatNumber, StatHelpText, Tooltip, Button,
  Divider, Collapse, useColorModeValue, useToast, ButtonGroup,
} from "@chakra-ui/react";
import {
  SearchIcon, RepeatIcon, ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon,
} from "@chakra-ui/icons";
import { fetchStoresManagement, fetchAnuncios, fetchMarketComparison } from "../api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  active:       { label: "Ativo",      color: "green"  },
  paused:       { label: "Pausado",    color: "yellow" },
  closed:       { label: "Encerrado",  color: "red"    },
  under_review: { label: "Em revisão", color: "orange" },
  inactive:     { label: "Inativo",    color: "gray"   },
};

const SCORE_COLOR = (s) => s >= 70 ? "green" : s >= 50 ? "blue" : s >= 30 ? "yellow" : "red";

function fmtCurrency(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(v) {
  return (v || 0).toLocaleString("pt-BR");
}

// Returns the visits value for a given period
function getVisits(item, period) {
  if (period === "7d")  return item.visits_7d  || 0;
  if (period === "15d") return item.visits_15d || 0;
  return item.visits || 0;
}

// Returns period-specific sold units from real orders
function getSold(item, period) {
  if (period === "7d")  return item.sold_7d  ?? 0;
  if (period === "15d") return item.sold_15d ?? 0;
  return item.sold_30d ?? 0;
}

// Returns conversion rate for the period
function getConversion(item, period) {
  const v = getVisits(item, period);
  const s = getSold(item, period);
  if (v === 0) return 0;
  return parseFloat(((s / v) * 100).toFixed(1));
}

// Returns actual revenue (from real orders) for the period
function getRevenue(item, period) {
  if (period === "7d")  return item.revenue_7d  ?? 0;
  if (period === "15d") return item.revenue_15d ?? 0;
  return item.revenue_30d ?? 0;
}

// Returns visits trend pct for the given period
function getTrendPct(item, period) {
  if (!item.trend) return null;
  if (period === "7d")  return item.trend.visits_pct_7d  ?? null;
  if (period === "15d") return item.trend.visits_pct_15d ?? null;
  return item.trend.visits_pct ?? null;
}

// Returns sold trend pct for the given period (vs previous equivalent period)
function getSoldTrendPct(item, period) {
  if (!item.trend) return null;
  if (period === "7d")  return item.trend.sold_pct_7d  ?? null;
  if (period === "15d") return item.trend.sold_pct_15d ?? null;
  return item.trend.sold_pct_30d ?? null;
}

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({ pct }) {
  if (pct == null) return null;
  const up    = pct >= 0;
  const color = up ? "green" : "red";
  const arrow = up ? "↑" : "↓";
  return (
    <Badge colorScheme={color} fontSize="9px" variant="subtle">
      {arrow}{Math.abs(pct)}%
    </Badge>
  );
}

// ── Stars display ─────────────────────────────────────────────────────────────

function Stars({ avg }) {
  if (avg == null) return <Text fontSize="xs" color="gray.400">Sem avaliações</Text>;
  const full  = Math.floor(avg);
  const half  = avg - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <HStack spacing="1px">
      {[...Array(full)].map((_, i) => <Text key={`f${i}`} fontSize="xs" color="yellow.400">★</Text>)}
      {half === 1 && <Text fontSize="xs" color="yellow.400">½</Text>}
      {[...Array(empty)].map((_, i) => <Text key={`e${i}`} fontSize="xs" color="gray.300">★</Text>)}
      <Text fontSize="xs" color="gray.500" ml={1}>{avg.toFixed(1)}</Text>
    </HStack>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, helpText, color }) {
  const bg     = useColorModeValue("white", "gray.700");
  const border = useColorModeValue("gray.200", "gray.600");
  const muted  = useColorModeValue("gray.500", "gray.400");
  return (
    <Box bg={bg} border="1px solid" borderColor={border} borderRadius="lg" p={4}>
      <Stat>
        <StatLabel fontSize="xs" color={muted}>{label}</StatLabel>
        <StatNumber fontSize="xl" color={color || "inherit"}>{value}</StatNumber>
        {helpText && <StatHelpText fontSize="xs" mb={0}>{helpText}</StatHelpText>}
      </Stat>
    </Box>
  );
}

// ── Metric mini-card ──────────────────────────────────────────────────────────

function MetricBox({ label, value, color, sub }) {
  const bg     = useColorModeValue("gray.50", "gray.800");
  const border = useColorModeValue("gray.100", "gray.600");
  const muted  = useColorModeValue("gray.500", "gray.400");
  return (
    <Box bg={bg} border="1px solid" borderColor={border} borderRadius="md" p={3} textAlign="center">
      <Text fontSize="10px" color={muted} textTransform="uppercase" letterSpacing="wider" mb={1}>{label}</Text>
      <Text fontSize="sm" fontWeight="bold" color={color || "inherit"}>{value}</Text>
      {sub && <Text fontSize="10px" color={muted} mt="2px">{sub}</Text>}
    </Box>
  );
}

// ── Score breakdown row ───────────────────────────────────────────────────────

function ScoreRow({ factor, pts, max, note }) {
  const color = pts === max ? "green.500" : pts === 0 ? "red.500" : "yellow.500";
  const icon  = pts === max ? "✓" : pts === 0 ? "✗" : "~";
  const muted = useColorModeValue("gray.500", "gray.400");
  return (
    <Flex justify="space-between" align="center" py="2px">
      <HStack spacing={2}>
        <Text fontSize="xs" color={color} fontWeight="bold" w="12px">{icon}</Text>
        <Text fontSize="xs">{factor}</Text>
      </HStack>
      <HStack spacing={2}>
        <Text fontSize="xs" color={muted}>{note}</Text>
        <Badge colorScheme={pts === max ? "green" : pts === 0 ? "red" : "yellow"} fontSize="10px">
          {pts}/{max}
        </Badge>
      </HStack>
    </Flex>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ children }) {
  const muted = useColorModeValue("gray.500", "gray.400");
  return (
    <Text fontSize="xs" fontWeight="bold" color={muted} textTransform="uppercase"
      letterSpacing="wider" mb={2}>
      {children}
    </Text>
  );
}

// ── Alerts panel ──────────────────────────────────────────────────────────────

function AlertsPanel({ items }) {
  const [expanded, setExpanded] = useState(null);
  const bg      = useColorModeValue("white", "gray.700");
  const border  = useColorModeValue("gray.200", "gray.600");
  const muted   = useColorModeValue("gray.500", "gray.400");
  const hoverBg = useColorModeValue("gray.50", "gray.650");

  const groups = useMemo(() => [
    {
      key: "noSales",
      label: "Sem vendas nos últimos 30d",
      color: "red",
      items: items.filter((i) => i.status === "active" && (i.sold_30d ?? 0) === 0),
    },
    {
      key: "falling",
      label: "Queda > 20% nas vendas",
      color: "orange",
      items: items.filter((i) => i.trend?.sold_pct_30d != null && i.trend.sold_pct_30d <= -20),
    },
    {
      key: "questions",
      label: "Perguntas sem resposta",
      color: "blue",
      items: items.filter((i) => (i.questions?.unanswered ?? 0) > 0),
    },
    {
      key: "stock",
      label: "Estoque crítico (≤ 5 dias)",
      color: "red",
      items: items.filter((i) => i.stock_days != null && i.stock_days <= 5 && i.available_quantity > 0),
    },
    {
      key: "paused",
      label: "Pausados com estoque disponível",
      color: "yellow",
      items: items.filter((i) => i.status === "paused" && (i.available_quantity || 0) > 0),
    },
    {
      key: "lowHealth",
      label: "Saúde ruim (score < 30)",
      color: "red",
      items: items.filter((i) => i.score < 30 && i.status === "active"),
    },
  ].filter((g) => g.items.length > 0), [items]);

  if (groups.length === 0) {
    return (
      <Box bg={bg} border="1px solid" borderColor={border} borderRadius="lg" px={4} py={3}>
        <HStack spacing={2}>
          <Text fontSize="sm" color="green.500" fontWeight="semibold">✓ Nenhum alerta crítico</Text>
          <Text fontSize="xs" color={muted}>Todos os anúncios estão saudáveis</Text>
        </HStack>
      </Box>
    );
  }

  const total = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <Box bg={bg} border="1px solid" borderColor={border} borderRadius="lg" overflow="hidden">
      <Flex px={4} py={3} align="center" gap={3}>
        <Text fontSize="sm" fontWeight="bold">⚠ Alertas</Text>
        <Badge colorScheme="red">{total} anúncio{total !== 1 ? "s" : ""}</Badge>
        <Text fontSize="xs" color={muted}>{groups.length} categoria{groups.length !== 1 ? "s" : ""}</Text>
      </Flex>
      <Divider />
      <VStack spacing={0} align="stretch" divider={<Divider />}>
        {groups.map((group) => (
          <Box key={group.key}>
            <Flex px={4} py={2.5} align="center" justify="space-between" cursor="pointer"
              _hover={{ bg: hoverBg }} transition="background 0.15s"
              onClick={() => setExpanded((e) => e === group.key ? null : group.key)}>
              <HStack spacing={2}>
                <Text fontSize="sm">{group.label}</Text>
                <Badge colorScheme={group.color} fontSize="xs">{group.items.length}</Badge>
              </HStack>
              {expanded === group.key ? <ChevronUpIcon color={muted} /> : <ChevronDownIcon color={muted} />}
            </Flex>
            <Collapse in={expanded === group.key} animateOpacity>
              <Box px={4} pb={3} pt={1}>
                <VStack align="stretch" spacing={1}>
                  {group.items.slice(0, 10).map((item) => (
                    <Flex key={item.id} justify="space-between" align="center">
                      <Text fontSize="xs" noOfLines={1} flex="1" mr={2}>{item.title}</Text>
                      <Text fontSize="10px" color={muted} flexShrink={0}>{item.id}</Text>
                    </Flex>
                  ))}
                  {group.items.length > 10 && (
                    <Text fontSize="xs" color={muted}>+{group.items.length - 10} mais</Text>
                  )}
                </VStack>
              </Box>
            </Collapse>
          </Box>
        ))}
      </VStack>
    </Box>
  );
}

// ── Market price comparison ───────────────────────────────────────────────────

function MarketComparison({ item, storeId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const muted      = useColorModeValue("gray.500", "gray.400");
  const rowHoverBg = useColorModeValue("gray.50", "gray.750");
  const borderC    = useColorModeValue("gray.100", "gray.600");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const effectivePrice = item.promo_price || item.price;
      const result = await fetchMarketComparison(item.id, storeId, effectivePrice);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!data && !loading && !error) {
    return (
      <Button size="xs" variant="outline" colorScheme="blue" onClick={load}>
        Comparar com mercado
      </Button>
    );
  }
  if (loading) return <HStack spacing={2}><Spinner size="xs" /><Text fontSize="xs" color={muted}>Buscando concorrentes...</Text></HStack>;
  if (error)   return <Text fontSize="xs" color="red.400">Erro: {error}</Text>;
  if (!data?.stats) {
    return (
      <VStack align="start" spacing={1}>
        <Text fontSize="xs" color={muted}>Dados de comparação indisponíveis.</Text>
        {data?._note && (
          <Text fontSize="10px" color="orange.400">{data._note}</Text>
        )}
      </VStack>
    );
  }

  const { stats, price_to_win, category_prices } = data;

  // Use item prop directly for our own prices — already correct from main data load
  const itemPixPrice  = item.promo_price  || null;
  const itemOrigPrice = item.original_price || item.price;
  const displayPrice  = itemPixPrice || item.price;
  const our_price     = displayPrice;  // alias used throughout component

  const ref   = stats.ref_price;
  const pct   = stats.pct_vs_ref;
  const above = pct != null && pct > 0;
  const below = pct != null && pct < 0;
  const priceColor = above ? "red.500" : below ? "green.500" : "inherit";
  const priceLabel = pct == null ? "sem referência"
    : above ? `${pct}% acima do preço de referência`
    : pct === 0 ? "igual ao preço de referência"
    : `${Math.abs(pct)}% abaixo do preço de referência`;

  return (
    <VStack align="stretch" spacing={3}>
      {/* Summary row */}
      <Flex gap={6} flexWrap="wrap" align="flex-start">
        <Box>
          <Text fontSize="10px" color={muted} textTransform="uppercase" letterSpacing="wider">Seu preço</Text>
          <HStack spacing={1} align="baseline">
            <Text fontSize="sm" fontWeight="bold">{fmtCurrency(displayPrice)}</Text>
            {itemPixPrice && <Badge colorScheme="blue" variant="subtle" fontSize="9px">Pix</Badge>}
          </HStack>
          {itemPixPrice && itemOrigPrice && (
            <Text fontSize="xs" color={muted} textDecoration="line-through">{fmtCurrency(itemOrigPrice)}</Text>
          )}
        </Box>

        {price_to_win != null && (
          <Box>
            <Text fontSize="10px" color={muted} textTransform="uppercase" letterSpacing="wider">Preço para ganhar Buy Box</Text>
            <Text fontSize="sm" fontWeight="bold" color={our_price <= price_to_win ? "green.500" : "orange.400"}>
              {fmtCurrency(price_to_win)}
            </Text>
            <Text fontSize="10px" color={muted}>
              {our_price <= price_to_win ? "✓ Você já está competitivo" : `Reduzir ${fmtCurrency(our_price - price_to_win)}`}
            </Text>
          </Box>
        )}

        {category_prices && (
          <Box>
            <Text fontSize="10px" color={muted} textTransform="uppercase" letterSpacing="wider">Faixa da categoria</Text>
            <Text fontSize="sm" fontWeight="bold">
              {fmtCurrency(category_prices.min_price)} – {fmtCurrency(category_prices.max_price)}
            </Text>
            {category_prices.suggested && (
              <Text fontSize="10px" color={muted}>Sugerido: {fmtCurrency(category_prices.suggested)}</Text>
            )}
          </Box>
        )}

        {ref != null && (
          <Box>
            <Text fontSize="10px" color={muted} textTransform="uppercase" letterSpacing="wider">Posição</Text>
            <Text fontSize="sm" fontWeight="bold" color={priceColor}>{priceLabel}</Text>
          </Box>
        )}
      </Flex>

      {/* Visual bar: our price vs price_to_win */}
      {price_to_win != null && (() => {
        const lo = Math.min(our_price, price_to_win) * 0.85;
        const hi = Math.max(our_price, price_to_win) * 1.15;
        const ourPct = Math.round(((our_price - lo) / (hi - lo)) * 100);
        const winPct = Math.round(((price_to_win - lo) / (hi - lo)) * 100);
        return (
          <Box>
            <Box position="relative" h="8px" bg={borderC} borderRadius="full" my={3}>
              {/* Price-to-win marker */}
              <Box position="absolute" top="-3px" w="14px" h="14px" borderRadius="full"
                bg="green.400" border="2px solid white" transform="translateX(-50%)" left={`${winPct}%`} />
              {/* Our price marker */}
              <Box position="absolute" top="-3px" w="14px" h="14px" borderRadius="full"
                bg={above ? "red.400" : "blue.400"} border="2px solid white"
                transform="translateX(-50%)" left={`${ourPct}%`} />
            </Box>
            <Flex justify="space-between">
              <HStack spacing={2}>
                <Box w="10px" h="10px" borderRadius="full" bg="green.400" />
                <Text fontSize="10px" color={muted}>Buy Box ({fmtCurrency(price_to_win)})</Text>
              </HStack>
              <HStack spacing={2}>
                <Box w="10px" h="10px" borderRadius="full" bg={above ? "red.400" : "blue.400"} />
                <Text fontSize="10px" color={muted}>Seu preço ({fmtCurrency(our_price)})</Text>
              </HStack>
            </Flex>
          </Box>
        );
      })()}

      {/* Competitor list */}
      {data.top?.length > 0 && (
        <Box>
          <Text fontSize="10px" color={muted} mb={2} textTransform="uppercase" letterSpacing="wider">
            Concorrentes encontrados ({data.top.length})
          </Text>
          <VStack align="stretch" spacing={1}>
            {data.top.map((c, i) => (
              <Flex key={i} align="center" gap={2} py={1} borderBottom="1px solid" borderColor={borderC}>
                {c.thumbnail && (
                  <Box w="32px" h="32px" flexShrink={0} overflow="hidden" borderRadius="sm">
                    <img src={c.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </Box>
                )}
                <Box flex={1} minW={0}>
                  {c.url ? (
                    <Text
                      as="a" href={c.url} target="_blank" rel="noopener noreferrer"
                      fontSize="xs" noOfLines={1} color="blue.400"
                      _hover={{ textDecoration: 'underline' }}
                    >
                      {c.title}
                    </Text>
                  ) : (
                    <Text fontSize="xs" noOfLines={1} color={muted}>{c.title}</Text>
                  )}
                  <HStack spacing={2} mt="1px">
                    {c.seller && <Text fontSize="10px" color={muted} noOfLines={1}>🏪 {c.seller}</Text>}
                    {c.brand  && <Text fontSize="10px" color={muted} noOfLines={1}>· {c.brand}</Text>}
                  </HStack>
                </Box>
                <Box textAlign="right" flexShrink={0} minW="120px">
                  {/* Pix price — principal */}
                  {c.pix_price && (
                    <HStack spacing={1} justify="flex-end">
                      <Text fontSize="xs" fontWeight="bold"
                        color={c.pix_price < our_price ? "green.500" : c.pix_price > our_price ? "red.400" : "inherit"}>
                        {fmtCurrency(c.pix_price)}
                      </Text>
                      <Badge size="xs" colorScheme="blue" variant="subtle" fontSize="9px">Pix</Badge>
                    </HStack>
                  )}
                  {/* Card price (outros meios) */}
                  {c.card_price && (
                    <Text fontSize="10px" color={muted}>
                      {fmtCurrency(c.card_price)} cartão
                    </Text>
                  )}
                  {/* Original/tabela price — riscado */}
                  {c.orig_price && (
                    <Text fontSize="10px" color={muted} textDecoration="line-through">
                      {fmtCurrency(c.orig_price)}
                    </Text>
                  )}
                  {/* Fallback se nenhum detalhe disponível */}
                  {!c.pix_price && !c.card_price && (
                    <Text fontSize="xs" fontWeight="bold"
                      color={c.price < our_price ? "green.500" : c.price > our_price ? "red.400" : "inherit"}>
                      {fmtCurrency(c.price)}
                    </Text>
                  )}
                </Box>
              </Flex>
            ))}
          </VStack>
        </Box>
      )}

      <Text fontSize="10px" color={muted}>
        {stats.source === "price_to_win"
          ? "Fonte: ML Price to Win"
          : `Busca: "${data.query}" — preços sem desconto Pix`}
      </Text>
    </VStack>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────

function ItemCard({ item, period, storeId }) {
  const [open, setOpen] = useState(false);

  const cardBg       = useColorModeValue("white", "gray.700");
  const border       = useColorModeValue("gray.200", "gray.600");
  const activeBorder = useColorModeValue("blue.300", "blue.500");
  const hoverBg      = useColorModeValue("gray.50", "gray.650");
  const muted        = useColorModeValue("gray.500", "gray.400");
  const alertBg      = useColorModeValue("orange.50", "orange.900");
  const alertBorder  = useColorModeValue("orange.200", "orange.700");
  const warnColor    = useColorModeValue("orange.700", "orange.200");
  const metricBg     = useColorModeValue("gray.50", "gray.800");
  const metricBorder = useColorModeValue("gray.100", "gray.600");
  const metricMuted  = useColorModeValue("gray.500", "gray.400");
  const metricSub    = useColorModeValue("gray.400", "gray.500");

  const hasAlerts = item.alerts?.length > 0;
  const hasAds    = !!item.ads;

  // Period-aware metrics
  const periodVisits      = getVisits(item, period);
  const periodSold        = getSold(item, period);
  const periodConversion  = getConversion(item, period);
  const periodRevenue     = getRevenue(item, period);
  const periodTrendPct    = getTrendPct(item, period);
  const periodSoldTrend   = getSoldTrendPct(item, period);
  const periodLabel       = period;

  // Stock days warning color
  const stockDaysColor = item.stock_days == null ? muted
    : item.stock_days <= 7  ? "red.500"
    : item.stock_days <= 15 ? "orange.500"
    : "inherit";

  const visitsTrendSub = periodTrendPct != null
    ? `${periodTrendPct >= 0 ? "↑" : "↓"}${Math.abs(periodTrendPct)}% vs per. ant.`
    : "Sem histórico";

  return (
    <Box bg={cardBg} border="1px solid" borderColor={open ? activeBorder : border}
      borderRadius="lg" overflow="hidden" transition="border-color 0.2s">

      {/* ── Collapsed header ─────────────────────────────────────────────── */}
      <Flex align="center" gap={3} px={4} py={3} cursor="pointer"
        _hover={{ bg: hoverBg }} onClick={() => setOpen((o) => !o)}>

        <Image src={item.thumbnail} alt="" boxSize="44px" objectFit="cover"
          borderRadius="md" flexShrink={0}
          fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect width='44' height='44' fill='%23e2e8f0'/%3E%3C/svg%3E"
        />

        <Box flex="1" minW={0}>
          <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{item.title}</Text>
          <HStack spacing={2}>
            <HStack spacing={1}>
              <Text fontSize="10px" color={muted}>{item.id}</Text>
              <Tooltip label="Copiar código" placement="top" openDelay={300}>
                <Box
                  as="button"
                  color={muted}
                  _hover={{ color: "blue.400" }}
                  transition="color 0.15s"
                  lineHeight={1}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(item.id);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </Box>
              </Tooltip>
            </HStack>
            {item.reviews?.avg != null && (
              <HStack spacing="1px">
                <Text fontSize="10px" color="yellow.400">★</Text>
                <Text fontSize="10px" color={muted}>{item.reviews.avg.toFixed(1)}</Text>
              </HStack>
            )}
            {item.questions?.unanswered > 0 && (
              <Text fontSize="10px" color="orange.500">
                {item.questions.unanswered} perg. sem resposta
              </Text>
            )}
          </HStack>
        </Box>

        {/* Inline metrics */}
        <HStack spacing={4} flexShrink={0} display={{ base: "none", md: "flex" }}>
          <Box textAlign="right">
            <Text fontSize="10px" color={muted}>Preço</Text>
            {item.promo_price != null ? (
              <>
                <Text fontSize="xs" fontWeight="bold" color="red.500">{fmtCurrency(item.promo_price)}</Text>
                <Text fontSize="10px" color={muted} textDecoration="line-through">{fmtCurrency(item.regular_price)}</Text>
              </>
            ) : (
              <Text fontSize="xs" fontWeight="bold">{fmtCurrency(item.price)}</Text>
            )}
          </Box>
          <Box textAlign="right">
            <Text fontSize="10px" color={muted}>Visitas ({periodLabel})</Text>
            <HStack spacing={1} justify="flex-end">
              <Text fontSize="xs">{fmtNum(periodVisits)}</Text>
              <TrendBadge pct={periodTrendPct} />
            </HStack>
          </Box>
          <Box textAlign="right">
            <Text fontSize="10px" color={muted}>Vendas ({periodLabel})</Text>
            <HStack spacing={1} justify="flex-end">
              <Text fontSize="xs">{fmtNum(periodSold)}</Text>
              <TrendBadge pct={periodSoldTrend} />
            </HStack>
          </Box>
          <Box textAlign="right">
            <Text fontSize="10px" color={muted}>Conv.</Text>
            <Text fontSize="xs">{periodConversion}%</Text>
          </Box>
          <Box textAlign="right">
            <Text fontSize="10px" color={muted}>Receita ({periodLabel})</Text>
            <Text fontSize="xs" fontWeight="bold" color="blue.500">{fmtCurrency(periodRevenue)}</Text>
          </Box>
          {item.stock_days != null && (
            <Box textAlign="right">
              <Text fontSize="10px" color={muted}>Estoque</Text>
              <Text fontSize="xs" color={stockDaysColor}>{item.stock_days}d</Text>
            </Box>
          )}
        </HStack>

        {/* Badges */}
        <HStack spacing={2} flexShrink={0}>
          {item.listing_type_label && item.listing_type_label !== "—" && (
            <Badge
              colorScheme={item.listing_type_id?.startsWith("gold") ? "yellow" : "gray"}
              fontSize="xs" variant="subtle">
              {item.listing_type_label}
            </Badge>
          )}
          {item.free_shipping && (
            <Badge colorScheme="green" fontSize="xs" variant="subtle">Frete grátis</Badge>
          )}
          <Badge colorScheme={STATUS_MAP[item.status]?.color || "gray"} fontSize="xs">
            {STATUS_MAP[item.status]?.label || item.status}
          </Badge>
          {hasAlerts && (
            <Badge colorScheme="orange" fontSize="xs">
              {item.alerts.length} alerta{item.alerts.length > 1 ? "s" : ""}
            </Badge>
          )}
          <Badge colorScheme={SCORE_COLOR(item.score)} fontSize="xs" px={2}>
            {item.score_label}
          </Badge>
        </HStack>

        <Box color={muted} flexShrink={0}>
          {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Box>
      </Flex>

      {/* ── Expanded detail ──────────────────────────────────────────────── */}
      <Collapse in={open} animateOpacity>
        <Box px={4} pb={4} pt={2}>
          <Divider mb={4} />

          {/* ── Row 1: Main metrics ─────────────────────────────────────── */}
          <Grid templateColumns={{ base: "repeat(2,1fr)", md: "repeat(3,1fr)", lg: "repeat(6,1fr)" }}
            gap={3} mb={4}>
            {item.promo_price != null ? (
              <Box bg={metricBg} border="1px solid" borderColor={metricBorder}
                borderRadius="md" p={3} textAlign="center">
                <Text fontSize="10px" color={metricMuted} textTransform="uppercase"
                  letterSpacing="wider" mb={1}>Preço</Text>
                <Text fontSize="sm" fontWeight="bold" color="red.500">{fmtCurrency(item.promo_price)}</Text>
                <Text fontSize="10px" color={metricSub} textDecoration="line-through">
                  {fmtCurrency(item.regular_price)}
                </Text>
                {item.promo_end && (
                  <Text fontSize="9px" color="orange.400" mt="2px">
                    até {new Date(item.promo_end).toLocaleDateString("pt-BR")}
                  </Text>
                )}
              </Box>
            ) : (
              <MetricBox label="Preço" value={fmtCurrency(item.price)} />
            )}
            <MetricBox
              label={`Visitas (${periodLabel})`}
              value={fmtNum(periodVisits)}
              sub={visitsTrendSub}
              color={periodTrendPct != null
                ? periodTrendPct >= 0 ? "green.500" : "red.500"
                : undefined}
            />
            <MetricBox
              label={`Vendas (${periodLabel})`}
              value={fmtNum(periodSold)}
              color={periodSoldTrend != null
                ? periodSoldTrend >= 0 ? "green.500" : "red.500"
                : undefined}
              sub={periodSoldTrend != null
                ? `${periodSoldTrend >= 0 ? "↑" : "↓"}${Math.abs(periodSoldTrend)}% vs per. ant.`
                : `Total acum.: ${fmtNum(item.sold_quantity)}`}
            />
            <MetricBox
              label="Conversão"
              value={`${periodConversion}%`}
              color={periodConversion >= 2 ? "green.500" : periodConversion >= 0.5 ? "yellow.500" : "red.500"}
            />
            <MetricBox
              label={`Receita (${periodLabel})`}
              value={fmtCurrency(periodRevenue)}
              color="blue.500"
            />
            <MetricBox
              label="Dias estoque"
              value={item.stock_days != null ? `${item.stock_days} dias` : "—"}
              color={stockDaysColor}
              sub={item.stock_days != null && item.stock_days <= 15 ? "⚠ Repor em breve" : undefined}
            />
          </Grid>

          {/* ── Row 2: Reviews · Questions · Ads ─────────────────────────── */}
          <Grid templateColumns={{ base: "1fr", md: "1fr 1fr 1fr" }} gap={4} mb={4}>

            {/* Reviews */}
            <Box>
              <SectionHeader>Avaliações</SectionHeader>
              {item.reviews ? (
                <VStack align="start" spacing={1}>
                  <Stars avg={item.reviews.avg} />
                  <Text fontSize="xs" color={muted}>{fmtNum(item.reviews.total)} avaliações</Text>
                  {item.reviews.avg != null && item.reviews.avg < 4 && (
                    <Text fontSize="xs" color="red.500">⚠ Nota baixa — impacta posição</Text>
                  )}
                  {item.reviews.total === 0 && (
                    <Text fontSize="xs" color="orange.500">⚠ Sem avaliações ainda</Text>
                  )}
                </VStack>
              ) : (
                <Text fontSize="xs" color={muted}>—</Text>
              )}
            </Box>

            {/* Questions */}
            <Box>
              <SectionHeader>Perguntas</SectionHeader>
              {item.questions ? (
                <VStack align="start" spacing={1}>
                  {item.questions.unanswered === 0 ? (
                    <Text fontSize="xs" color="green.500">✓ Nenhuma pergunta pendente</Text>
                  ) : (
                    <Text fontSize="xs" color="red.500">
                      ⚠ {item.questions.unanswered} sem resposta
                    </Text>
                  )}
                  <Text fontSize="xs" color={muted}>Responder rápido = +ranking</Text>
                </VStack>
              ) : (
                <Text fontSize="xs" color={muted}>—</Text>
              )}
            </Box>

            {/* Ads */}
            <Box>
              <SectionHeader>Mercado Ads</SectionHeader>
              {item.ads === "unavailable" ? (
                <VStack align="start" spacing={1}>
                  <Badge colorScheme="gray" fontSize="xs">Integração pendente</Badge>
                  <Text fontSize="xs" color={muted}>API de Ads não mapeada</Text>
                  <Text as="a"
                    href="https://www.mercadolibre.com.br/publicidade"
                    target="_blank" rel="noopener noreferrer"
                    fontSize="xs" color="blue.400" textDecoration="underline"
                    onClick={(e) => e.stopPropagation()}>
                    Ver painel de Ads ↗
                  </Text>
                </VStack>
              ) : hasAds ? (
                <VStack align="start" spacing={1}>
                  <HStack>
                    <Badge colorScheme={item.ads.status === "active" ? "green" : "gray"} fontSize="xs">
                      {item.ads.status === "active" ? "Ads ativo" : item.ads.status}
                    </Badge>
                  </HStack>
                  <Text fontSize="xs">Gasto: <strong>{fmtCurrency(item.ads.spend)}</strong></Text>
                  {item.ads.roas != null && (
                    <Text fontSize="xs">ROAS: <strong
                      style={{ color: item.ads.roas >= 3 ? "green" : item.ads.roas >= 1 ? "orange" : "red" }}>
                      {item.ads.roas.toFixed(2)}x
                    </strong></Text>
                  )}
                  <Text fontSize="xs" color={muted}>
                    {fmtNum(item.ads.impressions)} imp · {fmtNum(item.ads.clicks)} cliques
                  </Text>
                </VStack>
              ) : (
                <VStack align="start" spacing={1}>
                  <Text fontSize="xs" color={muted}>Sem campanha ativa</Text>
                </VStack>
              )}
            </Box>
          </Grid>

          {/* ── Row 3: Score de Saúde + Score da Ficha ───────────────────── */}
          <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4} mb={4}>

            {/* Health score */}
            <Box>
              <SectionHeader>
                Score de Saúde —{" "}
                <Badge colorScheme={SCORE_COLOR(item.score)}>
                  {item.score_label} {item.score}/100
                </Badge>
              </SectionHeader>
              <VStack align="stretch" spacing={0} divider={<Divider />}>
                {item.score_details?.map((d) => <ScoreRow key={d.factor} {...d} />)}
              </VStack>
            </Box>

            {/* Ficha quality score */}
            <Box>
              <SectionHeader>
                Qualidade da Ficha —{" "}
                <Badge colorScheme={SCORE_COLOR(item.ficha_score)}>
                  {item.ficha_label} {item.ficha_score}/100
                </Badge>
              </SectionHeader>
              <VStack align="stretch" spacing={0} divider={<Divider />}>
                {item.ficha_details?.map((d) => <ScoreRow key={d.factor} {...d} />)}
              </VStack>
            </Box>
          </Grid>

          {/* ── Row 4: Alerts ────────────────────────────────────────────── */}
          {hasAlerts && (
            <Box mb={4}>
              <SectionHeader>Alertas ({item.alerts.length})</SectionHeader>
              <Flex gap={2} flexWrap="wrap">
                {item.alerts.map((alert, i) => (
                  <Box key={i} bg={alertBg} border="1px solid" borderColor={alertBorder}
                    borderRadius="md" px={3} py={2}>
                    <Text fontSize="xs" color={warnColor}>⚠ {alert}</Text>
                  </Box>
                ))}
              </Flex>
            </Box>
          )}

          {/* ── Row 5: Market price comparison ───────────────────────── */}
          <Box mb={4}>
            <SectionHeader>Análise de Preço de Mercado</SectionHeader>
            <MarketComparison item={item} storeId={storeId} />
          </Box>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <Flex justify="flex-end">
            <Button as="a" href={item.permalink} target="_blank" rel="noopener noreferrer"
              size="xs" variant="outline" colorScheme="blue" rightIcon={<ExternalLinkIcon />}>
              Ver no Mercado Livre
            </Button>
          </Flex>
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnunciosDashboard() {
  const [stores, setStores]               = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [items, setItems]                 = useState([]);
  const [loading, setLoading]             = useState(false);
  const [storesLoading, setStoresLoading] = useState(true);

  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState("all");
  const [sortBy, setSortBy]               = useState("revenue");
  const [period, setPeriod]               = useState("30d");

  const toast      = useToast();
  const bg         = useColorModeValue("gray.50", "gray.800");
  const mutedColor = useColorModeValue("gray.500", "gray.400");
  const periodBtnActive   = useColorModeValue("blue.500", "blue.300");
  const periodBtnInactive = useColorModeValue("gray.200", "gray.600");

  useEffect(() => {
    fetchStoresManagement()
      .then((data) => {
        const connected = data.filter((s) => s.status === "connected");
        setStores(connected);
        if (connected.length === 1) setSelectedStore(String(connected[0].id));
      })
      .catch(() => {})
      .finally(() => setStoresLoading(false));
  }, []);

  useEffect(() => {
    if (selectedStore) loadAnuncios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore]);

  async function loadAnuncios() {
    if (!selectedStore) return;
    setLoading(true);
    setItems([]);
    try {
      const data = await fetchAnuncios(selectedStore);
      setItems(data.items || []);
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 6000 });
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let result = [...items];
    if (statusFilter !== "all") result = result.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q) || String(i.id).includes(q));
    }
    const sortFns = {
      revenue:    (a, b) => (getRevenue(b, period) ?? b.sold_quantity * b.price) - (getRevenue(a, period) ?? a.sold_quantity * a.price),
      sold:       (a, b) => (getSold(b, period) ?? b.sold_quantity) - (getSold(a, period) ?? a.sold_quantity),
      visits:     (a, b) => getVisits(b, period)              - getVisits(a, period),
      conversion: (a, b) => (getConversion(b, period) ?? -1)  - (getConversion(a, period) ?? -1),
      score:      (a, b) => b.score      - a.score,
      ficha:      (a, b) => b.ficha_score - a.ficha_score,
      price:      (a, b) => b.price      - a.price,
      stock_days: (a, b) => (a.stock_days ?? 9999) - (b.stock_days ?? 9999),
    };
    result.sort(sortFns[sortBy] || sortFns.revenue);
    return result;
  }, [items, search, statusFilter, sortBy, period]);

  const summary = useMemo(() => {
    const active      = items.filter((i) => i.status === "active");
    const withAlerts  = items.filter((i) => i.alerts?.length > 0).length;
    const urgentStock = items.filter((i) => i.stock_days != null && i.stock_days <= 7).length;
    const totalSold    = items.reduce((s, i) => s + getSold(i, period), 0);
    const totalRevenue = items.reduce((s, i) => s + getRevenue(i, period), 0);
    const avgTicket    = totalSold > 0 ? totalRevenue / totalSold : 0;
    return { total: items.length, active: active.length, totalSold, totalRevenue, avgTicket, withAlerts, urgentStock };
  }, [items, period]);

  const hasData = items.length > 0;

  return (
    <Box minH="100vh" bg={bg} p={{ base: 3, md: 6 }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb={6} flexWrap="wrap" gap={3}>
        <Box>
          <Text fontSize="2xl" fontWeight="bold">Anúncios</Text>
          <Text fontSize="sm" color={mutedColor}>Performance dos seus anúncios no Mercado Livre</Text>
        </Box>
        <HStack spacing={2}>
          {storesLoading ? <Spinner size="sm" /> : stores.length === 0 ? (
            <Text fontSize="sm" color="orange.500">Nenhuma loja conectada.</Text>
          ) : (
            <Select size="sm" value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)}
              minW="220px" borderRadius="md">
              <option value="">Selecionar loja...</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          {selectedStore && (
            <Tooltip label="Recarregar">
              <Button size="sm" variant="outline" onClick={loadAnuncios} isLoading={loading}>
                <RepeatIcon />
              </Button>
            </Tooltip>
          )}
        </HStack>
      </Flex>

      {loading && (
        <Flex justify="center" align="center" py={20} direction="column" gap={4}>
          <Spinner size="xl" color="blue.500" thickness="3px" />
          <Text color={mutedColor} fontSize="sm">Buscando anúncios e métricas...</Text>
        </Flex>
      )}

      {!loading && !selectedStore && (
        <Flex justify="center" align="center" py={20}>
          <Text color={mutedColor}>Selecione uma loja para ver os anúncios.</Text>
        </Flex>
      )}

      {!loading && hasData && (
        <VStack spacing={6} align="stretch">
          {/* Summary cards */}
          <Grid templateColumns={{ base: "1fr 1fr", md: "repeat(4,1fr)", lg: "repeat(7,1fr)" }} gap={3}>
            <SummaryCard label="Total"         value={fmtNum(summary.total)} />
            <SummaryCard label="Ativos"        value={fmtNum(summary.active)} color="green.500" />
            <SummaryCard label={`Vendas (${period})`} value={fmtNum(summary.totalSold)} />
            <SummaryCard label={`Receita (${period})`} value={fmtCurrency(summary.totalRevenue)} color="blue.500" />
            <SummaryCard label="Ticket médio"  value={fmtCurrency(summary.avgTicket)} />
            <SummaryCard label="Com alertas"   value={fmtNum(summary.withAlerts)}
              color={summary.withAlerts > 0 ? "orange.500" : "green.500"} helpText="anúncios" />
            <SummaryCard label="Estoque crítico" value={fmtNum(summary.urgentStock)}
              color={summary.urgentStock > 0 ? "red.500" : "green.500"} helpText="≤7 dias" />
          </Grid>

          {/* Alerts panel */}
          <AlertsPanel items={items} />

          {/* Filters + Period selector */}
          <Flex gap={3} flexWrap="wrap" align="center">
            <InputGroup size="sm" maxW="260px">
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input placeholder="Buscar anúncio..." value={search}
                onChange={(e) => setSearch(e.target.value)} borderRadius="md" />
            </InputGroup>
            <Select size="sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} maxW="160px">
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="paused">Pausados</option>
              <option value="closed">Encerrados</option>
              <option value="inactive">Inativos</option>
            </Select>
            <Select size="sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)} maxW="220px">
              <option value="revenue">Ordenar: Receita</option>
              <option value="sold">Ordenar: Vendas</option>
              <option value="visits">Ordenar: Visitas</option>
              <option value="conversion">Ordenar: Conversão</option>
              <option value="score">Ordenar: Saúde</option>
              <option value="ficha">Ordenar: Qualidade ficha</option>
              <option value="stock_days">Ordenar: Dias de estoque</option>
              <option value="price">Ordenar: Preço</option>
            </Select>

            {/* Period selector */}
            <ButtonGroup size="sm" isAttached variant="outline">
              {["7d", "15d", "30d"].map((p) => (
                <Button
                  key={p}
                  onClick={() => setPeriod(p)}
                  colorScheme={period === p ? "blue" : "gray"}
                  variant={period === p ? "solid" : "outline"}
                  color={period === p ? "white" : undefined}
                  borderColor={period === p ? periodBtnActive : periodBtnInactive}
                >
                  {p}
                </Button>
              ))}
            </ButtonGroup>

            <Text fontSize="xs" color={mutedColor}>
              {filtered.length} de {items.length} anúncios
            </Text>
          </Flex>

          {/* List */}
          <VStack spacing={2} align="stretch">
            {filtered.map((item) => <ItemCard key={item.id} item={item} period={period} storeId={selectedStore} />)}
          </VStack>
        </VStack>
      )}

      {!loading && hasData && filtered.length === 0 && (
        <Flex justify="center" py={10}>
          <Text color={mutedColor} fontSize="sm">Nenhum anúncio encontrado com os filtros aplicados.</Text>
        </Flex>
      )}
    </Box>
  );
}
