import { useEffect, useState, useCallback } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import { fetchStockConsumption, fetchStockLowStock } from "../api";

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

export default function StockReports() {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - 29);

  const [from, setFrom] = useState(toISO(past));
  const [to, setTo] = useState(toISO(today));
  const [report, setReport] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
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
      // Ordena por menor cobertura (risco de ruptura) primeiro; sem saída vai ao fim
      rep.items.sort((a, b) => {
        const ca = a.coverage_days, cb = b.coverage_days;
        if (ca === null && cb === null) return 0;
        if (ca === null) return 1;
        if (cb === null) return -1;
        return ca - cb;
      });
      setReport(rep);
      setLowStock(low);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar relatório", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Relatórios de Estoque</Text>
      <Text fontSize="sm" color={subtle} mb={4}>
        Consumo médio (apenas saídas) no período e previsão de cobertura. Alerta de estoque baixo conforme o mínimo de cada produto.
      </Text>

      <Flex gap={3} align="end" wrap="wrap" mb={4}>
        <FormControl maxW="180px">
          <FormLabel fontSize="sm">De</FormLabel>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </FormControl>
        <FormControl maxW="180px">
          <FormLabel fontSize="sm">Até</FormLabel>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
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
                    <Th isNumeric>Média/dia</Th><Th isNumeric>Cobertura (dias)</Th><Th isNumeric>Mínimo</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {report.items.map(i => {
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
