import { useEffect, useState, useMemo } from "react";
import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  IconButton,
  Image,
  SimpleGrid,
  Spinner,
  Stat,
  StatArrow,
  StatHelpText,
  StatLabel,
  StatNumber,
  Text,
  Tooltip,
  useColorModeValue
} from "@chakra-ui/react";
import { RepeatIcon } from "@chakra-ui/icons";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { fetchUpsellerTodayAnalytics, refreshUpsellerTodayAnalytics } from "../api";
import { formatCurrency, formatNumber } from "../utils/format";
import { getPlatformMeta } from "../utils/platforms";

const PLATFORM_FALLBACK = {
  amazon: { label: "Amazon", color: "blue.600", bg: "blue.100", letter: "A" },
  magalu: { label: "Magalu", color: "cyan.700", bg: "cyan.100", letter: "Mg" },
};

const platformIcon = (platform) => {
  const key = (platform || "").toLowerCase();
  const lookupName = key === "mercado" ? "Mercado Livre" : platform;
  const meta = getPlatformMeta(lookupName);

  if (meta.logo) {
    return (
      <Tooltip label={meta.label} fontSize="xs" hasArrow>
        <Image src={meta.logo} alt={meta.label} boxSize="24px" objectFit="contain" flexShrink={0} />
      </Tooltip>
    );
  }

  const fallback = PLATFORM_FALLBACK[key] || { label: platform || "-", color: "gray.500", bg: "gray.100", letter: "?" };
  return (
    <Tooltip label={fallback.label} fontSize="xs" hasArrow>
      <Flex
        align="center"
        justify="center"
        w="24px"
        h="24px"
        borderRadius="md"
        bg={fallback.bg}
        color={fallback.color}
        fontWeight="bold"
        fontSize="2xs"
        cursor="default"
        flexShrink={0}
      >
        {fallback.letter}
      </Flex>
    </Tooltip>
  );
};

const formatFetchedAt = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

const UpsellerTodayDrawer = ({ isOpen, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("gray.200", "gray.700");
  const cardLabel = useColorModeValue("gray.500", "gray.300");
  const panelBg = useColorModeValue("white", "gray.800");
  const tooltipBg = useColorModeValue("white", "gray.800");
  const tooltipBorder = useColorModeValue("gray.200", "gray.600");

  const fetchData = () => {
    setLoading(true);
    setError("");
    fetchUpsellerTodayAnalytics()
      .then((res) => {
        if (res.available === false) {
          setError(res.message || "Dados não disponíveis. Verifique se o UpSeller está ativo.");
          setData(null);
        } else {
          setData(res);
        }
      })
      .catch((err) => setError(err.message || "Falha ao carregar dados."))
      .finally(() => setLoading(false));
  };

  const handleRefresh = () => {
    setRefreshing(true);
    refreshUpsellerTodayAnalytics()
      .then((res) => {
        if (res.available !== false) setData(res);
      })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchData();
  }, [isOpen]);

  // Build chart data merging today + yesterday hours
  const chartData = useMemo(() => {
    if (!data) return [];
    const perHour = data.perHour || [];
    const yesPerHour = data.yesPerHour || [];

    // Use max 24 entries (00-23)
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const today = perHour[i] || {};
      const yesterday = yesPerHour[i] || {};
      hours.push({
        hour: `${String(i).padStart(2, "0")}h`,
        todayAmount: today.amount || 0,
        yesterdayAmount: yesterday.amount || 0,
        todayOrders: today.validOrders || 0,
        yesterdayOrders: yesterday.validOrders || 0,
      });
    }
    return hours;
  }, [data]);

  const pctChange = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  const todayPct = data ? pctChange(
    Number(data.todaySaleAmount),
    Number(data.yesterdayPeriodSaleAmount)
  ) : null;
  const ordersPct = data ? pctChange(
    Number(data.todayOrderNum),
    Number(data.yesterdayPeriodOrderNum)
  ) : null;

  const CustomTooltipSales = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <Box bg={tooltipBg} border="1px solid" borderColor={tooltipBorder} borderRadius="md" p={3} boxShadow="lg">
        <Text fontWeight="bold" mb={1}>{label}</Text>
        {payload.map((entry) => (
          <Text key={entry.dataKey} fontSize="sm" color={entry.color}>
            {entry.name}: {formatCurrency(entry.value)}
          </Text>
        ))}
      </Box>
    );
  };

  const CustomTooltipOrders = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <Box bg={tooltipBg} border="1px solid" borderColor={tooltipBorder} borderRadius="md" p={3} boxShadow="lg">
        <Text fontWeight="bold" mb={1}>{label}</Text>
        {payload.map((entry) => (
          <Text key={entry.dataKey} fontSize="sm" color={entry.color}>
            {entry.name}: {formatNumber(entry.value)} pedidos
          </Text>
        ))}
      </Box>
    );
  };

  return (
    <Drawer isOpen={isOpen} placement="right" size="full" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader pb={2}>
          <Flex direction={{ base: "column", md: "row" }} align={{ base: "flex-start", md: "center" }} gap={{ base: 1, md: 3 }} flexWrap="wrap">
            <Flex align="center" gap={3}>
              <Text>Vendas Hoje</Text>
              {data?.fetchedAt && (
                <Text fontSize="xs" color={cardLabel} fontWeight="normal">
                  Atualizado às {formatFetchedAt(data.fetchedAt)}
                </Text>
              )}
            </Flex>
            <IconButton
              icon={<RepeatIcon />}
              size="sm"
              variant="ghost"
              aria-label="Atualizar"
              isLoading={refreshing}
              onClick={handleRefresh}
            />
          </Flex>
        </DrawerHeader>

        <DrawerBody display="flex" flexDirection="column" gap={6} pb={8}>
          {loading && (
            <Flex align="center" gap={2} color="gray.500">
              <Spinner size="sm" />
              <Text>Carregando dados do UpSeller...</Text>
            </Flex>
          )}

          {error && (
            <Text color="red.500">{error}</Text>
          )}

          {!loading && data && (
            <>
              {/* ── Summary Cards ── */}
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                <Box bg={cardBg} borderRadius="lg" border="1px solid" borderColor={cardBorder} p={4}>
                  <Stat>
                    <StatLabel fontSize="xs" color={cardLabel} textTransform="uppercase">Vendas Hoje</StatLabel>
                    <StatNumber fontSize={{ base: "xl", md: "2xl" }} color="blue.500">
                      {formatCurrency(data.todaySaleAmount)}
                    </StatNumber>
                    {todayPct !== null && (
                      <StatHelpText mb={0}>
                        <StatArrow type={todayPct >= 0 ? "increase" : "decrease"} />
                        {Math.abs(todayPct).toFixed(1)}% vs mesmo período ontem
                      </StatHelpText>
                    )}
                  </Stat>
                </Box>
                <Box bg={cardBg} borderRadius="lg" border="1px solid" borderColor={cardBorder} p={4}>
                  <Stat>
                    <StatLabel fontSize="xs" color={cardLabel} textTransform="uppercase">Pedidos Hoje</StatLabel>
                    <StatNumber fontSize={{ base: "xl", md: "2xl" }}>
                      {formatNumber(data.todayOrderNum)}
                    </StatNumber>
                    {ordersPct !== null && (
                      <StatHelpText mb={0}>
                        <StatArrow type={ordersPct >= 0 ? "increase" : "decrease"} />
                        {Math.abs(ordersPct).toFixed(1)}% vs mesmo período ontem
                      </StatHelpText>
                    )}
                  </Stat>
                </Box>
                <Box bg={cardBg} borderRadius="lg" border="1px solid" borderColor={cardBorder} p={4}>
                  <Stat>
                    <StatLabel fontSize="xs" color={cardLabel} textTransform="uppercase">Vendas Ontem (total)</StatLabel>
                    <StatNumber fontSize={{ base: "xl", md: "2xl" }}>
                      {formatCurrency(data.yesterdaySaleAmount)}
                    </StatNumber>
                  </Stat>
                </Box>
                <Box bg={cardBg} borderRadius="lg" border="1px solid" borderColor={cardBorder} p={4}>
                  <Stat>
                    <StatLabel fontSize="xs" color={cardLabel} textTransform="uppercase">Pedidos Ontem (total)</StatLabel>
                    <StatNumber fontSize={{ base: "xl", md: "2xl" }}>
                      {formatNumber(data.yesterdayOrderNum)}
                    </StatNumber>
                  </Stat>
                </Box>
              </SimpleGrid>

              {/* ── Charts ── */}
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                {/* Sales per hour chart */}
                <Box bg={panelBg} p={5} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={cardBorder}>
                  <Text fontSize="md" fontWeight="bold" mb={4}>Pagamentos Recebidos por Hora (R$)</Text>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                      <RechartsTooltip content={<CustomTooltipSales />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="todayAmount"
                        name="Hoje"
                        stroke="#3182CE"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="yesterdayAmount"
                        name="Ontem"
                        stroke="#A0AEC0"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>

                {/* Orders per hour chart */}
                <Box bg={panelBg} p={5} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={cardBorder}>
                  <Text fontSize="md" fontWeight="bold" mb={4}>Pedidos por Hora</Text>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" fontSize={11} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <RechartsTooltip content={<CustomTooltipOrders />} />
                      <Legend />
                      <Bar dataKey="todayOrders" name="Hoje" fill="#3182CE" radius={[4, 4, 0, 0]} barSize={12} />
                      <Bar dataKey="yesterdayOrders" name="Ontem" fill="#CBD5E0" radius={[4, 4, 0, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </SimpleGrid>

              {/* ── Rankings ── */}
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                {/* Shop ranking */}
                {data.shopTops?.length > 0 && (
                  <Box bg={panelBg} p={{ base: 3, md: 5 }} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={cardBorder}>
                    <Text fontSize="md" fontWeight="bold" mb={3}>Ranking de Lojas</Text>
                    <Flex direction="column" gap={0}>
                      {data.shopTops.map((shop, i) => (
                        <Flex
                          key={`${shop.shopId}-${i}`}
                          align="center"
                          gap={{ base: 2, md: 3 }}
                          py={2}
                          px={1}
                          borderBottom="1px solid"
                          borderColor={cardBorder}
                          _last={{ borderBottom: "none" }}
                        >
                          <Text fontWeight="bold" color="gray.500" fontSize="sm" w="20px" textAlign="center" flexShrink={0}>
                            {i + 1}
                          </Text>
                          {platformIcon(shop.platform)}
                          <Box flex={1} minW={0}>
                            <Text fontSize="sm" isTruncated>{shop.shopName}</Text>
                          </Box>
                          <Flex direction="column" align="flex-end" flexShrink={0}>
                            <Text fontSize="sm" fontWeight="semibold">{formatCurrency(shop.validSales)}</Text>
                            <Text fontSize="xs" color={cardLabel}>{formatNumber(shop.validOrders)} pedidos</Text>
                          </Flex>
                        </Flex>
                      ))}
                    </Flex>
                  </Box>
                )}

                {/* Product ranking */}
                {data.productTops?.length > 0 && (
                  <Box bg={panelBg} p={{ base: 3, md: 5 }} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={cardBorder}>
                    <Text fontSize="md" fontWeight="bold" mb={3}>Ranking de Produtos</Text>
                    <Flex direction="column" gap={0}>
                      {data.productTops.map((prod, i) => (
                        <Flex
                          key={`${prod.productName}-${i}`}
                          align="center"
                          gap={{ base: 2, md: 3 }}
                          py={2}
                          px={1}
                          borderBottom="1px solid"
                          borderColor={cardBorder}
                          _last={{ borderBottom: "none" }}
                        >
                          <Text fontWeight="bold" color="gray.500" fontSize="sm" w="20px" textAlign="center" flexShrink={0}>
                            {i + 1}
                          </Text>
                          <Box flexShrink={0}>
                            {prod.productImg ? (
                              <Image
                                src={prod.productImg}
                                alt={prod.productName}
                                boxSize="36px"
                                objectFit="cover"
                                borderRadius="md"
                                fallback={<Box w="36px" h="36px" bg="gray.100" borderRadius="md" />}
                              />
                            ) : (
                              <Box w="36px" h="36px" bg="gray.100" borderRadius="md" />
                            )}
                          </Box>
                          <Box flex={1} minW={0}>
                            <Text fontSize="sm" isTruncated title={prod.productName}>{prod.productName}</Text>
                            <Text fontSize="xs" color={cardLabel} isTruncated>{prod.shopName}</Text>
                          </Box>
                          <Flex direction="column" align="flex-end" flexShrink={0}>
                            <Text fontSize="sm" fontWeight="semibold">{formatCurrency(prod.sales)}</Text>
                            <Text fontSize="xs" color={cardLabel}>{formatNumber(prod.unitsSold)} unid.</Text>
                          </Flex>
                        </Flex>
                      ))}
                    </Flex>
                  </Box>
                )}
              </SimpleGrid>
            </>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default UpsellerTodayDrawer;
