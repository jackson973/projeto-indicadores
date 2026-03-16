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
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Checkbox,
  Spinner,
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
  useToast,
  useColorModeValue,
  useBreakpointValue,
} from "@chakra-ui/react";
import { ChevronDownIcon, SmallCloseIcon, TriangleDownIcon, TriangleUpIcon } from "@chakra-ui/icons";
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
import { fetchProductDashboard, fetchProductGroups } from "../api";

const PIE_COLORS = ["#0ea5e9", "#6366f1", "#22c55e", "#f97316", "#e11d48", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#06b6d4"];

const fmt = (n) => n.toLocaleString("pt-BR");
const fmtCur = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  const [groups, setGroups] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [sortField, setSortField] = useState("adjusted_quantity");
  const [sortDir, setSortDir] = useState("desc");

  const toast = useToast();
  const panelBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const menuBg = useColorModeValue("white", "gray.800");
  const hoverBg = useColorModeValue("gray.50", "gray.700");
  const isMobile = useBreakpointValue({ base: true, md: false });

  useEffect(() => {
    fetchProductGroups().then(setGroups).catch(() => {});
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const result = await fetchProductDashboard(startDate, endDate, selectedGroups.length > 0 ? selectedGroups : undefined);
      setData(result);
    } catch (err) {
      toast({ title: "Erro ao carregar dashboard", description: err.message, status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedGroups, toast]);

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

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const sortedProducts = useMemo(() => {
    if (!data?.byProduct) return [];
    return [...data.byProduct].sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [data, sortField, sortDir]);

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <TriangleUpIcon boxSize={2} ml={1} /> : <TriangleDownIcon boxSize={2} ml={1} />;
  };

  const chartDateData = useMemo(() => {
    if (!data?.byDate) return [];
    return data.byDate.map((d) => ({
      ...d,
      dateLabel: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    }));
  }, [data]);

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
    return (
      <Box bg={panelBg} p={2} borderRadius="md" boxShadow="md" border="1px solid" borderColor={borderColor} fontSize="xs">
        <Text fontWeight="bold">{d.name}</Text>
        <Text>{fmt(d.value)} unidades</Text>
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
          <Button size="sm" colorScheme="blue" onClick={loadDashboard}>Filtrar</Button>
        </Flex>

        {selectedGroups.length > 0 && (
          <Wrap mt={2} spacing={1}>
            {selectedGroups.map((id) => (
              <WrapItem key={id}>
                <Tag size="sm" colorScheme="blue" variant="subtle" cursor="pointer" onClick={() => toggleGroup(id)}>
                  {getGroupName(id)}
                  <SmallCloseIcon ml={1} />
                </Tag>
              </WrapItem>
            ))}
            <WrapItem>
              <Tag size="sm" variant="outline" cursor="pointer" onClick={() => setSelectedGroups([])}>Limpar</Tag>
            </WrapItem>
          </Wrap>
        )}
      </Box>

      {loading ? (
        <Center py={20}><Spinner size="xl" /></Center>
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
              <Text fontSize="sm" fontWeight="bold" mb={3}>Unidades por Dia</Text>
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
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={data.byGroup} dataKey="units" nameKey="group_name" cx="50%" cy="50%"
                      outerRadius={100} label={({ group_name, percent }) => `${group_name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false} fontSize={10}>
                      {data.byGroup.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltipPie />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Center h="280px"><Text color="gray.400" fontSize="sm">Nenhum produto com grupo atribuído</Text></Center>
              )}
            </Box>
          </SimpleGrid>

          {/* Product Grid */}
          <Box bg={panelBg} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
            <Text fontSize="sm" fontWeight="bold" p={4} pb={2}>
              Produtos ({sortedProducts.length})
            </Text>

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
                    <SimpleGrid columns={4} spacing={1} mt={1.5} ml="44px">
                      <Box>
                        <Text fontSize="9px" color="gray.500">Qtd Venda</Text>
                        <Text fontSize="xs">{fmt(p.raw_quantity)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Kit</Text>
                        <Text fontSize="xs" fontWeight="bold" color={p.kit_qty > 1 ? "purple.500" : "gray.500"}>x{p.kit_qty}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Qtd Ajust.</Text>
                        <Text fontSize="xs" fontWeight="bold" color="blue.500">{fmt(p.adjusted_quantity)}</Text>
                      </Box>
                      <Box>
                        <Text fontSize="9px" color="gray.500">Receita</Text>
                        <Text fontSize="xs">{fmtCur(p.revenue)}</Text>
                      </Box>
                    </SimpleGrid>
                  </Box>
                ))}
              </Box>
            ) : (
              /* Desktop: table */
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th w="36px" p={1}></Th>
                    <Th cursor="pointer" onClick={() => handleSort("ad_name")} maxW="300px">
                      Produto <SortIcon field="ad_name" />
                    </Th>
                    <Th cursor="pointer" onClick={() => handleSort("loja")}>Loja</Th>
                    <Th>Grupo</Th>
                    <Th textAlign="right" cursor="pointer" onClick={() => handleSort("raw_quantity")} whiteSpace="nowrap">
                      Qtd Venda <SortIcon field="raw_quantity" />
                    </Th>
                    <Th textAlign="center" whiteSpace="nowrap">Kit</Th>
                    <Th textAlign="right" cursor="pointer" onClick={() => handleSort("adjusted_quantity")} whiteSpace="nowrap">
                      Qtd Ajust. <SortIcon field="adjusted_quantity" />
                    </Th>
                    <Th textAlign="right" cursor="pointer" onClick={() => handleSort("revenue")} whiteSpace="nowrap">
                      Receita <SortIcon field="revenue" />
                    </Th>
                    <Th textAlign="right" cursor="pointer" onClick={() => handleSort("orders")} whiteSpace="nowrap">
                      Pedidos <SortIcon field="orders" />
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
                      <Td fontSize="xs" maxW="300px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={p.ad_name}>{p.ad_name}</Td>
                      <Td>{p.loja && <Tag size="sm" fontSize="9px" variant="subtle" colorScheme="blue" whiteSpace="nowrap">{p.loja}</Tag>}</Td>
                      <Td>{p.group_name && <Tag size="sm" fontSize="9px" variant="subtle" colorScheme="purple" whiteSpace="nowrap">{p.group_name}</Tag>}</Td>
                      <Td textAlign="right" fontSize="xs">{fmt(p.raw_quantity)}</Td>
                      <Td textAlign="center" fontSize="xs" fontWeight="bold" color={p.kit_qty > 1 ? "purple.500" : "gray.500"}>
                        x{p.kit_qty}
                      </Td>
                      <Td textAlign="right" fontSize="sm" fontWeight="bold" color="blue.500">{fmt(p.adjusted_quantity)}</Td>
                      <Td textAlign="right" fontSize="xs" whiteSpace="nowrap">{fmtCur(p.revenue)}</Td>
                      <Td textAlign="right" fontSize="xs">{p.orders}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

export default ProductDashboard;
