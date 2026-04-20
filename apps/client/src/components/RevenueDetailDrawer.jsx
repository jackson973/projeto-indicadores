import { useEffect, useState, useMemo } from "react";
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Image,
  SimpleGrid,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  Tooltip,
  useColorModeValue
} from "@chakra-ui/react";
import { DownloadIcon } from "@chakra-ui/icons";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from "recharts";
import { fetchSalesByPeriod, fetchSalesByStore, fetchAbc, getToken } from "../api";
import { formatCurrency, formatNumber } from "../utils/format";
import { getPlatformMeta } from "../utils/platforms";
import useAppToast from "../hooks/useAppToast";

const extractPlatform = (storeName) => {
  const match = (storeName || "").match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : null;
};

const PlatformIcon = ({ storeName }) => {
  const platform = extractPlatform(storeName);
  if (!platform) return null;
  const meta = getPlatformMeta(platform);
  if (meta.logo) {
    return (
      <Tooltip label={meta.label} fontSize="xs" hasArrow>
        <Image src={meta.logo} alt={meta.label} boxSize="24px" objectFit="contain" flexShrink={0} />
      </Tooltip>
    );
  }
  const letter = platform.charAt(0).toUpperCase();
  return (
    <Tooltip label={platform} fontSize="xs" hasArrow>
      <Flex
        align="center"
        justify="center"
        w="24px"
        h="24px"
        borderRadius="md"
        bg="gray.100"
        color="gray.500"
        fontWeight="bold"
        fontSize="2xs"
        flexShrink={0}
      >
        {letter}
      </Flex>
    </Tooltip>
  );
};

const formatShortDate = (value) => {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return value;
};

const RevenueDetailDrawer = ({ isOpen, onClose, filters, summary }) => {
  const [dailyData, setDailyData] = useState([]);
  const [storeRanking, setStoreRanking] = useState([]);
  const [productRanking, setProductRanking] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const toast = useAppToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("gray.200", "gray.700");
  const cardLabel = useColorModeValue("gray.500", "gray.300");
  const panelBg = useColorModeValue("white", "gray.800");
  const tooltipBg = useColorModeValue("white", "gray.800");
  const tooltipBorder = useColorModeValue("gray.200", "gray.600");

  useEffect(() => {
    if (!isOpen || !filters) return;
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set("start", filters.start);
    params.set("end", filters.end);
    if (filters.store) params.set("store", filters.store);
    if (filters.saleChannel) params.set("sale_channel", filters.saleChannel);

    const dailyParams = new URLSearchParams(params);
    dailyParams.set("period", "day");

    Promise.all([
      fetchSalesByPeriod(dailyParams.toString()),
      fetchSalesByStore(params.toString()),
      fetchAbc(params.toString()),
    ])
      .then(([daily, stores, products]) => {
        setDailyData(daily || []);
        setStoreRanking(stores || []);
        setProductRanking((products || []).slice(0, 10));
      })
      .catch((err) => setError(err.message || "Falha ao carregar dados."))
      .finally(() => setLoading(false));
  }, [isOpen, filters?.start, filters?.end, filters?.store, filters?.saleChannel]);

  const cumulativeData = useMemo(() => {
    if (!dailyData.length) return [];
    let acc = 0;
    return dailyData.map((d) => {
      acc += Number(d.total || 0);
      return {
        period: formatShortDate(d.period),
        daily: Number(d.total || 0),
        cumulative: acc,
      };
    });
  }, [dailyData]);

  const handleExportAnalytic = async () => {
    if (!filters) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("start", filters.start);
      params.set("end", filters.end);
      if (filters.store) params.set("store", filters.store);
      if (filters.saleChannel) params.set("sale_channel", filters.saleChannel);

      const token = getToken();
      const response = await fetch(`/api/sales-analytic-export?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        const msg = response.status === 404
          ? "Sem vendas no período."
          : "Erro ao exportar analítico.";
        throw new Error(msg);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `analitico-vendas-${filters.start}_a_${filters.end}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast({ title: err.message || "Erro ao exportar analítico.", status: "error", duration: 3000 });
    } finally {
      setExporting(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
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

  return (
    <Drawer isOpen={isOpen} placement="right" size="full" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader pb={2}>
          <Flex align="center" justify="space-between" gap={3} pr={8}>
            <Text>Detalhamento do Faturamento</Text>
            <Button
              leftIcon={<DownloadIcon />}
              colorScheme="green"
              variant="outline"
              size="sm"
              onClick={handleExportAnalytic}
              isLoading={exporting}
              loadingText="Exportando..."
            >
              Exportar Analítico
            </Button>
          </Flex>
        </DrawerHeader>

        <DrawerBody display="flex" flexDirection="column" gap={6} pb={8}>
          {loading && (
            <Flex align="center" gap={2} color="gray.500">
              <Spinner size="sm" />
              <Text>Carregando dados...</Text>
            </Flex>
          )}

          {error && <Text color="red.500">{error}</Text>}

          {!loading && !error && (
            <>
              {/* Summary Cards */}
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                <Box bg={cardBg} borderRadius="lg" border="1px solid" borderColor={cardBorder} p={4}>
                  <Stat>
                    <StatLabel fontSize="xs" color={cardLabel} textTransform="uppercase">Faturamento</StatLabel>
                    <StatNumber fontSize={{ base: "xl", md: "2xl" }} color="blue.500">
                      {formatCurrency(summary?.totalRevenue)}
                    </StatNumber>
                  </Stat>
                </Box>
                <Box bg={cardBg} borderRadius="lg" border="1px solid" borderColor={cardBorder} p={4}>
                  <Stat>
                    <StatLabel fontSize="xs" color={cardLabel} textTransform="uppercase">Pedidos</StatLabel>
                    <StatNumber fontSize={{ base: "xl", md: "2xl" }}>
                      {formatNumber(summary?.totalSales)}
                    </StatNumber>
                  </Stat>
                </Box>
                <Box bg={cardBg} borderRadius="lg" border="1px solid" borderColor={cardBorder} p={4}>
                  <Stat>
                    <StatLabel fontSize="xs" color={cardLabel} textTransform="uppercase">Ticket Medio</StatLabel>
                    <StatNumber fontSize={{ base: "xl", md: "2xl" }}>
                      {formatCurrency(summary?.ticketAverage)}
                    </StatNumber>
                  </Stat>
                </Box>
                <Box bg={cardBg} borderRadius="lg" border="1px solid" borderColor={cardBorder} p={4}>
                  <Stat>
                    <StatLabel fontSize="xs" color={cardLabel} textTransform="uppercase">Itens Vendidos</StatLabel>
                    <StatNumber fontSize={{ base: "xl", md: "2xl" }}>
                      {formatNumber(summary?.totalQuantity)}
                    </StatNumber>
                  </Stat>
                </Box>
              </SimpleGrid>

              {/* Cumulative Revenue Chart */}
              {cumulativeData.length > 0 && (
                <Box bg={panelBg} p={5} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={cardBorder}>
                  <Text fontSize="md" fontWeight="bold" mb={4}>Faturamento por Dia (Cumulativo)</Text>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={cumulativeData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        name="Acumulado"
                        stroke="#3182CE"
                        fill="#3182CE"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="daily"
                        name="Dia"
                        stroke="#48BB78"
                        fill="#48BB78"
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              )}

              {/* Rankings */}
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                {/* Store Ranking */}
                {storeRanking.length > 0 && (
                  <Box bg={panelBg} p={{ base: 3, md: 5 }} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={cardBorder}>
                    <Text fontSize="md" fontWeight="bold" mb={3}>Ranking de Lojas</Text>
                    <Flex direction="column" gap={0}>
                      {storeRanking.map((shop, i) => (
                        <Flex
                          key={`${shop.store}-${i}`}
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
                          <PlatformIcon storeName={shop.store} />
                          <Box flex={1} minW={0}>
                            <Text fontSize="sm" isTruncated>{shop.store}</Text>
                          </Box>
                          <Flex direction="column" align="flex-end" flexShrink={0}>
                            <Text fontSize="sm" fontWeight="semibold">{formatCurrency(shop.total)}</Text>
                            <Text fontSize="xs" color={cardLabel}>{formatNumber(shop.quantity)} itens</Text>
                          </Flex>
                        </Flex>
                      ))}
                    </Flex>
                  </Box>
                )}

                {/* Product Ranking */}
                {productRanking.length > 0 && (
                  <Box bg={panelBg} p={{ base: 3, md: 5 }} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={cardBorder}>
                    <Text fontSize="md" fontWeight="bold" mb={3}>Ranking de Produtos</Text>
                    <Flex direction="column" gap={0}>
                      {productRanking.map((prod, i) => (
                        <Flex
                          key={`${prod.adName || prod.product}-${i}`}
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
                            {prod.image ? (
                              <Image
                                src={prod.image}
                                alt={prod.adName || prod.product}
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
                            <Text fontSize="sm" isTruncated title={prod.adName || prod.product}>
                              {prod.adName || prod.product}
                            </Text>
                            {prod.store && (
                              <Text fontSize="xs" color={cardLabel} isTruncated>{prod.store}</Text>
                            )}
                          </Box>
                          <Flex direction="column" align="flex-end" flexShrink={0}>
                            <Text fontSize="sm" fontWeight="semibold">{formatCurrency(prod.total)}</Text>
                            <Text fontSize="xs" color={cardLabel}>{formatNumber(prod.quantity)} unid.</Text>
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

export default RevenueDetailDrawer;
