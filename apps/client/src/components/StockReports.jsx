import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
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
  useColorModeValue,
} from "@chakra-ui/react";
import { InfoIcon } from "@chakra-ui/icons";
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
  const [report, setReport] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("codigo");
  const toast = useAppToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");
  const lowBg = useColorModeValue("red.50", "rgba(254,178,178,0.08)");

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

  // Ordenação aplicada no cliente; a grade (RN, P, M, G, GG...) é sempre o critério de desempate
  const sortedItems = useMemo(() => {
    const items = [...(report?.items || [])];
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
  }, [report, sortBy]);

  return (
    <Box>
      <Flex gap={3} align="end" wrap="wrap" mb={4}>
        <FormControl maxW="180px">
          <FormLabel fontSize="sm">De</FormLabel>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </FormControl>
        <FormControl maxW="180px">
          <FormLabel fontSize="sm">Até</FormLabel>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </FormControl>
        <FormControl maxW="180px">
          <FormLabel fontSize="sm">Ordenar por</FormLabel>
          <Select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="codigo">Código</option>
            <option value="nome">Nome</option>
            <option value="saldo">Saldo</option>
            <option value="cobertura">Cobertura</option>
          </Select>
        </FormControl>
        <Button colorScheme="blue" onClick={load}>Atualizar</Button>
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
              <StatNumber fontSize="lg">{report?.items?.length ?? 0}</StatNumber>
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

          {/* Alerta de estoque baixo */}
          {lowStock.length > 0 && (
            <Box bg={lowBg} borderWidth="1px" borderColor="red.300" borderRadius="lg" p={4} mb={5}>
              <Text fontWeight="bold" color="red.500" mb={2}>⚠️ Produtos com estoque baixo</Text>
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
            </Box>
          )}

          {/* Consumo médio */}
          <Text fontWeight="semibold" mb={2}>Consumo médio &amp; cobertura</Text>
          {!report?.items?.length ? (
            <Text fontSize="sm" color={subtle}>Sem dados no período.</Text>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
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

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");

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
        <FormControl maxW="160px">
          <FormLabel fontSize="sm">De</FormLabel>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </FormControl>
        <FormControl maxW="160px">
          <FormLabel fontSize="sm">Até</FormLabel>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </FormControl>
        <FormControl maxW="140px">
          <FormLabel fontSize="sm">Cód. produto</FormLabel>
          <Input placeholder="ex: 004" value={codigo} onChange={e => setCodigo(e.target.value)} />
        </FormControl>
        <FormControl maxW="110px">
          <FormLabel fontSize="sm">Tamanho</FormLabel>
          <Input placeholder="ex: P" value={tamanho} onChange={e => setTamanho(e.target.value)} />
        </FormControl>
        <FormControl maxW="200px">
          <FormLabel fontSize="sm">Produto / descrição</FormLabel>
          <Input placeholder="buscar" value={q} onChange={e => setQ(e.target.value)} />
        </FormControl>
        <FormControl maxW="150px">
          <FormLabel fontSize="sm">Tipo</FormLabel>
          <Select value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
            <option value="ajuste">Ajuste</option>
          </Select>
        </FormControl>
        <Button colorScheme="blue" onClick={load}>Filtrar</Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={10}><Spinner /></Flex>
      ) : (
        <>
          <SimpleGrid columns={{ base: 2, md: 3 }} spacing={3} mb={5}>
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
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
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
