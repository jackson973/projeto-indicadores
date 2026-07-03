import { useEffect, useState, useCallback } from "react";
import {
  Badge, Box, Button, Flex, Input, Select, Spinner, Table, Tbody, Td, Th, Thead, Tr,
  Text, useColorModeValue,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import {
  fetchFeeBands, createFeeBand, updateFeeBand, deleteFeeBand,
  fetchPricingStores, updateStore, syncPricingLojas,
} from "../api";

const MPS = [
  { key: "mercadolivre", label: "Mercado Livre" },
  { key: "shopee", label: "Shopee" },
  { key: "shein", label: "Shein" },
  { key: "tiktok", label: "TikTok" },
];
const num = (v) => (v === "" || v == null ? null : Number(v));

export default function ChannelsFees() {
  const [bands, setBands] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  const subtle = useColorModeValue("gray.500", "gray.400");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([fetchFeeBands(), fetchPricingStores()]);
      setBands(b); setStores(s);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const patchBand = (id, field, value) => setBands(bs => bs.map(b => b.id === id ? { ...b, [field]: value } : b));

  const saveBand = async (b) => {
    try {
      await updateFeeBand(b.id, {
        price_min: num(b.price_min) ?? 0, price_max: num(b.price_max),
        commission_pct: num(b.commission_pct) ?? 0, fixed_per_sale: num(b.fixed_per_sale) ?? 0,
      });
      toast({ status: "success", title: "Faixa salva" });
    } catch (e) { toast({ status: "error", title: "Erro ao salvar", description: e.message }); }
  };
  const addBand = async (mp) => {
    try { await createFeeBand({ marketplace: mp, price_min: 0, price_max: null, commission_pct: 0, fixed_per_sale: 0 }); load(); }
    catch (e) { toast({ status: "error", title: "Erro ao adicionar", description: e.message }); }
  };
  const removeBand = async (id) => {
    if (!window.confirm("Excluir esta faixa?")) return;
    try { await deleteFeeBand(id); load(); }
    catch (e) { toast({ status: "error", title: "Erro ao excluir", description: e.message }); }
  };

  const patchStore = (id, field, value) => setStores(ss => ss.map(s => s.id === id ? { ...s, [field]: value } : s));
  const saveStore = async (s) => {
    try { await updateStore(s.id, { marketplace: s.platform || null, nf_pct: num(s.nf_pct) ?? 0 }); toast({ status: "success", title: "Loja salva" }); }
    catch (e) { toast({ status: "error", title: "Erro ao salvar loja", description: e.message }); }
  };
  const syncLojas = async () => {
    try { const r = await syncPricingLojas(); toast({ status: "success", title: "Lojas sincronizadas", description: `${r.created} nova(s); ${r.total} no total.` }); load(); }
    catch (e) { toast({ status: "error", title: "Erro ao sincronizar", description: e.message }); }
  };

  if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Canais & Taxas</Text>
      <Text fontSize="sm" color={subtle} mb={4}>
        Faixas de preço por marketplace (comissão % + taxa fixa por venda) e a NF (imposto) de cada loja/CNPJ.
      </Text>

      {MPS.map(mp => {
        const rows = bands.filter(b => b.marketplace === mp.key);
        return (
          <Box key={mp.key} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4} mb={4}>
            <Flex align="center" mb={2}>
              <Text fontWeight="semibold"><Badge colorScheme="blue" mr={2}>{mp.label}</Badge>por faixa de preço do kit</Text>
              <Button size="xs" colorScheme="blue" ml="auto" onClick={() => addBand(mp.key)}>+ Faixa</Button>
            </Flex>
            <Box overflowX="auto">
              <Table size="sm">
                <Thead><Tr><Th isNumeric>Preço mín.</Th><Th isNumeric>Preço máx. (vazio = sem teto)</Th><Th isNumeric>Comissão %</Th><Th isNumeric>Taxa fixa/venda</Th><Th isNumeric>Ações</Th></Tr></Thead>
                <Tbody>
                  {!rows.length ? (
                    <Tr><Td colSpan={5}><Text fontSize="sm" color={subtle}>Sem faixas.</Text></Td></Tr>
                  ) : rows.map(b => (
                    <Tr key={b.id}>
                      <Td isNumeric><Input size="sm" type="number" step="0.01" textAlign="right" value={b.price_min ?? ""} onChange={e => patchBand(b.id, "price_min", e.target.value)} /></Td>
                      <Td isNumeric><Input size="sm" type="number" step="0.01" textAlign="right" placeholder="—" value={b.price_max ?? ""} onChange={e => patchBand(b.id, "price_max", e.target.value)} /></Td>
                      <Td isNumeric><Input size="sm" type="number" step="0.1" textAlign="right" value={b.commission_pct ?? ""} onChange={e => patchBand(b.id, "commission_pct", e.target.value)} /></Td>
                      <Td isNumeric><Input size="sm" type="number" step="0.01" textAlign="right" value={b.fixed_per_sale ?? ""} onChange={e => patchBand(b.id, "fixed_per_sale", e.target.value)} /></Td>
                      <Td isNumeric>
                        <Button size="xs" colorScheme="blue" variant="outline" mr={2} onClick={() => saveBand(b)}>Salvar</Button>
                        <Button size="xs" colorScheme="red" variant="outline" onClick={() => removeBand(b.id)}>Excluir</Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Box>
        );
      })}

      <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={4}>
        <Flex align="center" mb={2}>
          <Box>
            <Text fontWeight="semibold">Lojas (marketplace + NF)</Text>
            <Text fontSize="xs" color={subtle}>As lojas vêm das vendas. Defina o marketplace (para casar com as faixas) e a NF (imposto) de cada uma.</Text>
          </Box>
          <Button size="sm" colorScheme="blue" ml="auto" onClick={syncLojas}>↻ Sincronizar lojas das vendas</Button>
        </Flex>
        <Box overflowX="auto">
          <Table size="sm">
            <Thead><Tr><Th>Loja</Th><Th>Marketplace</Th><Th isNumeric>NF %</Th><Th isNumeric>Ações</Th></Tr></Thead>
            <Tbody>
              {!stores.length ? (
                <Tr><Td colSpan={4}><Text fontSize="sm" color={subtle}>Nenhuma loja. Clique em "Sincronizar lojas das vendas".</Text></Td></Tr>
              ) : stores.map(s => (
                <Tr key={s.id}>
                  <Td>{s.name}</Td>
                  <Td>
                    <Select size="sm" maxW="170px" placeholder="— definir —" value={s.platform || ""} onChange={e => patchStore(s.id, "platform", e.target.value)}>
                      {MPS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </Select>
                  </Td>
                  <Td isNumeric><Input size="sm" maxW="110px" ml="auto" type="number" step="0.1" textAlign="right" value={s.nf_pct ?? ""} onChange={e => patchStore(s.id, "nf_pct", e.target.value)} /></Td>
                  <Td isNumeric><Button size="xs" colorScheme="blue" variant="outline" onClick={() => saveStore(s)}>Salvar</Button></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}
