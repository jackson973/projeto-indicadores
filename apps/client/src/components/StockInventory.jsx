import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  NumberInput,
  NumberInputField,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, SearchIcon } from "@chakra-ui/icons";
import BarcodeScanner from "./BarcodeScanner";
import useAppToast from "../hooks/useAppToast";
import {
  fetchStockProducts,
  fetchStockInventorySessions,
  openStockInventorySession,
  fetchStockInventorySession,
  setStockInventoryCount,
  removeStockInventoryCount,
  finalizeStockInventorySession,
  cancelStockInventorySession,
  scanStockBarcode,
} from "../api";

export default function StockInventory() {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);     // sessão atual com counts
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualQty, setManualQty] = useState({}); // variantId -> valor digitado
  const toast = useAppToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");

  const loadSessions = useCallback(async () => {
    try { setSessions(await fetchStockInventorySessions()); }
    catch (e) { toast({ status: "error", title: "Erro ao carregar sessões", description: e.message }); }
  }, [toast]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [sess, prods] = await Promise.all([fetchStockInventorySessions(), fetchStockProducts()]);
        setSessions(sess);
        setProducts(prods);
        const open = sess.find(s => s.status === "aberta");
        if (open) setActive(await fetchStockInventorySession(open.id));
      } catch (e) {
        toast({ status: "error", title: "Erro ao carregar", description: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  async function refreshActive() {
    if (!active) return;
    setActive(await fetchStockInventorySession(active.id));
  }

  async function handleStart() {
    setBusy(true);
    try {
      const s = await openStockInventorySession({ modo: "contagem" });
      setActive(await fetchStockInventorySession(s.id));
      loadSessions();
    } catch (e) {
      toast({ status: "error", title: "Erro ao iniciar", description: e.message });
    } finally { setBusy(false); }
  }

  async function openExisting(id) {
    try { setActive(await fetchStockInventorySession(id)); }
    catch (e) { toast({ status: "error", title: "Erro ao abrir sessão", description: e.message }); }
  }

  // mapa variant_id -> counted_qty da sessão atual
  const countMap = useMemo(() => {
    const m = {};
    (active?.counts || []).forEach(c => { m[c.variant_id] = c.counted_qty; });
    return m;
  }, [active]);

  async function setCount(variantId, counted_qty) {
    try {
      await setStockInventoryCount(active.id, { variant_id: variantId, counted_qty });
      await refreshActive();
    } catch (e) {
      toast({ status: "error", title: "Erro ao lançar contagem", description: e.message });
    }
  }

  async function incrementCount(variantId, by = 1) {
    await setStockInventoryCount(active.id, { variant_id: variantId, increment: by });
    await refreshActive();
  }

  async function handleRemoveCount(variantId) {
    try { await removeStockInventoryCount(active.id, variantId); await refreshActive(); }
    catch (e) { toast({ status: "error", title: "Erro ao remover", description: e.message }); }
  }

  const handleScan = useCallback(async (code) => {
    if (!active || active.status !== "aberta") return { status: "error", message: "Nenhuma sessão aberta" };
    try {
      const v = await scanStockBarcode(code);
      const row = await setStockInventoryCount(active.id, { variant_id: v.variant_id, increment: 1 });
      await refreshActive();
      return { status: "success", message: `${v.product_codigo} ${v.tamanho} · contado ${row.counted_qty}` };
    } catch (e) {
      return { status: "error", message: e.message || "Erro" };
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFinalize() {
    if (!window.confirm("Finalizar a contagem? O saldo dos itens contados será ajustado para o valor contado.")) return;
    setBusy(true);
    try {
      const res = await finalizeStockInventorySession(active.id);
      const ajustes = (res.counts || []).filter(c => c.diff !== 0).length;
      toast({ status: "success", title: "Inventário finalizado", description: `${ajustes} ajuste(s) aplicado(s).` });
      setActive(res);
      loadSessions();
    } catch (e) {
      toast({ status: "error", title: "Erro ao finalizar", description: e.message });
    } finally { setBusy(false); }
  }

  async function handleCancel() {
    if (!window.confirm("Cancelar esta contagem? Nada será ajustado.")) return;
    try {
      await cancelStockInventorySession(active.id);
      toast({ status: "info", title: "Contagem cancelada" });
      setActive(null);
      loadSessions();
    } catch (e) {
      toast({ status: "error", title: "Erro ao cancelar", description: e.message });
    }
  }

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q));
  }, [products, search]);

  if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;

  // ── Sem sessão aberta: tela de início + histórico ──
  if (!active) {
    return (
      <Box>
        <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={3}>
          <Box>
            <Text fontSize="xl" fontWeight="bold">Inventário / Acerto</Text>
            <Text fontSize="sm" color={subtle}>Conte os produtos (bipando ou digitando). Use também para lançar o saldo inicial.</Text>
          </Box>
          <Button colorScheme="blue" leftIcon={<AddIcon />} isLoading={busy} onClick={handleStart}>Nova contagem</Button>
        </Flex>
        <Text fontWeight="semibold" mb={2}>Sessões anteriores</Text>
        {sessions.length === 0 ? (
          <Text fontSize="sm" color={subtle}>Nenhuma sessão registrada.</Text>
        ) : (
          <VStack align="stretch" spacing={2}>
            {sessions.map(s => (
              <HStack key={s.id} justify="space-between" bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="md" px={3} py={2}>
                <HStack>
                  <Badge colorScheme={s.status === "aberta" ? "yellow" : s.status === "finalizada" ? "green" : "gray"}>{s.status}</Badge>
                  <Text fontSize="sm">#{s.id} · {new Date(s.created_at).toLocaleString("pt-BR")} · {s.items} item(ns)</Text>
                </HStack>
                <Button size="xs" variant="outline" onClick={() => openExisting(s.id)}>Abrir</Button>
              </HStack>
            ))}
          </VStack>
        )}
      </Box>
    );
  }

  const isOpen = active.status === "aberta";

  // ── Sessão aberta/visualização ──
  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={3}>
        <Box>
          <HStack>
            <Text fontSize="xl" fontWeight="bold">Inventário #{active.id}</Text>
            <Badge colorScheme={isOpen ? "yellow" : active.status === "finalizada" ? "green" : "gray"}>{active.status}</Badge>
          </HStack>
          <Text fontSize="sm" color={subtle}>{new Date(active.created_at).toLocaleString("pt-BR")}</Text>
        </Box>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => setActive(null)}>Voltar</Button>
          {isOpen && <Button size="sm" colorScheme="red" variant="outline" onClick={handleCancel}>Cancelar</Button>}
          {isOpen && <Button size="sm" colorScheme="green" isLoading={busy} onClick={handleFinalize}>Finalizar</Button>}
        </HStack>
      </Flex>

      {isOpen && (
        <Flex gap={4} direction={{ base: "column", lg: "row" }} align="start" mb={5}>
          {/* Scanner */}
          <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4} flex="1" minW={0} w="100%">
            <Text fontWeight="semibold" mb={2}>Bipar para contar (+1)</Text>
            <BarcodeScanner active onScan={handleScan} continuous />
          </Box>

          {/* Lançamento manual */}
          <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4} w={{ base: "100%", lg: "420px" }}>
            <Text fontWeight="semibold" mb={2}>Lançar contagem manual</Text>
            <InputGroup mb={3}>
              <InputLeftElement pointerEvents="none"><SearchIcon color={subtle} /></InputLeftElement>
              <Input placeholder="Buscar produto" value={search} onChange={e => setSearch(e.target.value)} />
            </InputGroup>
            <VStack align="stretch" spacing={2} maxH="320px" overflowY="auto">
              {filteredProducts.map(p => (
                <Box key={p.id}>
                  <Text fontSize="sm" fontWeight="semibold">{p.codigo} · {p.descricao}</Text>
                  <Flex gap={1} wrap="wrap" mt={1}>
                    {(p.variants || []).map(v => (
                      <HStack key={v.id} spacing={1} borderWidth="1px" borderColor={border} borderRadius="md" px={2} py={1}>
                        <Badge>{v.tamanho}</Badge>
                        <Text fontSize="xs" color={subtle}>cont: {countMap[v.id] ?? "—"}</Text>
                        <NumberInput size="xs" maxW="64px" min={0}
                          value={manualQty[v.id] ?? ""}
                          onChange={(s) => setManualQty(m => ({ ...m, [v.id]: s }))}>
                          <NumberInputField placeholder="qtd" px={2} />
                        </NumberInput>
                        <IconButton size="xs" aria-label="Lançar" icon={<AddIcon />}
                          onClick={() => { setCount(v.id, Number(manualQty[v.id]) || 0); setManualQty(m => ({ ...m, [v.id]: "" })); }} />
                      </HStack>
                    ))}
                  </Flex>
                </Box>
              ))}
            </VStack>
          </Box>
        </Flex>
      )}

      {/* Contagens da sessão */}
      <Text fontWeight="semibold" mb={2}>Itens contados</Text>
      {(active.counts || []).length === 0 ? (
        <Text fontSize="sm" color={subtle}>Nenhum item contado ainda.</Text>
      ) : (
        <Box overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Produto</Th><Th>Tam.</Th><Th isNumeric>Contado</Th>
                <Th isNumeric>{isOpen ? "Saldo atual" : "Saldo sistema"}</Th>
                <Th isNumeric>Diferença</Th>
                {isOpen && <Th></Th>}
              </Tr>
            </Thead>
            <Tbody>
              {active.counts.map(c => {
                const systemQty = isOpen ? c.current_balance : c.system_qty;
                const diff = isOpen ? (c.counted_qty - c.current_balance) : c.diff;
                return (
                  <Tr key={c.id}>
                    <Td>{c.product_codigo} · {c.descricao}</Td>
                    <Td>{c.tamanho}</Td>
                    <Td isNumeric>{c.counted_qty}</Td>
                    <Td isNumeric>{systemQty}</Td>
                    <Td isNumeric>
                      <Badge colorScheme={diff === 0 ? "gray" : diff > 0 ? "green" : "red"}>
                        {diff > 0 ? "+" : ""}{diff}
                      </Badge>
                    </Td>
                    {isOpen && (
                      <Td>
                        <IconButton size="xs" variant="ghost" colorScheme="red" aria-label="Remover" icon={<DeleteIcon />}
                          onClick={() => handleRemoveCount(c.variant_id)} />
                      </Td>
                    )}
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
