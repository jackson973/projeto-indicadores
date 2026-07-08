import { useEffect, useState, useCallback } from "react";
import {
  Badge, Box, Button, Flex, FormControl, FormLabel, Input, SimpleGrid, Spinner, Table, Tbody,
  Td, Th, Thead, Tr, Text, Tooltip, useBreakpointValue, useColorModeValue, VStack,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import CardStat from "./CardStat";
import { fetchStockProducts, fetchCostConfigStatus } from "../api";
import CostPriceDetail from "./CostPriceDetail";

const BRL = (n) => (!n ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

const STATUS_META = {
  ok:      { label: "Configurado",      color: "green" },
  parcial: { label: "Parcial",          color: "orange" },
  nao:     { label: "Não configurado",  color: "red" },
};

function statusTip(cfg) {
  if (!cfg) return "";
  const parts = [
    cfg.hasCost ? "✓ Custo definido" : "✗ Sem custo",
    cfg.suppliers > 0 ? `✓ ${cfg.suppliers} fornecedor(es)` : "✗ Sem fornecedor",
    cfg.lojasTotal > 0
      ? `${cfg.lojasPrice >= cfg.lojasTotal ? "✓" : "✗"} Preço em ${cfg.lojasPrice}/${cfg.lojasTotal} lojas`
      : "✗ Nenhuma loja cadastrada (sincronize em Canais & Taxas)",
  ];
  return parts.join("\n");
}

function weightedAvg(variants = []) {
  let bal = 0, val = 0;
  variants.forEach(v => { const b = Number(v.balance) || 0; if (b > 0) { bal += b; val += b * (Number(v.avg_cost) || 0); } });
  return bal > 0 ? val / bal : 0;
}

export default function CostPriceList() {
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const toast = useAppToast();

  const subtle = useColorModeValue("gray.500", "gray.400");
  const hoverBg = useColorModeValue("gray.50", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const isMobile = useBreakpointValue({ base: true, md: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, cfg] = await Promise.all([
        fetchStockProducts({ search }),
        fetchCostConfigStatus().catch(() => ({})),
      ]);
      setItems(prods);
      setConfig(cfg || {});
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar produtos", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return <CostPriceDetail productId={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Análise de Custo e Preço</Text>
      <Text fontSize="sm" color={subtle} mb={4}>Custo médio e custos por fornecedor de cada produto. Toque numa linha para abrir o detalhe.</Text>

      <Flex gap={3} align="end" wrap="wrap" mb={4}>
        <FormControl maxW="280px">
          <FormLabel fontSize="sm">Buscar</FormLabel>
          <Input placeholder="código ou descrição" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} />
        </FormControl>
        <Button onClick={load}>Buscar</Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={10}><Spinner /></Flex>
      ) : !items.length ? (
        <Text fontSize="sm" color={subtle}>Nenhum produto encontrado.</Text>
      ) : isMobile ? (
        <VStack spacing={2} align="stretch">
          {items.map(p => {
            const variants = p.variants || [];
            const saldo = variants.reduce((s, v) => s + (Number(v.balance) || 0), 0);
            const avg = weightedAvg(variants);
            const cfg = config[p.id];
            const meta = STATUS_META[cfg?.status || "nao"];
            return (
              <Box key={p.id} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}
                cursor="pointer" onClick={() => setSelected(p.id)}>
                <Flex justify="space-between" align="start" gap={2} mb={2}>
                  <Text fontSize="sm" noOfLines={2}><b>{p.codigo}</b> · {p.descricao}</Text>
                  <Badge colorScheme={meta.color} flexShrink={0}>{meta.label}</Badge>
                </Flex>
                <SimpleGrid columns={3} spacingX={2} spacingY={3}>
                  <CardStat label="Saldo">{saldo}</CardStat>
                  <CardStat label="Kit">{p.default_kit_qty || 1}</CardStat>
                  <CardStat label="Custo médio">{BRL(avg)}</CardStat>
                </SimpleGrid>
              </Box>
            );
          })}
        </VStack>
      ) : (
        <Box overflowX="auto">
          <Table size="sm">
            <Thead><Tr><Th>Produto</Th><Th isNumeric>Saldo</Th><Th isNumeric>Kit</Th><Th isNumeric>Custo médio</Th><Th>Status</Th><Th isNumeric></Th></Tr></Thead>
            <Tbody>
              {items.map(p => {
                const variants = p.variants || [];
                const saldo = variants.reduce((s, v) => s + (Number(v.balance) || 0), 0);
                const avg = weightedAvg(variants);
                const cfg = config[p.id];
                const meta = STATUS_META[cfg?.status || "nao"];
                return (
                  <Tr key={p.id} _hover={{ bg: hoverBg }} cursor="pointer" onClick={() => setSelected(p.id)}>
                    <Td><b>{p.codigo}</b> · {p.descricao}</Td>
                    <Td isNumeric>{saldo}</Td>
                    <Td isNumeric>{p.default_kit_qty || 1}</Td>
                    <Td isNumeric>{BRL(avg)}</Td>
                    <Td>
                      <Tooltip label={statusTip(cfg)} hasArrow placement="top" whiteSpace="pre-line" openDelay={150}>
                        <Badge colorScheme={meta.color} cursor="help">{meta.label}</Badge>
                      </Tooltip>
                    </Td>
                    <Td isNumeric><Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); setSelected(p.id); }}>Abrir</Button></Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
