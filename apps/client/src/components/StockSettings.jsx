import { useEffect, useState, useCallback } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  Select,
  SimpleGrid,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon } from "@chakra-ui/icons";
import useAppToast from "../hooks/useAppToast";
import {
  fetchStockReasons,
  createStockReason,
  deleteStockReason,
} from "../api";

export default function StockSettings() {
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [direcao, setDirecao] = useState("entrada");
  const [saving, setSaving] = useState(false);
  const toast = useAppToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReasons(await fetchStockReasons());
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar motivos", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!nome.trim()) { toast({ status: "warning", title: "Informe o nome do motivo" }); return; }
    setSaving(true);
    try {
      await createStockReason({ nome: nome.trim(), direcao });
      setNome("");
      toast({ status: "success", title: "Motivo adicionado" });
      load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao adicionar", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r) {
    if (!window.confirm(`Inativar o motivo "${r.nome}"?`)) return;
    try {
      await deleteStockReason(r.id);
      load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao inativar", description: e.message });
    }
  }

  const entradas = reasons.filter(r => r.direcao === "entrada");
  const saidas = reasons.filter(r => r.direcao === "saida");

  const Column = ({ title, color, items }) => (
    <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4}>
      <HStack mb={3}>
        <Badge colorScheme={color}>{title}</Badge>
        <Text fontSize="sm" color={subtle}>{items.length} motivo(s)</Text>
      </HStack>
      {items.length === 0 ? (
        <Text fontSize="sm" color={subtle}>Nenhum motivo.</Text>
      ) : (
        <VStack align="stretch" spacing={2}>
          {items.map(r => (
            <HStack key={r.id} justify="space-between" borderWidth="1px" borderColor={border} borderRadius="md" px={3} py={2}>
              <Text fontSize="sm">{r.nome}</Text>
              <IconButton size="xs" variant="ghost" colorScheme="red" icon={<DeleteIcon />} aria-label="Inativar" onClick={() => handleDelete(r)} />
            </HStack>
          ))}
        </VStack>
      )}
    </Box>
  );

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Configuração — Estoque</Text>
      <Text fontSize="sm" color={subtle} mb={4}>
        Motivos de movimentação usados ao lançar entradas e saídas. O estoque mínimo é definido por produto, no cadastro.
      </Text>

      <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4} mb={4}>
        <Text fontWeight="semibold" mb={2}>Novo motivo</Text>
        <Flex gap={2} wrap="wrap" align="center">
          <Input maxW="280px" placeholder="ex: Compra, Perda, Ajuste..." value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} />
          <Select maxW="160px" value={direcao} onChange={e => setDirecao(e.target.value)}>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </Select>
          <Button leftIcon={<AddIcon />} colorScheme="blue" isLoading={saving} onClick={handleAdd}>Adicionar</Button>
        </Flex>
      </Box>

      {loading ? (
        <Flex justify="center" py={10}><Spinner /></Flex>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <Column title="ENTRADAS" color="green" items={entradas} />
          <Column title="SAÍDAS" color="red" items={saidas} />
        </SimpleGrid>
      )}
    </Box>
  );
}
