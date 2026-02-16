import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Button,
  SimpleGrid,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useColorModeValue
} from "@chakra-ui/react";
import { fetchCanceledDetails, fetchCanceledSummary } from "../api";
import { formatCurrency, formatNumber } from "../utils/format";

const downloadCsv = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${row[key]}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const CanceledReportDrawer = ({ isOpen, onClose, filters }) => {
  const [rows, setRows] = useState([]);
  const [activeReason, setActiveReason] = useState("");
  const [summary, setSummary] = useState({ total: 0, orders: 0, reasons: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const headerBg = useColorModeValue("gray.50", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("gray.200", "gray.700");
  const activeBorder = useColorModeValue("blue.400", "blue.300");
  const cardLabel = useColorModeValue("gray.500", "gray.300");

  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (filters?.start) search.set("start", filters.start);
    if (filters?.end) search.set("end", filters.end);
    if (filters?.store) search.set("store", filters.store);
    if (filters?.state) search.set("state", filters.state);
    return search.toString();
  }, [filters]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError("");
    Promise.all([fetchCanceledDetails(params), fetchCanceledSummary(params)])
      .then(([details, summaryData]) => {
        setRows(details);
        setSummary(summaryData || { total: 0, orders: 0, reasons: [] });
        setActiveReason("");
      })
      .catch((err) => setError(err.message || "Falha ao carregar cancelamentos."))
      .finally(() => setLoading(false));
  }, [isOpen, params]);

  const filteredRows = activeReason
    ? rows.filter((row) => row.cancelReason === activeReason)
    : rows;

  return (
    <Drawer isOpen={isOpen} placement="right" size="full" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader>Relatório de cancelados/devolvidos</DrawerHeader>
        <DrawerBody display="flex" flexDirection="column" gap={4}>
          {loading && (
            <Flex align="center" gap={2} color="gray.500" mb={4}>
              <Spinner size="sm" />
              <Text>Carregando detalhes...</Text>
            </Flex>
          )}
          {error && (
            <Text color="red.500" mb={4}>
              {error}
            </Text>
          )}
          {!loading && !rows.length && !error && (
            <Text color="gray.500">Nenhum cancelamento encontrado para os filtros atuais.</Text>
          )}
          {!!rows.length && (
            <>
              <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
                <Text fontSize="sm" color={cardLabel}>
                  {activeReason ? `Filtrado por: ${activeReason}` : "Todos os cancelamentos"}
                </Text>
                <Button size="sm" colorScheme="blue" onClick={() => downloadCsv(filteredRows, "cancelamentos.csv")}
                  isDisabled={!filteredRows.length}
                >
                  Exportar CSV
                </Button>
              </Flex>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                <Box
                  bg={cardBg}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor={activeReason ? cardBorder : activeBorder}
                  p={4}
                  cursor={activeReason ? "pointer" : "default"}
                  onClick={() => setActiveReason("")}
                  _hover={activeReason ? { boxShadow: "md" } : undefined}
                >
                  <Text fontSize="sm" color={cardLabel} textTransform="uppercase" letterSpacing="wide">
                    Total cancelado
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold">
                    {formatCurrency(summary.total || 0)}
                  </Text>
                  <Text fontSize="sm" color={cardLabel}>
                    {formatNumber(summary.orders || 0)} pedidos
                  </Text>
                </Box>
                {summary.reasons?.map((reason) => (
                  <Box
                    key={reason.reason}
                    bg={cardBg}
                    borderRadius="lg"
                    border="1px solid"
                    borderColor={activeReason === reason.reason ? activeBorder : cardBorder}
                    p={4}
                    cursor="pointer"
                    onClick={() => setActiveReason(reason.reason)}
                    _hover={{ boxShadow: "md" }}
                  >
                    <Text fontSize="sm" color={cardLabel} textTransform="uppercase" letterSpacing="wide">
                      {reason.reason}
                    </Text>
                    <Text fontSize="xl" fontWeight="bold">
                      {formatCurrency(reason.total)}
                    </Text>
                    <Text fontSize="sm" color={cardLabel}>
                      {formatNumber(reason.orders)} pedidos
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
              <Box flex="1" minH={0}>
                <TableContainer borderRadius="lg" overflowX="auto" border="1px solid" borderColor="gray.200">
                  <Table size="sm" minW="960px">
                    <Thead bg={headerBg} position="sticky" top={0} zIndex={1}>
                      <Tr>
                        <Th minW="140px">Nº do pedido</Th>
                        <Th minW="140px">Data/Hora</Th>
                        <Th minW="240px">Produto</Th>
                        <Th isNumeric>Quantidade</Th>
                        <Th isNumeric>Valor</Th>
                        <Th minW="200px">Pós-venda/Cancelado/Devolvido</Th>
                        <Th minW="160px">Cancelado por</Th>
                        <Th minW="220px">Razão do cancelamento</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {filteredRows.map((row, index) => (
                        <Tr key={`${row.orderId}-${index}`}>
                          <Td>
                            <Badge colorScheme="red" variant="subtle">
                              {row.orderId}
                            </Badge>
                          </Td>
                          <Td>{formatDateTime(row.date)}</Td>
                          <Td>{row.product}</Td>
                          <Td isNumeric>{formatNumber(row.quantity)}</Td>
                          <Td isNumeric>{formatCurrency(row.total)}</Td>
                          <Td>{row.status || "-"}</Td>
                          <Td>{row.cancelBy}</Td>
                          <Td>{row.cancelReason}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              </Box>
            </>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default CanceledReportDrawer;
