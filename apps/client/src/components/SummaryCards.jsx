import { useState } from "react";
import {
  Box,
  Button,
  IconButton,
  SimpleGrid,
  Spinner,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  HStack,
  Icon,
  Text,
  useColorModeValue
} from "@chakra-ui/react";
import {
  AtSignIcon,
  CalendarIcon,
  CheckCircleIcon,
  InfoIcon,
  RepeatIcon,
  StarIcon,
  SunIcon,
  TimeIcon,
  WarningIcon
} from "@chakra-ui/icons";
import { formatCurrency, formatNumber } from "../utils/format";

const formatLastUpdate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo"
  });
};

const SummaryCards = ({ summary, onCanceledClick, onTodayClick, onYesterdayClick, onRefresh, onRefreshFabrica, onRefreshOnline }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingFabrica, setRefreshingFabrica] = useState(false);
  const [refreshingOnline, setRefreshingOnline] = useState(false);
  if (!summary) return null;

  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("gray.100", "gray.700");
  const labelColor = useColorModeValue("gray.500", "gray.300");
  const valueColor = useColorModeValue("gray.800", "gray.100");
  const mutedColor = useColorModeValue("gray.400", "gray.500");

  const sisplanUpdate = formatLastUpdate(summary.lastUpdate);
  const upsellerUpdate = formatLastUpdate(summary.upsellerFetchedAt);

  const handleRefreshFabrica = () => {
    if (!onRefreshFabrica || refreshingFabrica) return;
    setRefreshingFabrica(true);
    Promise.resolve(onRefreshFabrica()).finally(() => setRefreshingFabrica(false));
  };

  const handleRefreshOnline = () => {
    if (!onRefreshOnline || refreshingOnline) return;
    setRefreshingOnline(true);
    Promise.resolve(onRefreshOnline()).finally(() => setRefreshingOnline(false));
  };

  const items = [
    { title: "Vendas Hoje", value: formatCurrency(summary.todayRevenue), icon: SunIcon, action: onTodayClick, actionLabel: "Detalhes", refreshable: true },
    { title: "Vendas Ontem", value: formatCurrency(summary.yesterdayRevenue), icon: CalendarIcon, onClick: onYesterdayClick },
    { title: "Faturamento", value: formatCurrency(summary.totalRevenue), icon: StarIcon },
    { title: "Ticket médio", value: formatCurrency(summary.ticketAverage), icon: TimeIcon },
    { title: "Itens vendidos", value: formatNumber(summary.totalQuantity), icon: CheckCircleIcon },
    { title: "Vendas", value: formatNumber(summary.totalSales), icon: CalendarIcon },
    {
      title: "Cancelados/Devolvidos",
      value: formatCurrency(summary.canceledTotal || 0),
      icon: WarningIcon,
      help: `${formatNumber(summary.canceledOrders || 0)} pedidos`,
      onClick: onCanceledClick
    },
    { title: "Lojas", value: formatNumber(summary.totalStores), icon: InfoIcon },
    { title: "Produtos", value: formatNumber(summary.totalProducts), icon: AtSignIcon },
    { title: "Estados", value: formatNumber(summary.totalStates), icon: InfoIcon }
  ];

  return (
    <>
      {(sisplanUpdate || upsellerUpdate) && (
        <HStack fontSize="xs" color={mutedColor} mb={2} justify="flex-end" spacing={1} whiteSpace="nowrap">
          <Text>Atualização:</Text>
          {sisplanUpdate && (
            <>
              <Text>Fábrica {sisplanUpdate}</Text>
              {onRefreshFabrica && (
                refreshingFabrica
                  ? <Spinner size="xs" />
                  : <IconButton icon={<RepeatIcon />} size="xs" variant="ghost" aria-label="Atualizar Fábrica" onClick={handleRefreshFabrica} minW="auto" h="auto" p={0.5} />
              )}
            </>
          )}
          {sisplanUpdate && upsellerUpdate && <Text mx={1}>|</Text>}
          {upsellerUpdate && (
            <>
              <Text>Online {upsellerUpdate}</Text>
              {onRefreshOnline && (
                refreshingOnline
                  ? <Spinner size="xs" />
                  : <IconButton icon={<RepeatIcon />} size="xs" variant="ghost" aria-label="Atualizar Online" onClick={handleRefreshOnline} minW="auto" h="auto" p={0.5} />
              )}
            </>
          )}
        </HStack>
      )}
      <SimpleGrid className="panel" columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing={4}>
        {items.map((item) => (
          <Box
            key={item.title}
            bg={cardBg}
            p={5}
            borderRadius="xl"
            boxShadow="md"
            border="1px solid"
            borderColor={cardBorder}
            cursor={item.onClick ? "pointer" : "default"}
            _hover={item.onClick ? { boxShadow: "lg", transform: "translateY(-2px)" } : undefined}
            transition="all 0.2s ease"
            onClick={item.onClick}
          >
            <Stat>
              <StatLabel fontSize="sm" color={labelColor} textTransform="uppercase" letterSpacing="wide">
                <HStack spacing={2}>
                  <Icon as={item.icon} color="blue.500" />
                  <span>{item.title}</span>
                </HStack>
              </StatLabel>
              <StatNumber fontSize="2xl" fontWeight="bold" color={valueColor}>
                {item.value}
              </StatNumber>
              {item.help && (
                <StatHelpText fontSize="sm" color={labelColor} mt={1}>
                  {item.help}
                </StatHelpText>
              )}
            </Stat>
            {(item.action || item.refreshable) && (
              <HStack spacing={2} mt={2} justify="space-between">
                {item.action && (
                  <Button
                    size="xs"
                    colorScheme="blue"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); item.action(); }}
                  >
                    {item.actionLabel}
                  </Button>
                )}
                {item.refreshable && onRefresh && (
                  <IconButton
                    icon={<RepeatIcon />}
                    size="sm"
                    variant="ghost"
                    aria-label="Atualizar"
                    isLoading={refreshing}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRefreshing(true);
                      Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
                    }}
                  />
                )}
              </HStack>
            )}
          </Box>
        ))}
      </SimpleGrid>
    </>
  );
};

export default SummaryCards;
