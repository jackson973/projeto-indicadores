import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Flex,
  Text,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  FormControl,
  FormLabel,
  Select,
  HStack,
  Spinner,
  Center,
  useToast,
  useColorModeValue
} from "@chakra-ui/react";
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
  BarChart
} from "recharts";
import { fetchCashflowDashboard, fetchCashflowBoxes } from "../api";
import { formatCurrency, formatPercent } from "../utils/format";

const PIE_COLORS = ["#0ea5e9", "#6366f1", "#22c55e", "#f97316", "#e11d48", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#06b6d4"];
const EXPENSE_STACK_COLORS = ["#e11d48", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#78716c", "#06b6d4"];

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const generateMonthOptions = () => {
  const now = new Date();
  const options = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
    const maxM = y === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let m = maxM; m >= 1; m--) {
      const value = `${y}-${String(m).padStart(2, "0")}`;
      const label = `${MONTH_NAMES[m - 1]} / ${y}`;
      options.push({ value, label });
    }
  }
  return options;
};

const MONTH_OPTIONS = generateMonthOptions();

const getDefaultDates = () => {
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  const startDate = new Date(endY - 1, now.getMonth(), 1);
  const startY = startDate.getFullYear();
  const startM = startDate.getMonth() + 1;
  return {
    start: `${startY}-${String(startM).padStart(2, "0")}`,
    end: `${endY}-${String(endM).padStart(2, "0")}`
  };
};

const monthInputToStartDate = (v) => v ? `${v}-01` : "";
const monthInputToEndDate = (v) => {
  if (!v) return "";
  const [y, m] = v.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
};

const CashFlowDashboard = () => {
  const defaults = getDefaultDates();
  const [startMonth, setStartMonth] = useState(defaults.start);
  const [endMonth, setEndMonth] = useState(defaults.end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boxes, setBoxes] = useState([]);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const toast = useToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("gray.100", "gray.700");
  const labelColor = useColorModeValue("gray.500", "gray.300");
  const panelBg = useColorModeValue("white", "gray.800");
  const tooltipBg = useColorModeValue("white", "gray.800");
  const tooltipBorder = useColorModeValue("gray.100", "gray.700");
  const tooltipText = useColorModeValue("gray.800", "gray.100");
  const tooltipSubText = useColorModeValue("gray.600", "gray.300");
  const legendText = useColorModeValue("gray.600", "gray.300");

  useEffect(() => {
    const loadBoxes = async () => {
      try {
        const data = await fetchCashflowBoxes();
        setBoxes(data);
      } catch (err) {
        console.error("Erro ao carregar caixas:", err);
      }
    };
    loadBoxes();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const startDate = monthInputToStartDate(startMonth);
      const endDate = monthInputToEndDate(endMonth);
      if (!startDate || !endDate) return;
      const result = await fetchCashflowDashboard(startDate, endDate, "month", selectedBoxId);
      setData(result);
    } catch (err) {
      console.error("Dashboard financeiro error:", err);
      toast({ title: "Erro ao carregar dashboard financeiro.", status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startMonth, endMonth, selectedBoxId]);

  const margin = useMemo(() => {
    if (!data || !data.totals.totalIncome) return 0;
    return data.totals.netResult / data.totals.totalIncome;
  }, [data]);

  if (loading && !data) {
    return <Center py={20}><Spinner size="xl" color="blue.500" /></Center>;
  }

  const totals = data?.totals || { openingBalance: 0, totalIncome: 0, totalExpense: 0, netResult: 0, closingBalance: 0 };
  const periods = data?.periods || [];
  const expensesByCategory = data?.expensesByCategory || [];
  const incomeByCategory = data?.incomeByCategory || [];
  const expensesByCategoryPeriod = data?.expensesByCategoryPeriod || [];
  const expenseCategories = data?.expenseCategories || [];

  const expTotal = expensesByCategory.reduce((s, e) => s + e.total, 0) || 1;
  const incTotal = incomeByCategory.reduce((s, e) => s + e.total, 0) || 1;

  return (
    <Box>
      {/* Header + Filters */}
      <Flex justify="space-between" align="flex-end" mb={6} wrap="wrap" gap={3}>
        <Heading size="md">Dashboard Financeiro</Heading>
        <HStack spacing={3} wrap="wrap">
          <FormControl w="180px">
            <FormLabel fontSize="xs" mb={1}>Caixa</FormLabel>
            <Select
              size="sm"
              value={selectedBoxId || ""}
              onChange={(e) => setSelectedBoxId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">Todos os caixas</option>
              {boxes.map((box) => (
                <option key={box.id} value={box.id}>{box.name}</option>
              ))}
            </Select>
          </FormControl>
          <FormControl w="180px">
            <FormLabel fontSize="xs" mb={1}>De</FormLabel>
            <Select size="sm" value={startMonth} onChange={(e) => setStartMonth(e.target.value)}>
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </FormControl>
          <FormControl w="180px">
            <FormLabel fontSize="xs" mb={1}>Até</FormLabel>
            <Select size="sm" value={endMonth} onChange={(e) => setEndMonth(e.target.value)}>
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </FormControl>
        </HStack>
      </Flex>

      {/* Summary Cards */}
      <SimpleGrid columns={{ base: 2, md: 3, lg: 6 }} spacing={4} mb={6}>
        <Box bg={cardBg} p={4} borderRadius="xl" boxShadow="md" border="1px solid" borderColor={cardBorder}>
          <Stat>
            <StatLabel fontSize="xs" color={labelColor} textTransform="uppercase" letterSpacing="wide">Saldo Inicial</StatLabel>
            <StatNumber fontSize="xl" fontWeight="bold" color={totals.openingBalance >= 0 ? "blue.500" : "red.500"}>
              {formatCurrency(totals.openingBalance)}
            </StatNumber>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="xl" boxShadow="md" border="1px solid" borderColor={cardBorder}>
          <Stat>
            <StatLabel fontSize="xs" color={labelColor} textTransform="uppercase" letterSpacing="wide">Total Receitas</StatLabel>
            <StatNumber fontSize="xl" fontWeight="bold" color="green.500">{formatCurrency(totals.totalIncome)}</StatNumber>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="xl" boxShadow="md" border="1px solid" borderColor={cardBorder}>
          <Stat>
            <StatLabel fontSize="xs" color={labelColor} textTransform="uppercase" letterSpacing="wide">Total Despesas</StatLabel>
            <StatNumber fontSize="xl" fontWeight="bold" color="red.500">{formatCurrency(totals.totalExpense)}</StatNumber>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="xl" boxShadow="md" border="1px solid" borderColor={cardBorder}>
          <Stat>
            <StatLabel fontSize="xs" color={labelColor} textTransform="uppercase" letterSpacing="wide">Resultado Líquido</StatLabel>
            <StatNumber fontSize="xl" fontWeight="bold" color={totals.netResult >= 0 ? "blue.500" : "red.500"}>
              {formatCurrency(totals.netResult)}
            </StatNumber>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="xl" boxShadow="md" border="1px solid" borderColor={cardBorder}>
          <Stat>
            <StatLabel fontSize="xs" color={labelColor} textTransform="uppercase" letterSpacing="wide">Margem</StatLabel>
            <StatNumber fontSize="xl" fontWeight="bold" color={margin >= 0 ? "blue.500" : "red.500"}>
              {formatPercent(margin, 1)}
            </StatNumber>
            <StatHelpText fontSize="xs" color={labelColor}>Resultado / Receitas</StatHelpText>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="xl" boxShadow="md" border="1px solid" borderColor={cardBorder}>
          <Stat>
            <StatLabel fontSize="xs" color={labelColor} textTransform="uppercase" letterSpacing="wide">Saldo Final</StatLabel>
            <StatNumber fontSize="xl" fontWeight="bold" color={totals.closingBalance >= 0 ? "blue.500" : "red.500"}>
              {formatCurrency(totals.closingBalance)}
            </StatNumber>
          </Stat>
        </Box>
      </SimpleGrid>

      {/* Chart 1: Income vs Expense by period */}
      {periods.length > 0 && (
        <Box bg={panelBg} p={6} borderRadius="lg" boxShadow="sm" mb={6}>
          <Text fontSize="lg" fontWeight="bold" mb={4}>Receitas x Despesas por mês</Text>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={periods} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <Box bg={tooltipBg} border="1px solid" borderColor={tooltipBorder} borderRadius="md" p={3} boxShadow="md">
                      <Text fontWeight="semibold" color={tooltipText} mb={1}>{label}</Text>
                      {payload.map((p) => (
                        <Text key={p.dataKey} fontSize="sm" color={tooltipSubText}>
                          {p.dataKey === "income" ? "Receita" : p.dataKey === "expense" ? "Despesa" : "Resultado"}: {formatCurrency(p.value)}
                        </Text>
                      ))}
                    </Box>
                  );
                }}
              />
              <Legend
                formatter={(value) => value === "income" ? "Receitas" : value === "expense" ? "Despesas" : "Resultado"}
              />
              <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={24} />
              <Bar dataKey="expense" fill="#e11d48" radius={[4, 4, 0, 0]} barSize={24} />
              <Line type="monotone" dataKey="result" stroke="#3182CE" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      )}

      {/* Charts 2+3: Pie charts side by side */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={6}>
        {/* Expenses by category */}
        <Box bg={panelBg} p={6} borderRadius="lg" boxShadow="sm">
          <Text fontSize="lg" fontWeight="bold" mb={4}>Despesas por categoria</Text>
          {expensesByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={expensesByCategory} dataKey="total" nameKey="category" innerRadius={60} outerRadius={100}>
                  {expensesByCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0];
                    const pct = expTotal > 0 ? entry.value / expTotal : 0;
                    return (
                      <Box bg={tooltipBg} p={3} borderRadius="md" boxShadow="md" border="1px solid" borderColor={tooltipBorder}>
                        <Text fontWeight="semibold" color={tooltipText}>{entry.name}</Text>
                        <Text fontSize="sm" color={tooltipSubText}>Total: {formatCurrency(entry.value)}</Text>
                        <Text fontSize="sm" color={tooltipSubText}>Participação: {formatPercent(pct, 1)}</Text>
                      </Box>
                    );
                  }}
                />
                <Legend
                  content={({ payload }) => (
                    <Flex wrap="wrap" gap={2} justify="center" mt={2}>
                      {(payload || []).map((entry) => {
                        const pct = expTotal > 0 ? (entry.payload?.total || 0) / expTotal : 0;
                        return (
                          <Flex key={entry.value} align="center" gap={1} fontSize="xs" color={legendText}>
                            <Box w="8px" h="8px" borderRadius="full" bg={entry.color} flexShrink={0} />
                            <Text>{entry.value} {formatPercent(pct, 1)}</Text>
                          </Flex>
                        );
                      })}
                    </Flex>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Center py={10} color="gray.500"><Text>Sem dados de despesas no período.</Text></Center>
          )}
        </Box>

        {/* Income by category */}
        <Box bg={panelBg} p={6} borderRadius="lg" boxShadow="sm">
          <Text fontSize="lg" fontWeight="bold" mb={4}>Receitas por categoria</Text>
          {incomeByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={incomeByCategory} dataKey="total" nameKey="category" innerRadius={60} outerRadius={100}>
                  {incomeByCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0];
                    const pct = incTotal > 0 ? entry.value / incTotal : 0;
                    return (
                      <Box bg={tooltipBg} p={3} borderRadius="md" boxShadow="md" border="1px solid" borderColor={tooltipBorder}>
                        <Text fontWeight="semibold" color={tooltipText}>{entry.name}</Text>
                        <Text fontSize="sm" color={tooltipSubText}>Total: {formatCurrency(entry.value)}</Text>
                        <Text fontSize="sm" color={tooltipSubText}>Participação: {formatPercent(pct, 1)}</Text>
                      </Box>
                    );
                  }}
                />
                <Legend
                  content={({ payload }) => (
                    <Flex wrap="wrap" gap={2} justify="center" mt={2}>
                      {(payload || []).map((entry) => {
                        const pct = incTotal > 0 ? (entry.payload?.total || 0) / incTotal : 0;
                        return (
                          <Flex key={entry.value} align="center" gap={1} fontSize="xs" color={legendText}>
                            <Box w="8px" h="8px" borderRadius="full" bg={entry.color} flexShrink={0} />
                            <Text>{entry.value} {formatPercent(pct, 1)}</Text>
                          </Flex>
                        );
                      })}
                    </Flex>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Center py={10} color="gray.500"><Text>Sem dados de receitas no período.</Text></Center>
          )}
        </Box>
      </SimpleGrid>

      {/* Chart 4: Stacked bar - Expenses by category by period */}
      {expensesByCategoryPeriod.length > 0 && expenseCategories.length > 0 && (
        <Box bg={panelBg} p={6} borderRadius="lg" boxShadow="sm" mb={6}>
          <Text fontSize="lg" fontWeight="bold" mb={4}>Despesas por categoria por mês</Text>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={expensesByCategoryPeriod} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
                  return (
                    <Box bg={tooltipBg} border="1px solid" borderColor={tooltipBorder} borderRadius="md" p={3} boxShadow="md" maxW="250px">
                      <Text fontWeight="semibold" color={tooltipText} mb={1}>{label}</Text>
                      {payload.filter(p => p.value > 0).map((p) => (
                        <Flex key={p.dataKey} justify="space-between" gap={3}>
                          <Text fontSize="sm" color={tooltipSubText}>{p.dataKey}:</Text>
                          <Text fontSize="sm" color={tooltipSubText} fontWeight="medium">{formatCurrency(p.value)}</Text>
                        </Flex>
                      ))}
                      <Flex justify="space-between" gap={3} mt={1} pt={1} borderTop="1px solid" borderColor={tooltipBorder}>
                        <Text fontSize="sm" fontWeight="bold" color={tooltipText}>Total:</Text>
                        <Text fontSize="sm" fontWeight="bold" color={tooltipText}>{formatCurrency(total)}</Text>
                      </Flex>
                    </Box>
                  );
                }}
              />
              <Legend
                formatter={(value) => value}
              />
              {expenseCategories.map((cat, i) => (
                <Bar key={cat} dataKey={cat} stackId="expenses" fill={EXPENSE_STACK_COLORS[i % EXPENSE_STACK_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {/* Empty state */}
      {!loading && periods.length === 0 && (
        <Center py={10}>
          <Text color="gray.500">Nenhum dado financeiro encontrado para o período selecionado.</Text>
        </Center>
      )}
    </Box>
  );
};

export default CashFlowDashboard;
