import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box, Button, Flex, Input, Spinner, Table, Tbody, Td, Th, Thead, Tr, Tfoot,
  Text, useColorModeValue,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import { fetchStockProducts, applyStockOpeningCost } from "../api";

const BRL = (n) => (!n ? "R$ 0,00" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

export default function StockOpeningCost() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [costs, setCosts] = useState({}); // product_id -> string
  const toast = useAppToast();

  const subtle = useColorModeValue("gray.500", "gray.400");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchStockProducts({});
      setProducts(rows.map(p => ({
        ...p,
        saldo: (p.variants || []).reduce((s, v) => s + (Number(v.balance) || 0), 0),
      })));
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar produtos", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => products.reduce((s, p) => {
    const c = Number(costs[p.id]) || 0;
    return s + c * p.saldo;
  }, 0), [products, costs]);

  const save = async () => {
    // Aplica o custo informado a TODAS as variantes de cada produto preenchido
    const items = [];
    for (const p of products) {
      const c = costs[p.id];
      if (c == null || c === "" || isNaN(Number(c))) continue;
      for (const v of (p.variants || [])) items.push({ variant_id: v.id, unit_cost: Number(c) });
    }
    if (!items.length) { toast({ status: "warning", title: "Informe ao menos um custo" }); return; }
    if (!window.confirm(`Aplicar custo de abertura a ${items.length} variante(s)? Isso define o custo médio inicial.`)) return;
    setSaving(true);
    try {
      const res = await applyStockOpeningCost(items);
      toast({ status: "success", title: "Custo de abertura aplicado", description: `${res.count} variante(s) atualizada(s).` });
      setCosts({});
      load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao aplicar", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Custo de abertura</Text>
      <Text fontSize="sm" color={subtle} mb={4}>
        Passo único na virada: informe o custo unitário inicial por produto para semear o custo médio do estoque que já existe.
        O custo é aplicado a todas as variantes do produto e não altera o saldo.
      </Text>

      {loading ? (
        <Flex justify="center" py={10}><Spinner /></Flex>
      ) : (
        <>
          <Flex mb={3}>
            <Button colorScheme="blue" ml="auto" onClick={save} isLoading={saving}>Salvar abertura</Button>
          </Flex>
          <Box overflowX="auto">
            <Table size="sm">
              <Thead><Tr><Th>Produto</Th><Th isNumeric>Saldo</Th><Th isNumeric>Custo unit. inicial</Th><Th isNumeric>Valor de abertura</Th></Tr></Thead>
              <Tbody>
                {products.map(p => {
                  const c = Number(costs[p.id]) || 0;
                  return (
                    <Tr key={p.id}>
                      <Td>{p.codigo} · {p.descricao}</Td>
                      <Td isNumeric>{p.saldo}</Td>
                      <Td isNumeric>
                        <Input
                          type="number" step="0.01" size="sm" maxW="120px" textAlign="right" ml="auto"
                          placeholder="0,00"
                          isDisabled={p.saldo <= 0}
                          value={costs[p.id] ?? ""}
                          onChange={e => setCosts(s => ({ ...s, [p.id]: e.target.value }))}
                        />
                      </Td>
                      <Td isNumeric>{p.saldo > 0 && c ? BRL(c * p.saldo) : "—"}</Td>
                    </Tr>
                  );
                })}
              </Tbody>
              <Tfoot><Tr><Th>Total</Th><Th isNumeric>{products.reduce((s, p) => s + p.saldo, 0)}</Th><Th /><Th isNumeric>{BRL(total)}</Th></Tr></Tfoot>
            </Table>
          </Box>
        </>
      )}
    </Box>
  );
}
