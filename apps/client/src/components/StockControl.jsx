import { useEffect, useState, useCallback, useRef } from "react";
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Select,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";
import BarcodeScanner from "./BarcodeScanner";
import useAppToast from "../hooks/useAppToast";
import {
  fetchStockReasons, scanStockBarcode, createStockMovement, fetchSuppliers, fetchStockProducts,
} from "../api";

export default function StockControl() {
  const [tipo, setTipo] = useState("saida"); // operação mais comum no dia a dia
  const [reasons, setReasons] = useState([]);
  const [reasonId, setReasonId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [recent, setRecent] = useState([]);
  const toast = useAppToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");

  useEffect(() => {
    fetchStockReasons().then(setReasons).catch(e =>
      toast({ status: "error", title: "Erro ao carregar motivos", description: e.message }));
    fetchSuppliers().then(setSuppliers).catch(() => {});
  }, [toast]);

  // Reseta motivo/custo ao trocar a direção (entrada/saída)
  useEffect(() => { setReasonId(""); setUnitCost(""); setSupplierId(""); }, [tipo]);

  const reasonsForTipo = reasons.filter(r => r.direcao === tipo);

  // Registra o movimento para uma variante (usado pela bipagem E pela busca manual)
  const applyMovement = useCallback(async (v) => {
    const supplierName = tipo === "entrada" && supplierId
      ? (suppliers.find(s => String(s.id) === String(supplierId))?.name || null)
      : null;
    const mov = await createStockMovement({
      variant_id: v.variant_id,
      tipo,
      qty: Number(qty) || 1,
      reason_id: reasonId || null,
      unit_cost: tipo === "entrada" && unitCost !== "" ? Number(unitCost) : null,
      note: supplierName ? `Fornecedor: ${supplierName}` : null,
    });
    const entry = {
      key: `${mov.id}`,
      descricao: v.descricao,
      tamanho: v.tamanho,
      product_codigo: v.product_codigo,
      delta: mov.qty,
      balance: mov.resulting_balance,
      at: new Date(),
    };
    setRecent(r => [entry, ...r].slice(0, 30));
    return mov;
  }, [tipo, qty, reasonId, unitCost, supplierId, suppliers]);

  const handleScan = useCallback(async (code) => {
    try {
      const v = await scanStockBarcode(code); // { variant_id, tamanho, product_codigo, descricao, balance, ... }
      const mov = await applyMovement(v);
      return {
        status: "success",
        message: `${v.product_codigo} ${v.tamanho} · ${mov.qty > 0 ? "+" : ""}${mov.qty} → saldo ${mov.resulting_balance}`,
      };
    } catch (e) {
      return { status: "error", message: e.message || "Erro" };
    }
  }, [applyMovement]);

  // ─── Busca manual (lupa sem código): produto/cor + tamanho ────────────────
  const manualModal = useDisclosure();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [applyingVariant, setApplyingVariant] = useState(null);
  const termRef = useRef("");
  termRef.current = term;

  useEffect(() => {
    if (!manualModal.isOpen) return;
    const q = term.trim();
    const timer = setTimeout(() => {
      setSearching(true);
      fetchStockProducts({ search: q })
        .then((list) => { if (termRef.current.trim() === q) setResults(list); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [term, manualModal.isOpen]);

  const handleManualPick = async (product, variant) => {
    setApplyingVariant(variant.id);
    try {
      const mov = await applyMovement({
        variant_id: variant.id,
        tamanho: variant.tamanho,
        product_codigo: product.codigo,
        descricao: product.descricao,
      });
      // Atualiza o saldo exibido no modal sem refazer a busca
      setResults(rs => rs.map(p => p.id !== product.id ? p : {
        ...p,
        variants: p.variants.map(vv => vv.id === variant.id ? { ...vv, balance: mov.resulting_balance } : vv),
      }));
      toast({
        status: "success",
        title: `${product.codigo} ${variant.tamanho} · ${mov.qty > 0 ? "+" : ""}${mov.qty} → saldo ${mov.resulting_balance}`,
      });
    } catch (e) {
      toast({ status: "error", title: "Erro ao registrar", description: e.message });
    } finally {
      setApplyingVariant(null);
    }
  };

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Controle de Estoque</Text>
      <Text fontSize="sm" color={subtle} mb={4}>
        Bipe os produtos para registrar entradas e saídas. Cada leitura aplica a quantidade abaixo.
      </Text>

      <Flex gap={4} direction={{ base: "column", lg: "row" }} align="start">
        {/* Painel de controle */}
        <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4} w={{ base: "100%", lg: "340px" }}>
          <FormControl mb={3}>
            <FormLabel fontSize="sm">Operação</FormLabel>
            <ButtonGroup isAttached w="100%">
              <Button flex="1" colorScheme={tipo === "entrada" ? "green" : "gray"}
                variant={tipo === "entrada" ? "solid" : "outline"} onClick={() => setTipo("entrada")}>
                Entrada
              </Button>
              <Button flex="1" colorScheme={tipo === "saida" ? "red" : "gray"}
                variant={tipo === "saida" ? "solid" : "outline"} onClick={() => setTipo("saida")}>
                Saída
              </Button>
            </ButtonGroup>
          </FormControl>

          <FormControl mb={3}>
            <FormLabel fontSize="sm">Motivo</FormLabel>
            <Select placeholder="Sem motivo" value={reasonId} onChange={e => setReasonId(e.target.value)}>
              {reasonsForTipo.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </Select>
          </FormControl>

          <FormControl mb={3}>
            <FormLabel fontSize="sm">Quantidade por bipagem</FormLabel>
            <NumberInput min={1} value={qty} onChange={(_, n) => setQty(Number.isNaN(n) ? 1 : n)}>
              <NumberInputField />
            </NumberInput>
          </FormControl>

          {tipo === "entrada" && (
            <>
              <FormControl mb={3}>
                <FormLabel fontSize="sm">Custo unitário (R$/pç)</FormLabel>
                <NumberInput min={0} precision={2} value={unitCost} onChange={(s) => setUnitCost(s)}>
                  <NumberInputField placeholder="opcional — recalcula o custo médio" />
                </NumberInput>
              </FormControl>
              <FormControl mb={1}>
                <FormLabel fontSize="sm">Fornecedor</FormLabel>
                <Select placeholder="— opcional —" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </FormControl>
            </>
          )}
        </Box>

        {/* Scanner */}
        <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4} flex="1" minW={0} w="100%">
          <BarcodeScanner
            active
            onScan={handleScan}
            continuous
            onManualSearch={() => { setTerm(""); setResults([]); manualModal.onOpen(); }}
          />
          <Text fontSize="xs" color={subtle} mt={2} textAlign="center">
            Sem código de barras? Clique na lupa com o campo vazio para buscar por produto e tamanho.
          </Text>
        </Box>
      </Flex>

      {/* Busca manual: produto/cor + tamanho, sem bipar */}
      <Modal isOpen={manualModal.isOpen} onClose={manualModal.onClose} size="2xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {tipo === "entrada" ? "Entrada" : "Saída"} manual — buscar produto
            <Text fontSize="sm" fontWeight="normal" color={subtle}>
              Clique no tamanho para aplicar {tipo === "entrada" ? "+" : "−"}{Number(qty) || 1} por clique
              (mesmo motivo{tipo === "entrada" ? ", custo e fornecedor" : ""} do painel).
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5}>
            <InputGroup mb={3}>
              <InputLeftElement pointerEvents="none"><SearchIcon color={subtle} /></InputLeftElement>
              <Input
                autoFocus
                placeholder="Código ou descrição (produto, cor...)"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </InputGroup>

            {searching && <Flex justify="center" py={4}><Spinner size="sm" /></Flex>}

            {!searching && results.length === 0 && (
              <Text fontSize="sm" color={subtle} textAlign="center" py={4}>
                Nenhum produto encontrado.
              </Text>
            )}

            <VStack align="stretch" spacing={3}>
              {results.map((p) => (
                <Box key={p.id} borderWidth="1px" borderColor={border} borderRadius="md" p={3}>
                  <Text fontSize="sm" fontWeight="semibold" mb={2}>
                    {p.codigo} · {p.descricao}
                    {p.familia && <Badge ml={2} variant="subtle">{p.familia}</Badge>}
                  </Text>
                  <Flex gap={2} wrap="wrap">
                    {(p.variants || []).map((v) => (
                      <Button
                        key={v.id}
                        size="sm"
                        variant="outline"
                        colorScheme={tipo === "entrada" ? "green" : "red"}
                        isLoading={applyingVariant === v.id}
                        onClick={() => handleManualPick(p, v)}
                      >
                        <VStack spacing={0}>
                          <Text>{v.tamanho}</Text>
                          <Text fontSize="10px" fontWeight="normal">saldo {v.balance}</Text>
                        </VStack>
                      </Button>
                    ))}
                    {(p.variants || []).length === 0 && (
                      <Text fontSize="xs" color={subtle}>Sem grade cadastrada.</Text>
                    )}
                  </Flex>
                </Box>
              ))}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Bipagens desta sessão (conferência ao vivo; não é o histórico — veja Relatórios) */}
      <Box mt={5}>
        <Text fontWeight="semibold" mb={2}>Bipagens desta sessão</Text>
        {recent.length === 0 ? (
          <Text fontSize="sm" color={subtle}>Nenhuma bipagem ainda nesta sessão.</Text>
        ) : (
          <VStack align="stretch" spacing={2}>
            {recent.map(m => (
              <HStack key={m.key} justify="space-between" bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="md" px={3} py={2}>
                <Box minW={0}>
                  <Text fontSize="sm" noOfLines={1}>{m.product_codigo} · {m.descricao} <Badge ml={1}>{m.tamanho}</Badge></Text>
                  <Text fontSize="xs" color={subtle}>{m.at.toLocaleTimeString("pt-BR")}</Text>
                </Box>
                <HStack spacing={3}>
                  <Badge colorScheme={m.delta > 0 ? "green" : "red"}>{m.delta > 0 ? "+" : ""}{m.delta}</Badge>
                  <Text fontSize="sm" fontWeight="bold">saldo {m.balance}</Text>
                </HStack>
              </HStack>
            ))}
          </VStack>
        )}
      </Box>
    </Box>
  );
}
