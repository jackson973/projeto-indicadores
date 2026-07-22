import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  SimpleGrid,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  Tooltip,
  VStack,
  useBreakpointValue,
  useColorModeValue,
} from "@chakra-ui/react";
import { InfoIcon, SearchIcon } from "@chakra-ui/icons";
import useAppToast from "../hooks/useAppToast";
import { fetchStockConsumption, fetchStockLowStock, fetchStockMovementsReport } from "../api";
import { formatSaoPaulo } from "../utils/timezone";

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt(n, dec = 1) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const TIPO_LABEL = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste" };
const TIPO_COLOR = { entrada: "green", saida: "red", ajuste: "purple" };

// Ordem canônica da grade de tamanhos (PRE, RN, P, M, G, GG, 1..16)
const SIZE_ORDER = ["PRE", "RN", "P", "M", "G", "GG", "XG", "XGG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "12", "14", "16"];
function sizeRank(s) {
  const idx = SIZE_ORDER.indexOf(String(s ?? "").trim().toUpperCase());
  return idx === -1 ? SIZE_ORDER.length : idx;
}

const COBERTURA_INFO =
  "Cobertura = saldo atual ÷ média de saídas por dia (média/dia = saídas do período ÷ dias do período). " +
  "Indica por quantos dias o estoque atual deve durar mantido o ritmo de vendas do período. " +
  "\"—\" significa que não houve saídas no período (sem consumo para estimar).";

// Rótulo + valor usado nos cards do layout mobile
function CardStat({ label, children }) {
  const subtle = useColorModeValue("gray.500", "gray.400");
  return (
    <Box>
      <Text fontSize="10px" textTransform="uppercase" letterSpacing="wide" color={subtle}>{label}</Text>
      <Box fontSize="sm" fontWeight="medium">{children}</Box>
    </Box>
  );
}

export default function StockReports() {
  const subtle = useColorModeValue("gray.500", "gray.400");

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Relatórios de Estoque</Text>
      <Text fontSize="sm" color={subtle} mb={4}>
        Alterne entre o consumo/cobertura e o histórico de movimentações (bipagens, entradas e saídas).
      </Text>

      <Tabs colorScheme="blue" isLazy>
        <TabList>
          <Tab>Consumo &amp; cobertura</Tab>
          <Tab>Movimentações</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <ConsumptionReport />
          </TabPanel>
          <TabPanel px={0}>
            <MovementsReport />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}

// ─── Aba 1: Consumo médio & cobertura ────────────────────────────────────────
function ConsumptionReport() {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - 29);

  const [from, setFrom] = useState(toISO(past));
  const [to, setTo] = useState(toISO(today));
  const [busca, setBusca] = useState("");
  const [report, setReport] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("codigo");
  const toast = useAppToast();

  const isMobile = useBreakpointValue({ base: true, md: false });
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");
  const lowBg = useColorModeValue("red.50", "rgba(254,178,178,0.08)");
  const theadBg = useColorModeValue("gray.100", "gray.700");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rep, low] = await Promise.all([
        fetchStockConsumption(from, to),
        fetchStockLowStock(),
      ]);
      setReport(rep);
      setLowStock(low);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar relatório", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca (código ou nome) + ordenação no cliente; a grade (RN, P, M, G, GG...) é sempre o desempate
  const sortedItems = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let items = [...(report?.items || [])];
    if (q) {
      items = items.filter(i =>
        String(i.product_codigo ?? "").toLowerCase().includes(q) ||
        String(i.descricao ?? "").toLowerCase().includes(q)
      );
    }
    const byGrade = (a, b) => sizeRank(a.tamanho) - sizeRank(b.tamanho);
    const cmp = {
      nome: (a, b) =>
        String(a.descricao ?? "").localeCompare(String(b.descricao ?? ""), "pt-BR", { sensitivity: "base" })
        || byGrade(a, b),
      codigo: (a, b) =>
        String(a.product_codigo ?? "").localeCompare(String(b.product_codigo ?? ""), "pt-BR", { numeric: true, sensitivity: "base" })
        || byGrade(a, b),
      saldo: (a, b) => (a.balance - b.balance) || byGrade(a, b),
      cobertura: (a, b) => {
        const ca = a.coverage_days, cb = b.coverage_days;
        if (ca === null && cb === null) return byGrade(a, b);
        if (ca === null) return 1;
        if (cb === null) return -1;
        return (ca - cb) || byGrade(a, b);
      },
    };
    items.sort(cmp[sortBy] || cmp.codigo);
    return items;
  }, [report, sortBy, busca]);

  const buscando = busca.trim().length > 0;

  return (
    <Box>
      <Flex gap={3} align="end" wrap="wrap" mb={4}>
        <FormControl w={{ base: "calc(50% - 6px)", md: "180px" }}>
          <FormLabel fontSize="sm">De</FormLabel>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </FormControl>
        <FormControl w={{ base: "calc(50% - 6px)", md: "180px" }}>
          <FormLabel fontSize="sm">Até</FormLabel>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </FormControl>
        <FormControl w={{ base: "100%", md: "260px" }}>
          <FormLabel fontSize="sm">Buscar produto</FormLabel>
          <InputGroup>
            <InputLeftElement pointerEvents="none"><SearchIcon color={subtle} /></InputLeftElement>
            <Input placeholder="código ou nome" value={busca} onChange={e => setBusca(e.target.value)} />
          </InputGroup>
        </FormControl>
        <FormControl w={{ base: "calc(60% - 6px)", md: "180px" }}>
          <FormLabel fontSize="sm">Ordenar por</FormLabel>
          <Select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="codigo">Código</option>
            <option value="nome">Nome</option>
            <option value="saldo">Saldo</option>
            <option value="cobertura">Cobertura</option>
          </Select>
        </FormControl>
        <Button colorScheme="blue" onClick={load} flex={{ base: "1", md: "0 0 auto" }}>Atualizar</Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={10}><Spinner /></Flex>
      ) : (
        <>
          {/* Resumo */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={5}>
            <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
              <StatLabel fontSize="xs">Período (dias)</StatLabel>
              <StatNumber fontSize="lg">{report?.days ?? "—"}</StatNumber>
            </Stat>
            <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
              <StatLabel fontSize="xs">Variantes</StatLabel>
              <StatNumber fontSize="lg">
                {buscando ? `${sortedItems.length} de ${report?.items?.length ?? 0}` : report?.items?.length ?? 0}
              </StatNumber>
            </Stat>
            <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
              <StatLabel fontSize="xs">Total de saídas</StatLabel>
              <StatNumber fontSize="lg">{report?.items?.reduce((s, i) => s + i.total_out, 0) ?? 0}</StatNumber>
            </Stat>
            <Stat bg={lowStock.length ? lowBg : cardBg} borderWidth="1px" borderColor={lowStock.length ? "red.300" : border} borderRadius="lg" p={3}>
              <StatLabel fontSize="xs">Estoque baixo</StatLabel>
              <StatNumber fontSize="lg" color={lowStock.length ? "red.500" : undefined}>{lowStock.length}</StatNumber>
            </Stat>
          </SimpleGrid>

          {/* Alerta de estoque baixo (acordeão minimizável; estado lembrado) */}
          {lowStock.length > 0 && (
            <Accordion
              allowToggle
              mb={5}
              defaultIndex={localStorage.getItem("stockLowStockCollapsed") === "1" ? [] : [0]}
              onChange={(idx) =>
                localStorage.setItem("stockLowStockCollapsed", idx === 0 ? "0" : "1")
              }
            >
              <AccordionItem bg={lowBg} borderWidth="1px" borderColor="red.300" borderRadius="lg">
                <AccordionButton _hover={{ bg: "transparent" }} px={4} py={3}>
                  <Text flex="1" textAlign="left" fontWeight="bold" color="red.500">
                    ⚠️ Produtos com estoque baixo
                    <Badge ml={2} colorScheme="red" variant="solid">{lowStock.length}</Badge>
                  </Text>
                  <AccordionIcon color="red.500" />
                </AccordionButton>
                <AccordionPanel px={4} pb={4} pt={0}>
              {isMobile ? (
                <VStack spacing={2} align="stretch">
                  {lowStock.map(v => (
                    <Flex key={v.variant_id} justify="space-between" align="center" gap={2} fontSize="sm">
                      <Text noOfLines={2}>{v.product_codigo} · {v.descricao} <Badge ml={1}>{v.tamanho}</Badge></Text>
                      <Text flexShrink={0} whiteSpace="nowrap">
                        <Badge colorScheme="red">{v.balance}</Badge>
                        <Text as="span" color={subtle}> / mín {v.min_stock}</Text>
                      </Text>
                    </Flex>
                  ))}
                </VStack>
              ) : (
                <Box overflowX="auto">
                  <Table size="sm">
                    <Thead><Tr><Th>Produto</Th><Th>Tam.</Th><Th isNumeric>Saldo</Th><Th isNumeric>Mínimo</Th></Tr></Thead>
                    <Tbody>
                      {lowStock.map(v => (
                        <Tr key={v.variant_id}>
                          <Td>{v.product_codigo} · {v.descricao}</Td>
                          <Td>{v.tamanho}</Td>
                          <Td isNumeric><Badge colorScheme="red">{v.balance}</Badge></Td>
                          <Td isNumeric>{v.min_stock}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          )}

          {/* Consumo médio */}
          <Text fontWeight="semibold" mb={2}>Consumo médio &amp; cobertura</Text>
          {!sortedItems.length ? (
            <Text fontSize="sm" color={subtle}>
              {buscando ? "Nenhum produto encontrado para a busca." : "Sem dados no período."}
            </Text>
          ) : isMobile ? (
            <VStack spacing={2} align="stretch">
              {sortedItems.map(i => {
                const low = i.min_stock > 0 && i.balance <= i.min_stock;
                const riscoCobertura = i.coverage_days !== null && i.coverage_days < 7;
                return (
                  <Box
                    key={i.variant_id}
                    bg={low ? lowBg : cardBg}
                    borderWidth="1px"
                    borderColor={low ? "red.300" : border}
                    borderRadius="lg"
                    p={3}
                  >
                    <Flex justify="space-between" align="start" gap={2} mb={2}>
                      <Text fontSize="sm" fontWeight="semibold" noOfLines={2}>
                        {i.product_codigo} · {i.descricao}
                      </Text>
                      <Badge flexShrink={0}>{i.tamanho}</Badge>
                    </Flex>
                    <SimpleGrid columns={3} spacingX={2} spacingY={3}>
                      <CardStat label="Saldo">
                        <Badge colorScheme={low ? "red" : "gray"}>{i.balance}</Badge>
                      </CardStat>
                      <CardStat label="Saídas">{i.total_out}</CardStat>
                      <CardStat label="Média/dia">{fmt(i.avg_daily, 2)}</CardStat>
                      <CardStat label="Cobertura">
                        {i.coverage_days === null ? (
                          <Text as="span" color={subtle}>—</Text>
                        ) : (
                          <Badge colorScheme={riscoCobertura ? "orange" : "green"}>{fmt(i.coverage_days, 1)} dias</Badge>
                        )}
                      </CardStat>
                      <CardStat label="Mínimo">{i.min_stock}</CardStat>
                    </SimpleGrid>
                  </Box>
                );
              })}
            </VStack>
          ) : (
            <Box overflowX="auto" overflowY="auto" maxH="70vh">
              <Table size="sm">
                <Thead position="sticky" top={0} zIndex={1} bg={theadBg}>
                  <Tr>
                    <Th>Produto</Th><Th>Tam.</Th>
                    <Th isNumeric>Saldo</Th><Th isNumeric>Saídas (período)</Th>
                    <Th isNumeric>Média/dia</Th>
                    <Th isNumeric>
                      <Tooltip hasArrow placement="top" openDelay={200} maxW="320px" label={COBERTURA_INFO}>
                        <Box as="span" display="inline-flex" alignItems="center" gap={1} cursor="help">
                          Cobertura (dias)
                          <InfoIcon boxSize={3} color={subtle} />
                        </Box>
                      </Tooltip>
                    </Th>
                    <Th isNumeric>Mínimo</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sortedItems.map(i => {
                    const low = i.min_stock > 0 && i.balance <= i.min_stock;
                    const riscoCobertura = i.coverage_days !== null && i.coverage_days < 7;
                    return (
                      <Tr key={i.variant_id} bg={low ? lowBg : undefined}>
                        <Td>{i.product_codigo} · {i.descricao}</Td>
                        <Td>{i.tamanho}</Td>
                        <Td isNumeric><Badge colorScheme={low ? "red" : "gray"}>{i.balance}</Badge></Td>
                        <Td isNumeric>{i.total_out}</Td>
                        <Td isNumeric>{fmt(i.avg_daily, 2)}</Td>
                        <Td isNumeric>
                          {i.coverage_days === null ? (
                            <Text as="span" color={subtle}>—</Text>
                          ) : (
                            <Badge colorScheme={riscoCobertura ? "orange" : "green"}>{fmt(i.coverage_days, 1)}</Badge>
                          )}
                        </Td>
                        <Td isNumeric>{i.min_stock}</Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

// ─── Aba 2: Movimentações (bipagens / entradas / saídas / ajustes) ───────────
function MovementsReport() {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - 29);

  const [from, setFrom] = useState(toISO(past));
  const [to, setTo] = useState(toISO(today));
  const [codigo, setCodigo] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useAppToast();

  const isMobile = useBreakpointValue({ base: true, md: false });
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");
  const theadBg = useColorModeValue("gray.100", "gray.700");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchStockMovementsReport({
        from, to, tipo: tipo || undefined,
        product_codigo: codigo.trim() || undefined,
        tamanho: tamanho.trim() || undefined,
        q: q.trim() || undefined,
      });
      setData(res);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar movimentações", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [from, to, tipo, codigo, tamanho, q, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items || [];

  return (
    <Box>
      <Flex gap={3} align="end" wrap="wrap" mb={4}>
        <FormControl w={{ base: "calc(50% - 6px)", md: "160px" }}>
          <FormLabel fontSize="sm">De</FormLabel>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </FormControl>
        <FormControl w={{ base: "calc(50% - 6px)", md: "160px" }}>
          <FormLabel fontSize="sm">Até</FormLabel>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </FormControl>
        <FormControl w={{ base: "calc(50% - 6px)", md: "140px" }}>
          <FormLabel fontSize="sm">Cód. produto</FormLabel>
          <Input placeholder="ex: 004" value={codigo} onChange={e => setCodigo(e.target.value)} />
        </FormControl>
        <FormControl w={{ base: "calc(50% - 6px)", md: "110px" }}>
          <FormLabel fontSize="sm">Tamanho</FormLabel>
          <Input placeholder="ex: P" value={tamanho} onChange={e => setTamanho(e.target.value)} />
        </FormControl>
        <FormControl w={{ base: "100%", md: "200px" }}>
          <FormLabel fontSize="sm">Produto / descrição</FormLabel>
          <InputGroup>
            <InputLeftElement pointerEvents="none"><SearchIcon color={subtle} /></InputLeftElement>
            <Input placeholder="buscar" value={q} onChange={e => setQ(e.target.value)} />
          </InputGroup>
        </FormControl>
        <FormControl w={{ base: "calc(60% - 6px)", md: "150px" }}>
          <FormLabel fontSize="sm">Tipo</FormLabel>
          <Select value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
            <option value="ajuste">Ajuste</option>
          </Select>
        </FormControl>
        <Button colorScheme="blue" onClick={load} flex={{ base: "1", md: "0 0 auto" }}>Filtrar</Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={10}><Spinner /></Flex>
      ) : (
        <>
          <SimpleGrid columns={{ base: 3, md: 3 }} spacing={3} mb={5}>
            <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
              <StatLabel fontSize="xs">Movimentos</StatLabel>
              <StatNumber fontSize="lg">{data?.count ?? 0}</StatNumber>
            </Stat>
            <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
              <StatLabel fontSize="xs">Total entradas</StatLabel>
              <StatNumber fontSize="lg" color="green.500">+{data?.total_in ?? 0}</StatNumber>
            </Stat>
            <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
              <StatLabel fontSize="xs">Total saídas</StatLabel>
              <StatNumber fontSize="lg" color="red.500">-{data?.total_out ?? 0}</StatNumber>
            </Stat>
          </SimpleGrid>

          {!items.length ? (
            <Text fontSize="sm" color={subtle}>Nenhuma movimentação no período/filtros.</Text>
          ) : isMobile ? (
            <VStack spacing={2} align="stretch">
              {items.map(m => (
                <Box key={m.id} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
                  <Flex justify="space-between" align="start" gap={2} mb={2}>
                    <Text fontSize="sm" fontWeight="semibold" noOfLines={2}>
                      {m.product_codigo} · {m.descricao}
                    </Text>
                    <Badge flexShrink={0}>{m.tamanho}</Badge>
                  </Flex>
                  <Flex align="center" gap={3} mb={2} wrap="wrap">
                    <Badge colorScheme={TIPO_COLOR[m.tipo] || "gray"}>{TIPO_LABEL[m.tipo] || m.tipo}</Badge>
                    <Text fontWeight="bold" color={m.qty > 0 ? "green.500" : m.qty < 0 ? "red.500" : undefined}>
                      {m.qty > 0 ? "+" : ""}{m.qty}
                    </Text>
                    <Text fontSize="xs" color={subtle}>saldo após: <b>{m.resulting_balance}</b></Text>
                  </Flex>
                  <Text fontSize="xs" color={subtle}>
                    {formatSaoPaulo(m.created_at)}
                    {m.user_name ? ` · ${m.user_name}` : ""}
                    {m.reason_nome ? ` · ${m.reason_nome}` : ""}
                  </Text>
                  {m.note && <Text fontSize="xs" color={subtle} mt={1}>Obs: {m.note}</Text>}
                </Box>
              ))}
            </VStack>
          ) : (
            <Box overflowX="auto" overflowY="auto" maxH="70vh">
              <Table size="sm">
                <Thead position="sticky" top={0} zIndex={1} bg={theadBg}>
                  <Tr>
                    <Th>Data/Hora</Th>
                    <Th>Produto</Th>
                    <Th>Tam.</Th>
                    <Th>Tipo</Th>
                    <Th isNumeric>Qtd</Th>
                    <Th isNumeric>Saldo após</Th>
                    <Th>Motivo</Th>
                    <Th>Usuário</Th>
                    <Th>Obs.</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {items.map(m => (
                    <Tr key={m.id}>
                      <Td whiteSpace="nowrap" fontSize="xs">{formatSaoPaulo(m.created_at)}</Td>
                      <Td>{m.product_codigo} · {m.descricao}</Td>
                      <Td>{m.tamanho}</Td>
                      <Td>
                        <Badge colorScheme={TIPO_COLOR[m.tipo] || "gray"}>
                          {TIPO_LABEL[m.tipo] || m.tipo}
                        </Badge>
                      </Td>
                      <Td isNumeric color={m.qty > 0 ? "green.500" : m.qty < 0 ? "red.500" : undefined}>
                        {m.qty > 0 ? "+" : ""}{m.qty}
                      </Td>
                      <Td isNumeric>{m.resulting_balance}</Td>
                      <Td fontSize="xs">{m.reason_nome || "—"}</Td>
                      <Td fontSize="xs" color={subtle}>{m.user_name || "—"}</Td>
                      <Td fontSize="xs" color={subtle}>{m.note || "—"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
