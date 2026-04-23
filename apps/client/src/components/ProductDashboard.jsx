import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Flex,
  Text,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  FormControl,
  FormLabel,
  Input,
  Select,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Checkbox,
  Skeleton,
  SkeletonText,
  Center,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Image,
  Tag,
  Wrap,
  WrapItem,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Badge,
  Link,
  useColorModeValue,
  useBreakpointValue,
  useDisclosure,
} from "@chakra-ui/react";
import { ChevronDownIcon, ExternalLinkIcon, SmallCloseIcon, TriangleDownIcon, TriangleUpIcon } from "@chakra-ui/icons";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fetchProductDashboard, fetchProductGroups, fetchProductStores, fetchProductOrders } from "../api";
import useAppToast from "../hooks/useAppToast";

const PIE_COLORS = ["#0ea5e9", "#6366f1", "#22c55e", "#f97316", "#e11d48", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#06b6d4"];

const fmt = (n) => n.toLocaleString("pt-BR");
const fmtCur = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKit = (p) => p.min_kit_qty === p.max_kit_qty ? `x${p.max_kit_qty}` : `x${p.min_kit_qty}~${p.max_kit_qty}`;
const hasKit = (p) => p.max_kit_qty > 1;

const getDefaultDates = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
};

const ProductDashboard = () => {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [selectedStores, setSelectedStores] = useState([]);
  const [groups, setGroups] = useState([]);
  const [stores, setStores] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [pieGroupFilter, setPieGroupFilter] = useState(null);
  const [sortField, setSortField] = useState("adjusted_quantity");
  const [sortDir, setSortDir] = useState("desc");
  const [chartGrouping, setChartGrouping] = useState("auto");
  const [ordersModal, setOrdersModal] = useState({ product: null, orders: [], loading: false });
  const { isOpen: isOrdersOpen, onOpen: onOrdersOpen, onClose: onOrdersClose } = useDisclosure();

  const toast = useAppToast();
  const panelBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const menuBg = useColorModeValue("white", "gray.800");
  const hoverBg = useColorModeValue("gray.50", "gray.700");
  const isMobile = useBreakpointValue({ base: true, md: false });

  useEffect(() => {
    fetchProductGroups().then(setGroups).catch(() => {});
    fetchProductStores().then(setStores).catch(() => {});
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const result = await fetchProductDashboard(
        startDate, endDate,
        selectedGroups.length > 0 ? selectedGroups : undefined,
        selectedStores.length > 0 ? selectedStores : undefined
      );
      setData(result);
    } catch (err) {
      toast({  title: "Erro ao carregar dashboard", description: err.message, status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedGroups, selectedStores, toast]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const toggleGroup = (id) => {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const getGroupName = (id) => {
    const g = groups.find((gr) => gr.id === id);
    return g ? g.name : id;
  };

  const toggleStore = (id) => {
    setSelectedStores((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const getStoreName = (id) => {
    const s = stores.find((st) => st.id === id);
    return s ? s.name : id;
  };

  const openOrders = async (product) => {
    setOrdersModal({ product, orders: [], loading: true });
    onOrdersOpen();
    try {
      const orders = await fetchProductOrders(product.store_variation_key, startDate, endDate, product.variation_filter || null);
      setOrdersModal({ product, orders, loading: false });
    } catch {
      toast({  title: "Erro ao buscar pedidos", status: "error", duration: 3000 });
      setOrdersModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const sortedProducts = useMemo(() => {
    if (!data?.byProduct) return [];
    const base = pieGroupFilter
      ? data.byProduct.filter((p) => p.group_name === pieGroupFilter)
      : data.byProduct;
    return [...base].sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [data, sortField, sortDir, pieGroupFilter]);

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <TriangleUpIcon boxSize={2} ml={1} /> : <TriangleDownIcon boxSize={2} ml={1} />;
  };

  const daysDiff = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  const effectiveGrouping = useMemo(() => {
    if (chartGrouping !== "auto") return chartGrouping;
    if (daysDiff <= 15) return "day";
    if (daysDiff <= 30) return "week";
    return "month";
  }, [chartGrouping, daysDiff]);

  const groupingLabel = { day: "Diário", week: "Semanal", month: "Mensal" };

  const chartDateData = useMemo(() => {
    if (!data?.byDate || data.byDate.length === 0) return [];

    if (effectiveGrouping === "day") {
      return data.byDate.map((d) => ({
        ...d,
        dateLabel: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      }));
    }

    const buckets = new Map();
    data.byDate.forEach((d) => {
      const dt = new Date(d.date);
      let key, label;
      if (effectiveGrouping === "week") {
        const day = dt.getDay();
        const monday = new Date(dt);
        monday.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
        key = monday.toISOString().slice(0, 10);
        label = monday.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      } else {
        key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        label = dt.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      }
      if (!buckets.has(key)) buckets.set(key, { dateLabel: label, units: 0, revenue: 0, orders: 0 });
      const b = buckets.get(key);
      b.units += d.units;
      b.revenue += d.revenue;
      b.orders += d.orders;
    });

    return Array.from(buckets.values());
  }, [data, effectiveGrouping]);

  const CustomTooltipLine = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <Box bg={panelBg} p={2} borderRadius="md" boxShadow="md" border="1px solid" borderColor={borderColor} fontSize="xs">
        <Text fontWeight="bold" mb={1}>{label}</Text>
        {payload.map((p, i) => (
          <Text key={i} color={p.color}>{p.name}: {p.name === "Receita" ? fmtCur(p.value) : fmt(p.value)}</Text>
        ))}
      </Box>
    );
  };

  const CustomTooltipPie = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const sizes = d.payload?.sizes || [];
    const twoCols = sizes.length >= 4;
    return (
      <Box bg={panelBg} p={2} borderRadius="md" boxShadow="md" border="1px solid" borderColor={borderColor} fontSize="xs">
        <Text fontWeight="bold">{d.name}</Text>
        <Text>{fmt(d.value)} unidades</Text>
        {sizes.length > 0 && (
          <SimpleGrid
            mt={1} pt={1}
            borderTop="1px solid" borderColor={borderColor}
            columns={{ base: 1, sm: twoCols ? 2 : 1 }}
            spacingX={3} spacingY={0}
          >
            {sizes.map((s, i) => (
              <Text key={i} color="gray.500">{s.size}: {fmt(s.units)} un</Text>
            ))}
          </SimpleGrid>
        )}
      </Box>
    );
  };

  return (
    <Box p={{ base: 3, md: 6 }} maxW="1400px" mx="auto">
      {/* Filters */}
      <Box bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor} mb={4}>
        <Flex gap={3} wrap="wrap" align="flex-end">
          <FormControl maxW="180px">
            <FormLabel fontSize="xs" mb={1}>De</FormLabel>
            <Input type="date" size="sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormControl>
          <FormControl maxW="180px">
            <FormLabel fontSize="xs" mb={1}>Até</FormLabel>
            <Input type="date" size="sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormControl>
          <FormControl maxW="280px">
            <FormLabel fontSize="xs" mb={1}>Grupos</FormLabel>
            <Menu closeOnSelect={false}>
              <MenuButton as={Button} size="sm" variant="outline" rightIcon={<ChevronDownIcon />} fontWeight="normal" w="full" textAlign="left">
                {selectedGroups.length === 0
                  ? "Todos os grupos"
                  : `${selectedGroups.length} grupo${selectedGroups.length > 1 ? "s" : ""}`}
              </MenuButton>
              <MenuList bg={menuBg} maxH="250px" overflowY="auto">
                {groups.map((g) => (
                  <MenuItem key={g.id} onClick={() => toggleGroup(g.id)} closeOnSelect={false}>
                    <Checkbox isChecked={selectedGroups.includes(g.id)} pointerEvents="none" mr={2} size="sm" />
                    <Text fontSize="sm">{g.name}</Text>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
          </FormControl>
          <FormControl maxW="280px">
            <FormLabel fontSize="xs" mb={1}>Lojas</FormLabel>
            <Menu closeOnSelect={false}>
              <MenuButton as={Button} size="sm" variant="outline" rightIcon={<ChevronDownIcon />} fontWeight="normal" w="full" textAlign="left">
                {selectedStores.length === 0
                  ? "Todas as lojas"
                  : `${selectedStores.length} loja${selectedStores.length > 1 ? "s" : ""}`}
              </MenuButton>
              <MenuList bg={menuBg} maxH="250px" overflowY="auto">
                {stores.map((s) => (
                  <MenuItem key={s.id} onClick={() => toggleStore(s.id)} closeOnSelect={false}>
                    <Checkbox isChecked={selectedStores.includes(s.id)} pointerEvents="none" mr={2} size="sm" />
                    <Text fontSize="sm">{s.name}</Text>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
          </FormControl>
          <Button size="sm" colorScheme="blue" onClick={loadDashboard}>Filtrar</Button>
        </Flex>

        {(selectedGroups.length > 0 || selectedStores.length > 0) && (
          <Wrap mt={2} spacing={1}>
            {selectedGroups.map((id) => (
              <WrapItem key={id}>
                <Tag size="sm" colorScheme="blue" variant="subtle" cursor="pointer" onClick={() => toggleGroup(id)}>
                  {getGroupName(id)}
                  <SmallCloseIcon ml={1} />
                </Tag>
              </WrapItem>
            ))}
            {selectedStores.map((id) => (
              <WrapItem key={id}>
                <Tag size="sm" colorScheme="purple" variant="subtle" cursor="pointer" onClick={() => toggleStore(id)}>
                  {getStoreName(id)}
                  <SmallCloseIcon ml={1} />
                </Tag>
              </WrapItem>
            ))}
            <WrapItem>
              <Tag size="sm" variant="outline" cursor="pointer" onClick={() => { setSelectedGroups([]); setSelectedStores([]); }}>Limpar</Tag>
            </WrapItem>
          </Wrap>
        )}
      </Box>

      {loading ? (
        <>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
            {[1,2,3,4].map(i => (
              <Box key={i} bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                <Skeleton height="12px" width="60%" mb={2} />
                <Skeleton height="28px" width="80%" />
              </Box>
            ))}
          </SimpleGrid>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={6}>
            <Box bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <Skeleton height="200px" borderRadius="md" />
            </Box>
            <Box bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <Skeleton height="200px" borderRadius="md" />
            </Box>
          </SimpleGrid>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            {[1,2,3,4,5,6,7,8].map(i => (
              <Box key={i} bg={panelBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                <Skeleton height="80px" borderRadius="md" mb={2} />
                <SkeletonText noOfLines={2} spacing={2} />
              </Box>
            ))}
          </SimpleGrid>
        </>
      ) : !data ? (
        <Center py={20}><Text color="gray.500">Selecione o período para visualizar.</Text></Center>
      ) : (
        <>
          {/* Summary Cards */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
            <Stat bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <StatLabel fontSize="xs">Unidades Vendidas</StatLabel>
              <StatNumber fontSize="xl" color="blue.500">{fmt(data.summary.totalUnits)}</StatNumber>
            </Stat>
            <Stat bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <StatLabel fontSize="xs">Receita Total</StatLabel>
              <StatNumber fontSize="xl" color="green.500">{fmtCur(data.summary.totalRevenue)}</StatNumber>
            </Stat>
            <Stat bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <StatLabel fontSize="xs">Pedidos</StatLabel>
              <StatNumber fontSize="xl">{fmt(data.summary.totalOrders)}</StatNumber>
            </Stat>
            <Stat bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <StatLabel fontSize="xs">Ticket Médio</StatLabel>
              <StatNumber fontSize="xl">{fmtCur(data.summary.avgTicket)}</StatNumber>
            </Stat>
          </SimpleGrid>

          {/* Charts */}
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mb={6}>
            {/* Units over time */}
            <Box bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <Flex justify="space-between" align="center" mb={3}>
                <Text fontSize="sm" fontWeight="bold">Unidades ({groupingLabel[effectiveGrouping]})</Text>
                <Select size="xs" w="110px" value={chartGrouping} onChange={(e) => setChartGrouping(e.target.value)}>
                  <option value="auto">Auto</option>
                  <option value="day">Diário</option>
                  <option value="week">Semanal</option>
                  <option value="month">Mensal</option>
                </Select>
              </Flex>
              {chartDateData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartDateData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="dateLabel" fontSize={10} />
                    <YAxis yAxisId="left" fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" fontSize={10} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltipLine />} />
                    <Legend fontSize={10} />
                    <Bar yAxisId="left" dataKey="units" name="Unidades" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Line yAxisId="right" dataKey="revenue" name="Receita" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <Center h="280px"><Text color="gray.400" fontSize="sm">Sem dados no período</Text></Center>
              )}
            </Box>

            {/* By group pie */}
            <Box bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
              <Text fontSize="sm" fontWeight="bold" mb={3}>Unidades por Grupo</Text>
              {data.byGroup.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.byGroup} dataKey="units" nameKey="group_name" cx="50%" cy="50%"
                        outerRadius={90} label={({ percent }) => percent >= 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                        labelLine={false} fontSize={10} cursor="pointer"
                        onClick={(entry) => {
                          const name = entry?.group_name ?? "Sem grupo";
                          setPieGroupFilter((prev) => prev === name ? null : name);
                        }}>
                        {data.byGroup.map((g, i) => {
                          const name = g.group_name ?? "Sem grupo";
                          const active = pieGroupFilter === null || pieGroupFilter === name;
                          return <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={active ? 1 : 0.3} />;
                        })}
                      </Pie>
                      <Tooltip content={<CustomTooltipPie />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <Flex wrap="wrap" gap={2} justify="center" mt={1}>
                    {data.byGroup.map((g, i) => {
                      const total = data.byGroup.reduce((s, x) => s + x.units, 0);
                      const pct = total > 0 ? ((g.units / total) * 100).toFixed(0) : 0;
                      const name = g.group_name ?? "Sem grupo";
                      const active = pieGroupFilter === null || pieGroupFilter === name;
                      return (
                        <Flex key={g.group_id ?? name} align="center" gap={1} cursor="pointer"
                          opacity={active ? 1 : 0.4}
                          onClick={() => setPieGroupFilter((prev) => prev === name ? null : name)}>
                          <Box w="10px" h="10px" borderRadius="2px" bg={PIE_COLORS[i % PIE_COLORS.length]} flexShrink={0} />
                          <Text fontSize="10px" color="gray.600" fontWeight={pieGroupFilter === name ? "bold" : "normal"}>
                            {name} ({pct}%)
                          </Text>
                        </Flex>
                      );
                    })}
                  </Flex>
                </>
              ) : (
                <Center h="280px"><Text color="gray.400" fontSize="sm">Nenhum produto com grupo atribuído</Text></Center>
              )}
            </Box>
          </SimpleGrid>

          {/* Product Grid */}
          <Box bg={panelBg} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
            <Flex align="center" p={4} pb={2} gap={2}>
              <Text fontSize="sm" fontWeight="bold">
                Produtos ({sortedProducts.length})
              </Text>
              {pieGroupFilter && (
                <Tag size="sm" colorScheme="purple" cursor="pointer" onClick={() => setPieGroupFilter(null)}>
                  {pieGroupFilter} <SmallCloseIcon ml={1} />
                </Tag>
              )}
            </Flex>

            {isMobile ? (
              /* Mobile: cards */
              <Box px={3} pb={3}>
                {sortedProducts.map((p) => (
                  <Box key={p.store_variation_key} py={2} borderBottomWidth="1px" borderColor={borderColor} _last={{ borderBottomWidth: 0 }}>
                    <Flex gap={2} align="center">
                      {p.thumbnail ? (
                        <Image src={p.thumbnail} alt="" boxSize="36px" borderRadius="4px" objectFit="contain" flexShrink={0} />
                      ) : (
                        <Box boxSize="36px" borderRadius="4px" bg="gray.100" flexShrink={0} />
                      )}
                      <Box flex={1} minW={0}>
                        <Text fontSize="xs" fontWeight="medium" noOfLines={2}>{p.ad_name}</Text>
                        <Flex gap={1} mt={0.5} wrap="wrap">
                          {p.loja && <Tag size="sm" fontSize="8px" variant="subtle" colorScheme="blue">{p.loja}</Tag>}
                          {p.group_name && <Tag size="sm" fontSize="8px" variant="subtle" colorScheme="purple">{p.group_name}</Tag>}
                        </Flex>
                      </Box>
                    </Flex>
                    <SimpleGrid columns={5} spacing={1} mt={1.5} ml="44px">
                      <Box>
                        <Text fontSize="9px" color="gray.500">Qtd Venda</Text>
                        <Text fontSize="xs">{fmt(p.raw_quantity)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Kit</Text>
                        <Text fontSize="xs" fontWeight="bold" color={hasKit(p) ? "purple.500" : "gray.500"}>{fmtKit(p)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Qtd Ajust.</Text>
                        <Text fontSize="xs" fontWeight="bold" color="blue.500">{fmt(p.adjusted_quantity)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Receita</Text>
                        <Text fontSize="xs">{fmtCur(p.revenue)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Ped.</Text>
                        <Text fontSize="xs" cursor="pointer" color="blue.500" onClick={() => openOrders(p)}>{p.orders}</Text>
                      </Box>
                    </SimpleGrid>
                  </Box>
                ))}
              </Box>
            ) : (
              /* Desktop: table */
              <Table size="sm" variant="simple" sx={{ tableLayout: "fixed", width: "100%" }}>
                <Thead>
                  <Tr>
                    <Th w="36px" p={1}></Th>
                    <Th cursor="pointer" onClick={() => handleSort("ad_name")}>
                      Produto <SortIcon field="ad_name" />
                    </Th>
                    <Th w="13%" cursor="pointer" onClick={() => handleSort("loja")}>Loja</Th>
                    <Th w="10%">Grupo</Th>
                    <Th w="7%" textAlign="right" cursor="pointer" onClick={() => handleSort("raw_quantity")} px={1} fontSize="xs">
                      Vendas <SortIcon field="raw_quantity" />
                    </Th>
                    <Th w="5%" textAlign="center" px={1} fontSize="xs">Kit</Th>
                    <Th w="7%" textAlign="right" cursor="pointer" onClick={() => handleSort("adjusted_quantity")} px={1} fontSize="xs">
                      Ajust. <SortIcon field="adjusted_quantity" />
                    </Th>
                    <Th w="9%" textAlign="right" cursor="pointer" onClick={() => handleSort("revenue")} px={1} fontSize="xs">
                      Receita <SortIcon field="revenue" />
                    </Th>
                    <Th w="6%" textAlign="right" cursor="pointer" onClick={() => handleSort("orders")} px={1} fontSize="xs">
                      Ped. <SortIcon field="orders" />
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sortedProducts.map((p) => (
                    <Tr key={p.store_variation_key} _hover={{ bg: hoverBg }}>
                      <Td p={1}>
                        {p.thumbnail ? (
                          <Image src={p.thumbnail} alt="" boxSize="28px" borderRadius="4px" objectFit="contain" />
                        ) : (
                          <Box boxSize="28px" borderRadius="4px" bg="gray.100" />
                        )}
                      </Td>
                      <Td fontSize="xs" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={p.ad_name}>{p.ad_name}</Td>
                      <Td px={1}>{p.loja && <Tag size="sm" fontSize="8px" variant="subtle" colorScheme="blue" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" maxW="100%">{p.loja}</Tag>}</Td>
                      <Td px={1}>{p.group_name && <Tag size="sm" fontSize="8px" variant="subtle" colorScheme="purple" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" maxW="100%">{p.group_name}</Tag>}</Td>
                      <Td textAlign="right" fontSize="xs" px={1}>{fmt(p.raw_quantity)}</Td>
                      <Td textAlign="center" fontSize="xs" fontWeight="bold" color={hasKit(p) ? "purple.500" : "gray.500"} px={1}>
                        {fmtKit(p)}
                      </Td>
                      <Td textAlign="right" fontSize="sm" fontWeight="bold" color="blue.500" px={1}>{fmt(p.adjusted_quantity)}</Td>
                      <Td textAlign="right" fontSize="xs" whiteSpace="nowrap" px={1}>{fmtCur(p.revenue)}</Td>
                      <Td textAlign="right" fontSize="xs" px={1}>
                        <Text as="span" cursor="pointer" color="blue.500" _hover={{ textDecoration: "underline" }} onClick={() => openOrders(p)}>
                          {p.orders}
                        </Text>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Box>
        </>
      )}
      {/* Orders Detail Modal */}
      <Modal isOpen={isOrdersOpen} onClose={onOrdersClose} size="full">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="md" pb={2}>
            <Text noOfLines={1}>{ordersModal.product?.ad_name}</Text>
            <Flex gap={2} mt={1} align="center" wrap="wrap">
              {ordersModal.product?.loja && <Tag size="sm" colorScheme="blue">{ordersModal.product.loja}</Tag>}
              <Badge colorScheme="gray" fontSize="xs">{ordersModal.orders.length} pedidos</Badge>
              <Text fontSize="xs" color="gray.500">{startDate} a {endDate}</Text>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody px={{ base: 2, md: 6 }} pb={6} overflowX="auto">
            {ordersModal.loading ? (
              <Box>
                {[1,2,3,4,5].map(i => (
                  <Box key={i} py={3} borderBottomWidth="1px" borderColor={borderColor}>
                    <Flex justify="space-between" mb={2}>
                      <Skeleton height="14px" width="80px" />
                      <Skeleton height="14px" width="100px" />
                    </Flex>
                    <SkeletonText noOfLines={1} width="60%" />
                  </Box>
                ))}
              </Box>
            ) : ordersModal.orders.length === 0 ? (
              <Center py={20}><Text color="gray.500">Nenhum pedido encontrado.</Text></Center>
            ) : isMobile ? (
              <Box>
                {ordersModal.orders.map((o, i) => (
                  <Box key={i} py={2} borderBottomWidth="1px" borderColor={borderColor} _last={{ borderBottomWidth: 0 }}>
                    <Flex justify="space-between" align="center">
                      <Text fontSize="xs" fontWeight="bold" color="blue.600">{o.orderId}</Text>
                      <Text fontSize="xs" color="gray.500">
                        {new Date(o.date).toLocaleDateString("pt-BR")} {new Date(o.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </Flex>
                    <SimpleGrid columns={3} spacing={1} mt={1}>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Qtd</Text>
                        <Text fontSize="xs">{o.quantity}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Unit.</Text>
                        <Text fontSize="xs">{fmtCur(o.unitPrice)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Total</Text>
                        <Text fontSize="xs" fontWeight="bold">{fmtCur(o.total)}</Text>
                      </Box>
                    </SimpleGrid>
                    {o.variation && <Text fontSize="9px" color="gray.500" mt={0.5}>Var: {o.variation}</Text>}
                    {o.clientName && o.clientName !== "-" && <Text fontSize="9px" color="gray.500">Cliente: {o.clientName}</Text>}
                  </Box>
                ))}
              </Box>
            ) : (
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th fontSize="xs">Pedido</Th>
                    <Th fontSize="xs">Data</Th>
                    <Th fontSize="xs">Produto</Th>
                    <Th fontSize="xs">Variação</Th>
                    <Th fontSize="xs">Cliente</Th>
                    <Th fontSize="xs">Loja</Th>
                    <Th fontSize="xs">UF</Th>
                    <Th fontSize="xs">Canal</Th>
                    <Th fontSize="xs" textAlign="right">Qtd</Th>
                    <Th fontSize="xs" textAlign="right">Unit.</Th>
                    <Th fontSize="xs" textAlign="right">Total</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {ordersModal.orders.map((o, i) => (
                    <Tr key={i} _hover={{ bg: hoverBg }}>
                      <Td fontSize="xs" fontWeight="medium" color="blue.600">{o.orderId}</Td>
                      <Td fontSize="xs" whiteSpace="nowrap">
                        {new Date(o.date).toLocaleDateString("pt-BR")} {new Date(o.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </Td>
                      <Td fontSize="xs" maxW="180px">
                        <Flex align="center" gap={1}>
                          <Text isTruncated title={o.product}>{o.product || "-"}</Text>
                          {o.productUrl && (
                            <Link href={o.productUrl} isExternal flexShrink={0}>
                              <ExternalLinkIcon boxSize={3} color="gray.400" />
                            </Link>
                          )}
                        </Flex>
                      </Td>
                      <Td fontSize="xs" maxW="200px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={o.variation}>{o.variation || "-"}</Td>
                      <Td fontSize="xs" maxW="150px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={o.clientName}>{o.clientName || "-"}</Td>
                      <Td fontSize="xs">{o.loja || "-"}</Td>
                      <Td fontSize="xs">{o.state || "-"}</Td>
                      <Td fontSize="xs"><Tag size="sm" fontSize="8px" variant="subtle" colorScheme={o.saleChannel === "online" ? "blue" : "green"}>{o.saleChannel}</Tag></Td>
                      <Td fontSize="xs" textAlign="right">{o.quantity}</Td>
                      <Td fontSize="xs" textAlign="right" whiteSpace="nowrap">{fmtCur(o.unitPrice)}</Td>
                      <Td fontSize="xs" textAlign="right" fontWeight="bold" whiteSpace="nowrap">{fmtCur(o.total)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
            {!ordersModal.loading && ordersModal.orders.length > 0 && (
              <Flex justify="flex-end" mt={3} gap={4} fontSize="sm" fontWeight="bold">
                <Text>Total: {fmtCur(ordersModal.orders.reduce((s, o) => s + o.total, 0))}</Text>
                <Text color="gray.500">Qtd: {ordersModal.orders.reduce((s, o) => s + o.quantity, 0)}</Text>
              </Flex>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default ProductDashboard;
