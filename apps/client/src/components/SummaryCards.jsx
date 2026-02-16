import {
  Box,
  SimpleGrid,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  HStack,
  Icon,
  useColorModeValue
} from "@chakra-ui/react";
import {
  AtSignIcon,
  CalendarIcon,
  CheckCircleIcon,
  InfoIcon,
  StarIcon,
  TimeIcon,
  WarningIcon
} from "@chakra-ui/icons";
import { formatCurrency, formatNumber } from "../utils/format";

const SummaryCards = ({ summary, onCanceledClick }) => {
  if (!summary) return null;

  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("gray.100", "gray.700");
  const labelColor = useColorModeValue("gray.500", "gray.300");
  const valueColor = useColorModeValue("gray.800", "gray.100");

  const items = [
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
        </Box>
      ))}
    </SimpleGrid>
  );
};

export default SummaryCards;
