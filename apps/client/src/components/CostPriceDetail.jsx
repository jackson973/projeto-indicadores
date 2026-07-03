import { useEffect, useState, useCallback } from "react";
import {
  Badge, Box, Button, Flex, FormControl, FormLabel, Input, Select, Spinner, Table,
  Tbody, Td, Th, Thead, Tr, Text, useColorModeValue, useDisclosure, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, SimpleGrid, Stat,
  StatLabel, StatNumber,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import {
  fetchStockProduct, updateStockProduct, fetchProductCosts, createProductCost,
  updateProductCost, deleteProductCost, fetchSuppliers,
  fetchProductPrices, upsertProductPrice,
} from "../api";

const MPLABEL = { mercadolivre: "Mercado Livre", shopee: "Shopee", shein: "Shein", tiktok: "TikTok" };

const BRL = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
// Máscara de moeda (dígitos → centavos). Exibe "0,00"; guarda número.
const fmtMoney = (n) => (n === "" || n == null) ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoney = (str) => { const d = String(str).replace(/\D/g, ""); return d === "" ? "" : parseInt(d, 10) / 100; };

function weightedAvg(variants = []) {
  let bal = 0, val = 0;
  variants.forEach(v => { const b = Number(v.balance) || 0; if (b > 0) { bal += b; val += b * (Number(v.avg_cost) || 0); } });
  return bal > 0 ? val / bal : 0;
}

const emptyCost = () => ({ supplier_id: "", cost: "", valid_from: new Date().toISOString().slice(0, 10), valid_until: "", note: "" });

export default function CostPriceDetail({ productId, onBack }) {
  const [product, setProduct] = useState(null);
  const [costs, setCosts] = useState([]);
  const [prices, setPrices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kit, setKit] = useState(1);
  const [draft, setDraft] = useState(emptyCost());
  const [editing, setEditing] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useAppToast();

  const subtle = useColorModeValue("gray.500", "gray.400");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [p, c, s, pr] = await Promise.all([fetchStockProduct(productId), fetchProductCosts(productId), fetchSuppliers(), fetchProductPrices(productId)]);
      // Pré-preenche o preço da loja com o "preço de venda atual" do cadastro do produto (unitário), quando a loja ainda não tem preço próprio.
      const sug = p?.sale_price == null ? null : Number(p.sale_price);
      const prices = pr.map(r => {
        const semPreco = r.price_id == null || r.unit_price == null || r.unit_price === "";
        return {
          ...r,
          kit_qty: r.kit_qty ?? (p?.default_kit_qty || 1),
          unit_price: semPreco ? (sug ?? "") : r.unit_price,
          _suggested: semPreco && sug != null,   // veio do cadastro, ainda não salvo p/ esta loja
        };
      });
      setProduct(p); setCosts(c); setSuppliers(s); setPrices(prices); setKit(p?.default_kit_qty || 1);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => { load(); }, [load]);

  const saveKit = async () => {
    try {
      await updateStockProduct(productId, { default_kit_qty: Number(kit) || 1 });
      toast({ status: "success", title: "Kit padrão salvo" });
    } catch (e) {
      toast({ status: "error", title: "Erro ao salvar kit", description: e.message });
    }
  };

  const patchPrice = (storeId, field, value) => setPrices(ps => ps.map(p => p.store_id === storeId ? { ...p, [field]: value, _suggested: field === "unit_price" ? false : p._suggested } : p));
  const savePrice = async (row) => {
    try {
      await upsertProductPrice(productId, row.store_id, {
        unit_price: Number(row.unit_price) || 0,
        kit_qty: Number(row.kit_qty) || 1,
        frete_type: row.frete_type || "none",
        frete_value: Number(row.frete_value) || 0,
      });
      // Não recarrega a página (preserva a rolagem) — só marca a linha como salva.
      setPrices(ps => ps.map(p => p.store_id === row.store_id ? { ...p, _suggested: false } : p));
      toast({ status: "success", title: "Preço salvo" });
    } catch (e) { toast({ status: "error", title: "Erro ao salvar preço", description: e.message }); }
  };

  const suggestedCost = () => {
    if (product?.initial_cost != null && product.initial_cost !== "") return Number(product.initial_cost);
    const a = weightedAvg(product?.variants || []);
    return a > 0 ? a : "";
  };
  const openNew = () => { setEditing(null); setDraft({ ...emptyCost(), cost: suggestedCost() }); onOpen(); };
  const openEdit = (c) => {
    setEditing(c);
    setDraft({ supplier_id: c.supplier_id || "", cost: c.cost == null ? "" : Number(c.cost), valid_from: c.valid_from?.slice(0, 10) || "", valid_until: c.valid_until?.slice(0, 10) || "", note: c.note || "" });
    onOpen();
  };
  const saveCost = async () => {
    try {
      const payload = { ...draft, supplier_id: draft.supplier_id || null, valid_until: draft.valid_until || null };
      if (editing) await updateProductCost(editing.id, payload);
      else await createProductCost(productId, payload);
      onClose();
      toast({ status: "success", title: "Custo salvo" });
      load(true);
    } catch (e) {
      toast({ status: "error", title: "Erro ao salvar custo", description: e.message });
    }
  };
  const removeCost = async (c) => {
    if (!window.confirm("Excluir este custo?")) return;
    try { await deleteProductCost(c.id); load(true); }
    catch (e) { toast({ status: "error", title: "Erro ao excluir", description: e.message }); }
  };

  if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;
  if (!product) return <Text>Produto não encontrado. <Button size="sm" onClick={onBack}>Voltar</Button></Text>;

  const variants = product.variants || [];
  const saldo = variants.reduce((s, v) => s + (Number(v.balance) || 0), 0);
  const avg = weightedAvg(variants);
  const today = new Date().toISOString().slice(0, 10);
  const isVigente = (c) => (!c.valid_until || c.valid_until.slice(0, 10) >= today) && c.valid_from.slice(0, 10) <= today;

  return (
    <Box>
      <Flex align="center" gap={3} mb={4} wrap="wrap">
        <Button size="sm" variant="outline" onClick={onBack}>← Lista</Button>
        <Box>
          <Text fontWeight="bold" fontSize="lg">{product.codigo} · {product.descricao}</Text>
          <Text fontSize="xs" color={subtle}>Grade: {variants.map(v => v.tamanho).join(", ") || "—"} · Saldo total: {saldo} pç</Text>
        </Box>
        <Box ml="auto" textAlign="right">
          <Text fontSize="xs" color={subtle}>CUSTO MÉDIO (ponderado)</Text>
          <Text fontSize="xl" fontWeight="bold">{BRL(avg)}</Text>
          <Badge colorScheme="purple">média móvel · por peça</Badge>
        </Box>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mb={5}>
        <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
          <Flex align="end" gap={2}>
            <FormControl maxW="140px">
              <FormLabel fontSize="xs" mb={1}>Kit padrão (peças/venda)</FormLabel>
              <Input type="number" min={1} value={kit} onChange={e => setKit(e.target.value)} size="sm" />
            </FormControl>
            <Button size="sm" colorScheme="blue" onClick={saveKit}>Salvar</Button>
          </Flex>
        </Box>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Saldo total</StatLabel><StatNumber fontSize="lg">{saldo}</StatNumber>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Valor a custo</StatLabel><StatNumber fontSize="lg">{BRL(avg * saldo)}</StatNumber>
        </Stat>
      </SimpleGrid>

      {/* Custos por fornecedor */}
      <Flex align="center" mb={2}>
        <Box>
          <Text fontWeight="semibold">Custos por fornecedor</Text>
          <Text fontSize="xs" color={subtle}>Histórico por vigência. Pré-preenche o custo na entrada.</Text>
        </Box>
        <Button size="sm" colorScheme="blue" ml="auto" onClick={openNew}>+ Novo custo</Button>
      </Flex>
      <Box overflowX="auto" mb={5}>
        <Table size="sm">
          <Thead><Tr><Th>Fornecedor</Th><Th isNumeric>Custo/pç</Th><Th>Vigência</Th><Th>Status</Th><Th>Obs.</Th><Th isNumeric>Ações</Th></Tr></Thead>
          <Tbody>
            {!costs.length ? (
              <Tr><Td colSpan={6}><Text fontSize="sm" color={subtle}>Nenhum custo cadastrado.</Text></Td></Tr>
            ) : costs.map(c => (
              <Tr key={c.id}>
                <Td>{c.supplier_name || "—"}</Td>
                <Td isNumeric>{BRL(c.cost)}</Td>
                <Td>{c.valid_from?.slice(0, 10)} → {c.valid_until ? c.valid_until.slice(0, 10) : "aberto"}</Td>
                <Td><Badge colorScheme={isVigente(c) ? "green" : "gray"}>{isVigente(c) ? "Vigente" : "Encerrado"}</Badge></Td>
                <Td color={subtle} fontSize="xs">{c.note || "—"}</Td>
                <Td isNumeric>
                  <Button size="xs" variant="outline" mr={2} onClick={() => openEdit(c)}>Editar</Button>
                  <Button size="xs" variant="outline" colorScheme="red" onClick={() => removeCost(c)}>Excluir</Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      {/* Custo médio por variante */}
      <Text fontWeight="semibold" mb={2}>Custo médio por tamanho</Text>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr><Th>Tam.</Th><Th isNumeric>Saldo</Th><Th isNumeric>Custo médio</Th><Th isNumeric>Valor a custo</Th></Tr></Thead>
          <Tbody>
            {variants.map(v => (
              <Tr key={v.id}>
                <Td>{v.tamanho}</Td>
                <Td isNumeric>{v.balance}</Td>
                <Td isNumeric>{BRL(v.avg_cost)}</Td>
                <Td isNumeric>{BRL((Number(v.avg_cost) || 0) * (Number(v.balance) || 0))}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      {/* Preço de venda por loja */}
      <Text fontWeight="semibold" mt={6} mb={1}>Preço de venda por loja</Text>
      <Text fontSize="xs" color={subtle} mb={2}>
        Cada loja (conta num marketplace) tem seu preço/kit/frete. Preço do kit = preço unit. × kit.
        O preço já vem <b>sugerido</b> do <b>preço de venda atual do cadastro do produto</b> ({product.sale_price == null ? "não definido" : BRL(product.sale_price)}/pç) — ajuste por loja e clique Salvar para gravar o preço próprio da loja.
      </Text>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr><Th>Loja</Th><Th>MP</Th><Th isNumeric>Preço unit./pç</Th><Th isNumeric>Kit</Th><Th>Frete</Th><Th isNumeric>Valor frete</Th><Th isNumeric>Preço kit</Th><Th isNumeric>Ações</Th></Tr></Thead>
          <Tbody>
            {!prices.length ? (
              <Tr><Td colSpan={8}><Text fontSize="sm" color={subtle}>Nenhuma loja. Vá em Canais & Taxas → "Sincronizar lojas das vendas" e defina o marketplace de cada uma.</Text></Td></Tr>
            ) : prices.map(row => {
              const up = Number(row.unit_price) || 0;
              const kq = Number(row.kit_qty) || (product.default_kit_qty || 1);
              return (
                <Tr key={row.store_id}>
                  <Td>{row.store_name}</Td>
                  <Td><Badge colorScheme="blue">{MPLABEL[row.platform] || row.platform}</Badge></Td>
                  <Td isNumeric>
                    <Input size="sm" maxW="100px" ml="auto" type="number" step="0.01" textAlign="right"
                      borderColor={row._suggested ? "blue.300" : undefined}
                      value={row.unit_price ?? ""} onChange={e => patchPrice(row.store_id, "unit_price", e.target.value)} />
                    {row._suggested && <Text fontSize="10px" color="blue.400" mt="2px">sugerido</Text>}
                  </Td>
                  <Td isNumeric><Input size="sm" maxW="70px" ml="auto" type="number" min={1} textAlign="right" value={row.kit_qty ?? (product.default_kit_qty || 1)} onChange={e => patchPrice(row.store_id, "kit_qty", e.target.value)} /></Td>
                  <Td>
                    <Select size="sm" minW="110px" value={row.frete_type || "none"} onChange={e => patchPrice(row.store_id, "frete_type", e.target.value)}>
                      <option value="none">Sem frete</option>
                      <option value="pct">% do preço</option>
                      <option value="fix">Valor fixo</option>
                    </Select>
                  </Td>
                  <Td isNumeric><Input size="sm" maxW="90px" ml="auto" type="number" step="0.01" textAlign="right" value={row.frete_value ?? ""} onChange={e => patchPrice(row.store_id, "frete_value", e.target.value)} isDisabled={(row.frete_type || "none") === "none"} /></Td>
                  <Td isNumeric>{BRL(up * kq)}</Td>
                  <Td isNumeric><Button size="xs" colorScheme="blue" variant="outline" onClick={() => savePrice(row)}>Salvar</Button></Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? "Editar custo" : "Novo custo"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb={3}>
              <FormLabel fontSize="sm">Fornecedor</FormLabel>
              <Select placeholder="— selecione —" value={draft.supplier_id} onChange={e => setDraft(d => ({ ...d, supplier_id: e.target.value }))}>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FormControl>
            <FormControl mb={3} isRequired>
              <FormLabel fontSize="sm">Custo por peça (R$)</FormLabel>
              <Input inputMode="numeric" placeholder="0,00" value={fmtMoney(draft.cost)}
                onChange={e => setDraft(d => ({ ...d, cost: parseMoney(e.target.value) }))} />
              <Text fontSize="xs" color={subtle} mt={1}>
                {product?.initial_cost != null && product.initial_cost !== ""
                  ? <>Sugerido do <b>preço de compra inicial</b> do produto ({BRL(product.initial_cost)}/pç).</>
                  : <>Sugerido do <b>custo médio</b> atual ({BRL(weightedAvg(product?.variants || []))}/pç).</>}
              </Text>
            </FormControl>
            <SimpleGrid columns={2} spacing={3} mb={3}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Vigência (de)</FormLabel>
                <Input type="date" value={draft.valid_from} onChange={e => setDraft(d => ({ ...d, valid_from: e.target.value }))} />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Até (opcional)</FormLabel>
                <Input type="date" value={draft.valid_until} onChange={e => setDraft(d => ({ ...d, valid_until: e.target.value }))} />
              </FormControl>
            </SimpleGrid>
            <FormControl>
              <FormLabel fontSize="sm">Observação</FormLabel>
              <Input value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>Cancelar</Button>
            <Button colorScheme="blue" onClick={saveCost} isDisabled={draft.cost === "" || !draft.valid_from}>Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
