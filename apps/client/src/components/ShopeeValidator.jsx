import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Flex, HStack, VStack, Text, Heading, Button, Input, InputGroup,
  InputLeftElement, InputRightElement, Select,
  SimpleGrid, Table, Thead, Tbody, Tr, Th, Td, Badge, Spinner,
  FormControl, FormLabel, Alert, AlertIcon, AlertDescription,
  Tooltip, Divider, useColorModeValue, useBreakpointValue, IconButton,
} from "@chakra-ui/react";
import { AttachmentIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon, CloseIcon } from "@chakra-ui/icons";
import { fetchValidadorShopeeStores, reconciliateShopee } from "../api";
import useAppToast from "../hooks/useAppToast";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtBRL = (v) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

const CAUSA_STYLE = {
  ok:              { bg: "#EAF3DE", color: "#27500A", label: "OK" },
  em_aberto:       { bg: "#FFF2CC", color: "#633806", label: "Em aberto" },
  cancelado:       { bg: "#FCE4D6", color: "#993C1D", label: "Cancelado" },
  taxa_adicional:  { bg: "#FFF3E0", color: "#7D4900", label: "Taxa adicional 2,5%" },
  peso_divergente: { bg: "#FAEEDA", color: "#633806", label: "Peso divergente" },
  afiliado:        { bg: "#E6F1FB", color: "#0C447C", label: "Afiliado" },
  multi_item:      { bg: "#E8ECF7", color: "#2B3A67", label: "Multi-item" },
  investigar:      { bg: "#FCEBEB", color: "#791F1F", label: "Investigar" },
};

const FILTERS = [
  { key: "all",             label: "Todos"            },
  { key: "ok",              label: "OK"               },
  { key: "em_aberto",       label: "Em aberto"        },
  { key: "requerem_acao",   label: "Requerem ação"    },
  { key: "taxa_adicional",  label: "Taxa adicional"   },
  { key: "peso_divergente", label: "Peso divergente"  },
  { key: "afiliado",        label: "Afiliado"         },
  { key: "multi_item",      label: "Multi-item"       },
  { key: "investigar",      label: "Investigar"       },
  { key: "cancelado",       label: "Cancelado"        },
];

const ACAO_KEYS = new Set(["taxa_adicional", "peso_divergente", "afiliado", "investigar"]);

const filterOrders = (orders, key) => {
  if (key === "all") return orders;
  if (key === "requerem_acao") return orders.filter((o) => ACAO_KEYS.has(o.causaKey));
  return orders.filter((o) => o.causaKey === key);
};

const today = new Date();
const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const toDateStr = (d) => d.toISOString().slice(0, 10);

// ── Causa Pill ────────────────────────────────────────────────────────────────

function CausaPill({ causaKey, causaLabel }) {
  const st = CAUSA_STYLE[causaKey] || { bg: "#EDF2F7", color: "#2D3748", label: causaLabel };
  return (
    <Box
      display="inline-block"
      px={2.5}
      py={0.5}
      borderRadius="md"
      fontSize="xs"
      fontWeight="600"
      bg={st.bg}
      color={st.color}
      whiteSpace="nowrap"
    >
      {causaLabel || st.label}
    </Box>
  );
}

// ── Métricas Cards ────────────────────────────────────────────────────────────

function MetricCard({ label, value, color, sub, onClick, active }) {
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const cardBg = useColorModeValue("white", "gray.700");
  const activeRing = useColorModeValue("blue.300", "blue.400");
  const clickable = typeof onClick === "function";
  return (
    <Box
      p={3}
      borderRadius="lg"
      borderWidth="1px"
      borderColor={active ? activeRing : borderColor}
      borderLeftWidth="4px"
      borderLeftColor={color}
      bg={cardBg}
      cursor={clickable ? "pointer" : "default"}
      transition="transform 0.1s ease, box-shadow 0.1s ease"
      _hover={clickable ? { transform: "translateY(-1px)", boxShadow: "sm" } : undefined}
      onClick={clickable ? onClick : undefined}
      boxShadow={active ? "0 0 0 2px var(--chakra-colors-blue-300)" : undefined}
    >
      <Text fontSize="xs" color="gray.500" textTransform="uppercase" letterSpacing="wider">{label}</Text>
      <Text fontSize="2xl" fontWeight="bold" mt={1} lineHeight="1.1">{value}</Text>
      {sub && <Text fontSize="xs" color="gray.500" mt={1}>{sub}</Text>}
    </Box>
  );
}

// ── Detail Panel (expansível) ─────────────────────────────────────────────────

function OrderDetail({ row }) {
  const leftBg = useColorModeValue("gray.50", "gray.800");
  const rightBg = useColorModeValue("blue.50", "blue.900");
  const lineBg = useColorModeValue("white", "gray.700");
  const wrapperBg = useColorModeValue("gray.50", "gray.900");
  const causaBoxBg = useColorModeValue("white", "gray.700");
  const causaBoxBorder = useColorModeValue("gray.200", "gray.600");

  const LineItem = ({ label, value, bold, negative, highlight, color }) => (
    <HStack justify="space-between" py={1.5} px={3} bg={highlight ? lineBg : "transparent"} borderRadius="sm">
      <Text fontSize="sm" fontWeight={bold ? "600" : "normal"} color={color}>{label}</Text>
      <Text fontSize="sm" fontWeight={bold ? "700" : "500"} color={negative ? "red.500" : color} fontFamily="mono">
        {value}
      </Text>
    </HStack>
  );

  const hasIncome = row.valorLiberado != null;
  const hasCalc = row.liberadoEsperado != null;
  const precoCalc = row.precoIncome ?? row.precoTabela;
  const voucherCalc = row.voucher ?? row.descontoSeller ?? 0;

  return (
    <Box p={4} bg={wrapperBg} borderRadius="md" mt={2}>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
        {/* Coluna esquerda — Como calculamos */}
        <Box p={3} bg={leftBg} borderRadius="md">
          <HStack justify="space-between" mb={2}>
            <Text fontSize="sm" fontWeight="700" color="gray.600" textTransform="uppercase" letterSpacing="wider">
              Como calculamos
            </Text>
            {row.liberadoEsperadoProjecao && (
              <Badge colorScheme="yellow" fontSize="xx-small">Projeção</Badge>
            )}
          </HStack>
          {hasCalc ? (
            <VStack align="stretch" spacing={0}>
              <LineItem label={`Preço de venda${row.faixaLabel ? ` (${row.faixaLabel})` : ""}`} value={fmtBRL(precoCalc)} />
              <LineItem label={`(–) Voucher seller${row.cupom ? ` [${row.cupom}]` : ""}`} value={`– ${fmtBRL(voucherCalc)}`} negative />
              <Divider my={1} />
              <LineItem label="Base de cálculo" value={fmtBRL(row.baseCalculo)} bold highlight />
              <LineItem
                label={`(–) Comissão ${row.comissaoPct ? (row.comissaoPct * 100).toFixed(0) + "%" : ""} × base`}
                value={`– ${fmtBRL(row.comissaoEsperada)}`}
                negative
              />
              <LineItem
                label={`(–) Taxa fixa ${fmtBRL(row.taxaFixaUnit)} × ${row.nItens} item(ns)`}
                value={`– ${fmtBRL(row.totalFixoEsperado)}`}
                negative
              />
              {row.afiliado > 0 && (
                <LineItem label="(–) Comissão afiliado" value={`– ${fmtBRL(row.afiliado)}`} negative />
              )}
              <Divider my={1} />
              <LineItem label="Liberado esperado" value={fmtBRL(row.liberadoEsperado)} bold highlight />
            </VStack>
          ) : (
            <Text fontSize="sm" color="gray.500">Pedido cancelado — não aplicável.</Text>
          )}
        </Box>

        {/* Coluna direita — O que a Shopee pagou */}
        <Box p={3} bg={rightBg} borderRadius="md">
          <Text fontSize="sm" fontWeight="700" mb={2} color="gray.600" textTransform="uppercase" letterSpacing="wider">
            O que a Shopee pagou
          </Text>
          {hasIncome ? (
            <VStack align="stretch" spacing={0}>
              <LineItem label="Comissão cobrada" value={fmtBRL(row.comissaoReal)} />
              <LineItem label="Taxa de serviço cobrada" value={fmtBRL(row.taxaServicoReal)} />
              {row.taxaAdicional > 0 && (
                <LineItem label="Taxa adicional 2,5%" value={fmtBRL(row.taxaAdicional)} color="#7D4900" />
              )}
              {row.afiliado > 0 && (
                <LineItem label="Comissão afiliado" value={fmtBRL(row.afiliado)} color="#0C447C" />
              )}
              {row.diffFrete != null && row.diffFrete !== 0 && (
                <LineItem
                  label={`Frete extra (peso): ${fmtBRL(row.freteEsperado)} → ${fmtBRL(row.freteReal)}`}
                  value={fmtBRL(row.diffFrete)}
                  color="#633806"
                />
              )}
              <Divider my={1} />
              <LineItem label="Liberado real (income)" value={fmtBRL(row.valorLiberado)} bold highlight />
              <LineItem
                label="Diferença"
                value={fmtBRL(row.diff)}
                bold
                negative={row.diff != null && row.diff < -0.01}
              />
            </VStack>
          ) : (
            <Text fontSize="sm" color="gray.500">Pedido ainda não liberado pela Shopee.</Text>
          )}
        </Box>
      </SimpleGrid>

      {/* Box da causa */}
      <Box mt={4} p={3} borderRadius="md" bg={causaBoxBg} borderWidth="1px" borderColor={causaBoxBorder}>
        <HStack mb={2}>
          <CausaPill causaKey={row.causaKey} causaLabel={row.causaLabel} />
          <Text fontSize="xs" color="gray.500">
            ID plataforma: {row.platformOrderId || "—"} &bull; Pedido interno: {row.internalOrderId || "—"}
          </Text>
        </HStack>
        <Text fontSize="sm" color="gray.600">
          {causaDescription(row.causaKey, row)}
        </Text>
        {row.motivoFrete && (
          <Text fontSize="xs" color="gray.500" mt={2}>
            <b>Motivo frete:</b> {row.motivoFrete}
          </Text>
        )}
      </Box>
    </Box>
  );
}

function causaDescription(key, row) {
  switch (key) {
    case "ok":
      return "Tudo certo — o valor liberado pela Shopee bate com o cálculo esperado.";
    case "em_aberto":
      return "Pedido ainda não foi liberado pela Shopee. É normal para pedidos recentes (ciclo de 5–10 dias após entrega).";
    case "cancelado":
      return "Pedido cancelado. Não há liberação a reconciliar.";
    case "taxa_adicional":
      return "A Shopee cobrou uma taxa de serviço adicional de 2,5% do valor base. Isso pode ser campanha/promoção da plataforma. Recomendado abrir chamado no suporte.";
    case "peso_divergente":
      return "O peso real do produto foi maior do que o peso cadastrado. A Shopee cobrou frete extra. Corrija o peso no Seller Centre.";
    case "afiliado":
      return "Pedido veio via programa de afiliados (~20% de comissão extra). Avalie custo-benefício do programa.";
    case "multi_item":
      return "Pedido com mais de um item distinto — a taxa fixa é multiplicada pelo número de itens.";
    case "investigar":
      return "Diferença não explicada por nenhuma das causas conhecidas. Investigar manualmente.";
    default:
      return "";
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ShopeeValidator() {
  const toast = useAppToast();
  const [stores, setStores] = useState([]);
  const [start, setStart] = useState(toDateStr(firstDayOfMonth));
  const [end, setEnd] = useState(toDateStr(today));
  const [store, setStore] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [causaFilter, setCausaFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const fileRef = useRef(null);

  const headerBg = useColorModeValue("gray.50", "gray.800");
  const rowHoverBg = useColorModeValue("gray.50", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const cardBg = useColorModeValue("white", "gray.700");
  const viewportOffset = useBreakpointValue({ base: "72px", md: "48px" }) || "48px";

  useEffect(() => {
    fetchValidadorShopeeStores()
      .then((r) => setStores(r.stores || []))
      .catch(() => {});
  }, []);

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Selecione o arquivo Income Report.", status: "warning" });
      return;
    }
    if (!start || !end) {
      toast({ title: "Informe o período.", status: "warning" });
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const result = await reconciliateShopee({ start, end, store, incomeReport: file });
      setData(result);
      setCausaFilter("all");
      setSearch("");
      setExpanded(null);
      toast({ title: `Reconciliação concluída: ${result.orders?.length || 0} pedidos.`, status: "success" });
    } catch (err) {
      toast({ title: "Erro ao processar", description: err.message, status: "error" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!data?.orders) return [];
    const base = filterOrders(data.orders, causaFilter);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((o) => {
      const pid = String(o.platformOrderId || "").toLowerCase();
      const iid = String(o.internalOrderId || "").toLowerCase();
      return pid.includes(q) || iid.includes(q);
    });
  }, [data, causaFilter, search]);

  return (
    <Flex direction="column" h={`calc(100dvh - ${viewportOffset})`} minH={0}>
      <Box flexShrink={0}>
        <Heading size="lg" mb={1}>Validador de Taxas — Shopee</Heading>
        <Text fontSize="sm" color="gray.500" mb={4}>
          Cruzamento de pedidos do sistema (via UpSeller) com o Income Report da Shopee.
        </Text>
      </Box>

      {/* Passo 1: filtros + upload (linha única) */}
      <Flex
        flexShrink={0}
        p={3}
        borderRadius="lg"
        borderWidth="1px"
        borderColor={borderColor}
        bg={cardBg}
        mb={3}
        gap={3}
        align="flex-end"
        wrap={{ base: "wrap", lg: "nowrap" }}
      >
        <FormControl flex="0 0 auto" w="135px">
          <FormLabel fontSize="xs" mb={1}>De</FormLabel>
          <Input size="sm" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormControl>
        <FormControl flex="0 0 auto" w="135px">
          <FormLabel fontSize="xs" mb={1}>Até</FormLabel>
          <Input size="sm" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </FormControl>
        <FormControl flex="1 1 180px" minW="180px">
          <FormLabel fontSize="xs" mb={1}>Loja Shopee</FormLabel>
          <Select size="sm" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Todas">
            {stores.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormControl>
        <FormControl flex="1 1 220px" minW="220px">
          <FormLabel fontSize="xs" mb={1}>Income Report (.xlsx)</FormLabel>
          <Input
            ref={fileRef}
            size="sm"
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            p={1}
          />
        </FormControl>
        <Button
          flexShrink={0}
          leftIcon={<AttachmentIcon />}
          colorScheme="blue"
          size="sm"
          onClick={handleUpload}
          isLoading={loading}
          isDisabled={!file}
        >
          Processar
        </Button>
      </Flex>

      {loading && (
        <Flex justify="center" py={10}>
          <VStack>
            <Spinner color="blue.500" size="lg" />
            <Text fontSize="sm" color="gray.500">Processando cruzamento...</Text>
          </VStack>
        </Flex>
      )}

      {!loading && !data && (
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            Exporte o Income Report da Shopee (Seller Centre &rarr; Finanças &rarr; Rendimentos) e envie para cruzar com os pedidos já sincronizados via UpSeller.
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* Métricas — clicáveis para filtrar a tabela */}
          <SimpleGrid flexShrink={0} columns={{ base: 2, md: 4 }} spacing={3} mb={3}>
            <MetricCard
              label="Tudo certo"
              value={data.summary.ok}
              color="green.400"
              sub={`Total liberado: ${fmtBRL(data.summary.totalLiberado)}`}
              active={causaFilter === "ok"}
              onClick={() => setCausaFilter(causaFilter === "ok" ? "all" : "ok")}
            />
            <MetricCard
              label="Em aberto"
              value={data.summary.emAberto}
              color="yellow.400"
              sub={`A receber: ${fmtBRL(data.summary.totalLiberadoEsperadoEmAberto)}`}
              active={causaFilter === "em_aberto"}
              onClick={() => setCausaFilter(causaFilter === "em_aberto" ? "all" : "em_aberto")}
            />
            <MetricCard
              label="Requerem ação"
              value={
                data.summary.taxaAdicional + data.summary.pesoDivergente +
                data.summary.afiliado + data.summary.investigar
              }
              color="red.400"
              sub={`Investigar: ${data.summary.investigar} · Taxa adic.: ${data.summary.taxaAdicional}`}
              active={causaFilter === "requerem_acao"}
              onClick={() => setCausaFilter(causaFilter === "requerem_acao" ? "all" : "requerem_acao")}
            />
            <MetricCard
              label="Impacto financeiro"
              value={fmtBRL(data.summary.impactoFinanceiro)}
              color="orange.400"
              sub="Soma das diferenças não-OK"
            />
          </SimpleGrid>

          {/* Busca + filtros por causa */}
          <Flex flexShrink={0} gap={3} mb={3} align="center" wrap="wrap">
            <InputGroup size="sm" maxW="260px" flexShrink={0}>
              <InputLeftElement pointerEvents="none" h="32px">
                <SearchIcon color="gray.400" boxSize={3} />
              </InputLeftElement>
              <Input
                placeholder="Buscar Nº pedido (Shopee ou UpSeller)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <InputRightElement h="32px">
                  <IconButton
                    aria-label="Limpar busca"
                    icon={<CloseIcon boxSize={2} />}
                    size="xs"
                    variant="ghost"
                    onClick={() => setSearch("")}
                  />
                </InputRightElement>
              )}
            </InputGroup>
            <HStack spacing={2} wrap="wrap">
              {FILTERS.map((f) => {
                const count = filterOrders(data.orders, f.key).length;
                const active = causaFilter === f.key;
                return (
                  <Button
                    key={f.key}
                    size="xs"
                    variant={active ? "solid" : "outline"}
                    colorScheme={active ? "blue" : "gray"}
                    onClick={() => setCausaFilter(f.key)}
                  >
                    {f.label} <Badge ml={2} colorScheme={active ? "whiteAlpha" : "gray"}>{count}</Badge>
                  </Button>
                );
              })}
            </HStack>
          </Flex>

          {/* Tabela (scroll apenas desta área; cabeçalho da tabela fica sticky) */}
          <Box
            flex="1"
            minH={0}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="lg"
            overflow="auto"
            bg={cardBg}
          >
            <Table size="sm" variant="simple" sx={{ tableLayout: "auto", minWidth: "900px" }}>
              <Thead>
                <Tr>
                  <Th w="28px" position="sticky" top={0} zIndex={2} bg={headerBg}></Th>
                  <Th position="sticky" top={0} zIndex={2} bg={headerBg} whiteSpace="nowrap">Nº Pedido</Th>
                  <Th position="sticky" top={0} zIndex={2} bg={headerBg} whiteSpace="nowrap">Data</Th>
                  <Th position="sticky" top={0} zIndex={2} bg={headerBg}>Produto</Th>
                  <Th position="sticky" top={0} zIndex={2} bg={headerBg} isNumeric whiteSpace="nowrap">Preço Tabela</Th>
                  <Th position="sticky" top={0} zIndex={2} bg={headerBg} isNumeric whiteSpace="nowrap">Liberado Esp.</Th>
                  <Th position="sticky" top={0} zIndex={2} bg={headerBg} isNumeric whiteSpace="nowrap">Liberado Real</Th>
                  <Th position="sticky" top={0} zIndex={2} bg={headerBg} isNumeric whiteSpace="nowrap">Diff</Th>
                  <Th position="sticky" top={0} zIndex={2} bg={headerBg} whiteSpace="nowrap">Causa</Th>
                </Tr>
              </Thead>
              <Tbody>
                  {filtered.length === 0 && (
                    <Tr>
                      <Td colSpan={9}>
                        <Text fontSize="sm" color="gray.500" py={4} textAlign="center">
                          Nenhum pedido nesta categoria.
                        </Text>
                      </Td>
                    </Tr>
                  )}
                  {filtered.map((row) => {
                    const key = `${row.platformOrderId || row.internalOrderId}:${row.orderId}`;
                    const isExpanded = expanded === key;
                    const diffColor =
                      row.diff == null ? "gray.500"
                      : row.diff < -0.01 ? "red.500"
                      : row.diff > 0.01 ? "green.500"
                      : "gray.500";
                    return (
                      <Fragment key={key}>
                        <Tr
                          _hover={{ bg: rowHoverBg }}
                          cursor="pointer"
                          onClick={() => setExpanded(isExpanded ? null : key)}
                        >
                          <Td>
                            <IconButton
                              size="xs"
                              variant="ghost"
                              aria-label="Expandir"
                              icon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                            />
                          </Td>
                          <Td fontFamily="mono" fontSize="xs" whiteSpace="nowrap">{row.platformOrderId || row.internalOrderId}</Td>
                          <Td fontSize="xs" whiteSpace="nowrap">{fmtDate(row.date)}</Td>
                          <Td>
                            <Tooltip label={row.produto}>
                              <Text maxW="240px" noOfLines={1} fontSize="sm">{row.produto}</Text>
                            </Tooltip>
                          </Td>
                          <Td isNumeric fontSize="sm" whiteSpace="nowrap">{fmtBRL(row.precoTabela)}</Td>
                          <Td isNumeric fontSize="sm" whiteSpace="nowrap">{fmtBRL(row.liberadoEsperado)}</Td>
                          <Td isNumeric fontSize="sm" whiteSpace="nowrap">{fmtBRL(row.valorLiberado)}</Td>
                          <Td isNumeric fontSize="sm" color={diffColor} fontWeight="600" whiteSpace="nowrap">
                            {row.diff == null ? "—" : fmtBRL(row.diff)}
                          </Td>
                          <Td whiteSpace="nowrap"><CausaPill causaKey={row.causaKey} causaLabel={row.causaLabel} /></Td>
                        </Tr>
                        {isExpanded && (
                          <Tr>
                            <Td colSpan={9} p={0}>
                              <OrderDetail row={row} />
                            </Td>
                          </Tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>

          {data.incomeWithoutAnalitico?.length > 0 && (
            <Alert flexShrink={0} status="warning" mt={3} borderRadius="md">
              <AlertIcon />
              <AlertDescription fontSize="sm">
                <b>{data.incomeWithoutAnalitico.length}</b> pedido(s) aparecem no Income Report mas não foram
                encontrados no analítico do período. Geralmente são pedidos criados em meses anteriores —
                podem ser ignorados na reconciliação atual.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </Flex>
  );
}
