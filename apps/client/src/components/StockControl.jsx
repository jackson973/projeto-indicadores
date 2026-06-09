import { useEffect, useState, useCallback } from "react";
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  NumberInput,
  NumberInputField,
  Select,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import BarcodeScanner from "./BarcodeScanner";
import useAppToast from "../hooks/useAppToast";
import { fetchStockReasons, scanStockBarcode, createStockMovement } from "../api";

export default function StockControl() {
  const [tipo, setTipo] = useState("saida"); // operação mais comum no dia a dia
  const [reasons, setReasons] = useState([]);
  const [reasonId, setReasonId] = useState("");
  const [qty, setQty] = useState(1);
  const [recent, setRecent] = useState([]);
  const toast = useAppToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");

  useEffect(() => {
    fetchStockReasons().then(setReasons).catch(e =>
      toast({ status: "error", title: "Erro ao carregar motivos", description: e.message }));
  }, [toast]);

  // Reseta o motivo ao trocar a direção (entrada/saída)
  useEffect(() => { setReasonId(""); }, [tipo]);

  const reasonsForTipo = reasons.filter(r => r.direcao === tipo);

  const handleScan = useCallback(async (code) => {
    try {
      const v = await scanStockBarcode(code); // { variant_id, tamanho, product_codigo, descricao, balance, ... }
      const mov = await createStockMovement({
        variant_id: v.variant_id,
        tipo,
        qty: Number(qty) || 1,
        reason_id: reasonId || null,
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
      return {
        status: "success",
        message: `${v.product_codigo} ${v.tamanho} · ${mov.qty > 0 ? "+" : ""}${mov.qty} → saldo ${mov.resulting_balance}`,
      };
    } catch (e) {
      return { status: "error", message: e.message || "Erro" };
    }
  }, [tipo, qty, reasonId]);

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

          <FormControl mb={1}>
            <FormLabel fontSize="sm">Quantidade por bipagem</FormLabel>
            <NumberInput min={1} value={qty} onChange={(_, n) => setQty(Number.isNaN(n) ? 1 : n)}>
              <NumberInputField />
            </NumberInput>
          </FormControl>
        </Box>

        {/* Scanner */}
        <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4} flex="1" minW={0} w="100%">
          <BarcodeScanner active onScan={handleScan} continuous />
        </Box>
      </Flex>

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
