import { useEffect, useState } from "react";
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
import { fetchDailySalesDetails } from "../api";
import { formatCurrency, formatNumber } from "../utils/format";

const downloadCsv = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(",")
    )
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
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

const DailySalesDrawer = ({ isOpen, onClose, date, title, filters }) => {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, orders: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const headerBg = useColorModeValue("gray.50", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("gray.200", "gray.700");
  const cardLabel = useColorModeValue("gray.500", "gray.300");

  useEffect(() => {
    if (!isOpen || !date) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("date", date);
    if (filters?.store) params.set("store", filters.store);
    if (filters?.saleChannel) params.set("sale_channel", filters.saleChannel);
    fetchDailySalesDetails(params.toString())
      .then((data) => {
        setRows(data.rows || []);
        setSummary(data.summary || { total: 0, orders: 0 });
      })
      .catch((err) => setError(err.message || "Falha ao carregar vendas."))
      .finally(() => setLoading(false));
  }, [isOpen, date, filters?.store, filters?.saleChannel]);

  const csvRows = rows.map((r) => ({
    "Pedido": r.orderId,
    "Data/Hora": formatDateTime(r.date),
    "Plataforma": r.platform,
    "Loja": r.store,
    "Cliente": r.clientName,
    "Estado": r.state,
    "Qtd": r.quantity,
    "Valor": r.total
  }));

  return (
    <Drawer isOpen={isOpen} placement="right" size="full" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader>{title || "Detalhamento de vendas"}</DrawerHeader>
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
            <Text color="gray.500">Nenhuma venda encontrada para esta data.</Text>
          )}
          {!loading && rows.length > 0 && (
            <>
              <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
                <Text fontSize="sm" color={cardLabel}>
                  {date}
                </Text>
                <Button
                  size="sm"
                  colorScheme="blue"
                  onClick={() => downloadCsv(csvRows, `vendas-${date}.csv`)}
                  isDisabled={!rows.length}
                >
                  Exportar CSV
                </Button>
              </Flex>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <Box
                  bg={cardBg}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor={cardBorder}
                  p={4}
                >
                  <Text fontSize="sm" color={cardLabel} textTransform="uppercase" letterSpacing="wide">
                    Total de vendas
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold">
                    {formatCurrency(summary.total)}
                  </Text>
                </Box>
                <Box
                  bg={cardBg}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor={cardBorder}
                  p={4}
                >
                  <Text fontSize="sm" color={cardLabel} textTransform="uppercase" letterSpacing="wide">
                    Pedidos
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold">
                    {formatNumber(summary.orders)}
                  </Text>
                </Box>
              </SimpleGrid>
              <Box flex="1" minH={0}>
                <TableContainer borderRadius="lg" overflowX="auto" border="1px solid" borderColor="gray.200">
                  <Table size="sm" minW="800px">
                    <Thead bg={headerBg} position="sticky" top={0} zIndex={1}>
                      <Tr>
                        <Th minW="140px">Pedido</Th>
                        <Th minW="140px">Data/Hora</Th>
                        <Th minW="120px">Plataforma</Th>
                        <Th minW="140px">Loja</Th>
                        <Th minW="160px">Cliente</Th>
                        <Th minW="100px">Estado</Th>
                        <Th isNumeric>Qtd</Th>
                        <Th isNumeric>Valor</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {rows.map((row, index) => (
                        <Tr key={`${row.orderId}-${index}`}>
                          <Td>
                            <Badge colorScheme="blue" variant="subtle">
                              {row.orderId}
                            </Badge>
                          </Td>
                          <Td>{formatDateTime(row.date)}</Td>
                          <Td>{row.platform}</Td>
                          <Td>{row.store}</Td>
                          <Td>{row.clientName}</Td>
                          <Td>{row.state}</Td>
                          <Td isNumeric>{formatNumber(row.quantity)}</Td>
                          <Td isNumeric>{formatCurrency(row.total)}</Td>
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

export default DailySalesDrawer;
