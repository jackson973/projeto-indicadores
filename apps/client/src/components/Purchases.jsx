import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Box, Flex, Text, Heading, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText,
  Table, Thead, Tbody, Tr, Th, Td, TableContainer, IconButton, Button, Badge,
  HStack, VStack, Input, InputGroup, InputLeftElement, Select, Spinner, Center,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, Textarea, Switch, Tooltip,
  useBreakpointValue, useDisclosure, useColorModeValue,
} from "@chakra-ui/react";
import { AddIcon, AttachmentIcon, DeleteIcon, SearchIcon, ChevronDownIcon, ChevronRightIcon, RepeatIcon } from "@chakra-ui/icons";
import useAppToast from "../hooks/useAppToast";
import { getSaoPauloDate } from "../utils/timezone";
import {
  fetchPurchases, fetchPurchase, fetchPurchasesMeta, checkPurchaseOrderNumber,
  parsePurchaseOrder, createPurchase, deletePurchase, fetchPurchaseFileUrl,
  fetchCashflowBoxes, fetchCashflowCategories, fetchSuppliers,
} from "../api";

const BRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = (iso) => { const s = String(iso || "").slice(0, 10).split("-"); return s.length === 3 ? `${s[2]}/${s[1]}` : ""; };
const fmtBRFull = (iso) => { const s = String(iso || "").slice(0, 10).split("-"); return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : ""; };
const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const addDays = (iso, n) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// "0 15 30" -> [0, 15, 30]
const parseTerms = (terms) => String(terms || "").trim().split(/[\s/,;]+/).map(Number).filter(n => Number.isFinite(n) && n >= 0);

// Parcelas iniciais pela condição: 0 = entrada sugerida HOJE (editável); N = emissão + N dias
function buildInstallments(terms, orderDate, total) {
  const days = parseTerms(terms);
  if (!days.length || !orderDate || !total) return [];
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / days.length);
  return days.map((n, i) => ({
    dueDate: n === 0 ? getSaoPauloDate() : addDays(orderDate, n),
    amount: (i === days.length - 1 ? cents - base * (days.length - 1) : base) / 100,
    locked: false,
    entrada: n === 0,
  }));
}

// Redistribui o saldo (total − parcelas editadas) igualmente entre as não editadas
function redistribute(parcels, total) {
  const lockedSum = parcels.filter(p => p.locked).reduce((s, p) => s + Math.round((Number(p.amount) || 0) * 100), 0);
  const unlocked = parcels.filter(p => !p.locked);
  if (!unlocked.length) return parcels;
  const saldo = Math.max(0, Math.round(Number(total) * 100) - lockedSum);
  const base = Math.floor(saldo / unlocked.length);
  let used = 0, seen = 0;
  return parcels.map(p => {
    if (p.locked) return p;
    seen += 1;
    const c = seen === unlocked.length ? saldo - used : base;
    used += c;
    return { ...p, amount: c / 100 };
  });
}

const currencyToNumber = (masked) => {
  const digits = String(masked).replace(/\D/g, "");
  return (parseInt(digits || "0", 10)) / 100;
};

// ─── Modal de nova compra / importação ───────────────────────────────────────
function PurchaseFormModal({ isOpen, onClose, prefill, boxes, categories, suppliers, lastCategoryId, onSaved }) {
  const [form, setForm] = useState({});
  const [items, setItems] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [createEntries, setCreateEntries] = useState(true);
  const [boxId, setBoxId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dupWarn, setDupWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useAppToast();
  const subtle = useColorModeValue("gray.500", "gray.400");
  const panelBg = useColorModeValue("gray.50", "gray.700");

  useEffect(() => {
    if (!isOpen) return;
    const p = prefill || {};
    const f = {
      orderNumber: p.order_number || "",
      supplierName: p.supplier_name || "",
      orderDate: p.order_date || getSaoPauloDate(),
      totalAmount: p.total_amount || 0,
      totalPieces: p.total_pieces || "",
      paymentTerms: p.payment_terms || "",
      obs: p.obs || "",
      fileToken: p.fileToken || null,
      fileName: p.fileName || null,
    };
    setForm(f);
    setItems((p.items || []).map(it => ({
      description: it.description || "", size: it.size || "", qty: it.qty || 0,
      unitPrice: it.unit_price || 0, total: it.total || 0, obs: it.obs || null,
    })));
    setParcels(buildInstallments(f.paymentTerms, f.orderDate, f.totalAmount));
    setCreateEntries(true);
    setBoxId(boxes[0] ? String(boxes[0].id) : "");
    setCategoryId(lastCategoryId ? String(lastCategoryId) : "");
    setDupWarn(false);
  }, [isOpen, prefill, boxes, lastCategoryId]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const checkDup = async () => {
    if (!form.orderNumber) return;
    try { setDupWarn((await checkPurchaseOrderNumber(form.orderNumber)).exists); } catch { /* silencioso */ }
  };

  const regen = (f = form) => setParcels(buildInstallments(f.paymentTerms, f.orderDate, f.totalAmount));

  const setParcelAmount = (idx, masked) => {
    setParcels(prev => redistribute(
      prev.map((p, i) => i === idx ? { ...p, amount: currencyToNumber(masked), locked: true } : p),
      form.totalAmount
    ));
  };
  const setParcelDate = (idx, date) => setParcels(prev => prev.map((p, i) => i === idx ? { ...p, dueDate: date } : p));
  const addParcel = () => setParcels(prev => redistribute(
    [...prev, { dueDate: addDays(prev[prev.length - 1]?.dueDate || form.orderDate, 30), amount: 0, locked: false }],
    form.totalAmount
  ));
  const removeParcel = (idx) => setParcels(prev => redistribute(prev.filter((_, i) => i !== idx), form.totalAmount));

  const setItem = (idx, field, value) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  const addItem = () => setItems(prev => [...prev, { description: "", size: "", qty: 0, unitPrice: 0, total: 0 }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const parcelsSum = parcels.reduce((s, p) => s + Math.round((Number(p.amount) || 0) * 100), 0);
  const sumOk = parcelsSum === Math.round((Number(form.totalAmount) || 0) * 100);

  const save = async () => {
    if (!form.orderNumber || !form.supplierName?.trim() || !form.orderDate || !form.totalAmount) {
      toast({ title: "Preencha nº do pedido, fornecedor, data e valor.", status: "warning", duration: 3500 });
      return;
    }
    if (createEntries) {
      if (!parcels.length) { toast({ title: "Gere as parcelas ou desligue o lançamento no fluxo.", status: "warning", duration: 3500 }); return; }
      if (!boxId || !categoryId) { toast({ title: "Escolha o caixa e a categoria das parcelas.", status: "warning", duration: 3500 }); return; }
      if (!sumOk && !window.confirm(`A soma das parcelas (${BRL(parcelsSum / 100)}) difere do valor do pedido (${BRL(form.totalAmount)}). Salvar mesmo assim?`)) return;
    }
    setSaving(true);
    try {
      await createPurchase({
        orderNumber: String(form.orderNumber).trim(),
        supplierName: form.supplierName.trim(),
        orderDate: form.orderDate,
        totalAmount: Number(form.totalAmount) || 0,
        totalPieces: form.totalPieces || null,
        paymentTerms: form.paymentTerms || null,
        obs: form.obs || null,
        items,
        installments: createEntries ? parcels.map(p => ({ dueDate: p.dueDate, amount: Number(p.amount) || 0 })) : [],
        createEntries,
        boxId: createEntries ? parseInt(boxId) : null,
        categoryId: createEntries ? parseInt(categoryId) : null,
        fileToken: form.fileToken,
        fileName: form.fileName,
      });
      toast({
        title: "Compra salva.",
        description: createEntries ? `${parcels.length} parcela(s) lançada(s) no fluxo de caixa como pendentes.` : undefined,
        status: "success", duration: 4500,
      });
      onClose();
      onSaved();
    } catch (err) {
      toast({ title: err.message || "Erro ao salvar compra.", status: "error", duration: 4000 });
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          Nova compra
          {form.fileName && <Badge colorScheme="green" ml={2} fontSize="xs"><AttachmentIcon boxSize={2.5} mr={1} />{form.fileName}</Badge>}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
            {/* Dados + itens */}
            <Box>
              <SimpleGrid columns={2} spacing={3}>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Nº do pedido</FormLabel>
                  <Input value={form.orderNumber || ""} onChange={e => set("orderNumber", e.target.value)} onBlur={checkDup} />
                  {dupWarn && <Text fontSize="xs" color="orange.500" mt={1}>Já existe compra com este nº de pedido.</Text>}
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Fornecedor</FormLabel>
                  <Input list="purchase-suppliers" value={form.supplierName || ""} onChange={e => set("supplierName", e.target.value)} />
                  <datalist id="purchase-suppliers">
                    {suppliers.map(s => <option key={s.id} value={s.name} />)}
                  </datalist>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Data de emissão</FormLabel>
                  <Input type="date" value={form.orderDate || ""} onChange={e => { set("orderDate", e.target.value); }} />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Valor total</FormLabel>
                  <Input
                    value={BRL(form.totalAmount)}
                    inputMode="numeric"
                    onChange={e => set("totalAmount", currencyToNumber(e.target.value))}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Cond. pagamento</FormLabel>
                  <Input placeholder="ex: 0 15 30" value={form.paymentTerms || ""} onChange={e => set("paymentTerms", e.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="sm">Total de peças</FormLabel>
                  <Input type="number" value={form.totalPieces || ""} onChange={e => set("totalPieces", e.target.value)} />
                </FormControl>
              </SimpleGrid>
              <FormControl mt={3}>
                <FormLabel fontSize="sm">Obs do pedido</FormLabel>
                <Textarea size="sm" rows={2} value={form.obs || ""} onChange={e => set("obs", e.target.value)} />
              </FormControl>

              <Flex align="center" justify="space-between" mt={4} mb={1}>
                <Text fontSize="sm" fontWeight="bold">Itens do pedido</Text>
                <Button size="xs" leftIcon={<AddIcon boxSize={2} />} variant="outline" onClick={addItem}>Item</Button>
              </Flex>
              {!items.length && <Text fontSize="xs" color={subtle}>Sem itens — opcional; o vínculo com produtos/estoque vem na próxima etapa.</Text>}
              <VStack align="stretch" spacing={2}>
                {items.map((it, i) => (
                  <Box key={i} borderWidth="1px" borderRadius="md" p={2}>
                    <Flex gap={2} align="center">
                      <Input size="sm" placeholder="Descrição" value={it.description} onChange={e => setItem(i, "description", e.target.value)} />
                      <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Remover item" onClick={() => removeItem(i)} />
                    </Flex>
                    <Flex gap={2} mt={2}>
                      <Input size="sm" w="80px" placeholder="Tam." title="Tamanho (uma linha por tamanho)" value={it.size || ""} onChange={e => setItem(i, "size", e.target.value.toUpperCase())} />
                      <Input size="sm" w="90px" type="number" placeholder="Qtde" value={it.qty || ""} onChange={e => setItem(i, "qty", parseInt(e.target.value) || 0)} />
                      <Input size="sm" flex="1" inputMode="numeric" title="Preço unitário" value={BRL(it.unitPrice)} onChange={e => setItem(i, "unitPrice", currencyToNumber(e.target.value))} />
                      <Input size="sm" flex="1" inputMode="numeric" title="Total do item" value={BRL(it.total)} onChange={e => setItem(i, "total", currencyToNumber(e.target.value))} />
                    </Flex>
                  </Box>
                ))}
              </VStack>
            </Box>

            {/* Parcelamento → fluxo de caixa */}
            <Box bg={panelBg} borderRadius="lg" p={4}>
              <Text fontSize="sm" fontWeight="bold" mb={3}>Parcelamento → Fluxo de caixa</Text>
              <FormControl display="flex" alignItems="center" mb={3}>
                <Switch isChecked={createEntries} onChange={e => setCreateEntries(e.target.checked)} colorScheme="green" mr={2} />
                <FormLabel fontSize="sm" mb={0}>Criar lançamentos no fluxo de caixa (pendentes)</FormLabel>
              </FormControl>

              {createEntries && (
                <>
                  <SimpleGrid columns={2} spacing={3} mb={3}>
                    <FormControl isRequired>
                      <FormLabel fontSize="sm">Caixa do Financeiro</FormLabel>
                      <Select size="sm" value={boxId} onChange={e => setBoxId(e.target.value)}>
                        {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </Select>
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel fontSize="sm">Categoria</FormLabel>
                      <Select size="sm" value={categoryId} onChange={e => setCategoryId(e.target.value)} placeholder="Escolha…">
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </FormControl>
                  </SimpleGrid>

                  <Flex align="center" gap={2} mb={2}>
                    <Text fontSize="sm" fontWeight="semibold">Parcelas: {parcels.length}</Text>
                    <Button size="xs" variant="outline" onClick={addParcel}>+</Button>
                    <Button size="xs" variant="outline" onClick={() => parcels.length && removeParcel(parcels.length - 1)} isDisabled={parcels.length <= 1}>−</Button>
                    <Tooltip label={`Regerar pela condição "${form.paymentTerms || "—"}"`} hasArrow>
                      <Button size="xs" variant="outline" leftIcon={<RepeatIcon />} ml="auto" onClick={() => regen()}>Recalcular</Button>
                    </Tooltip>
                  </Flex>

                  {!parcels.length && (
                    <Text fontSize="xs" color={subtle} mb={2}>
                      Informe a condição de pagamento (ex.: "0 15 30") e o valor — as parcelas são geradas sozinhas. "0" = entrada, sugerida para hoje.
                    </Text>
                  )}

                  <VStack align="stretch" spacing={2}>
                    {parcels.map((p, i) => (
                      <Flex key={i} align="center" gap={2}>
                        <Badge flexShrink={0} w="26px" textAlign="center">{i + 1}</Badge>
                        <Input size="sm" type="date" maxW="150px" value={p.dueDate} onChange={e => setParcelDate(i, e.target.value)} />
                        <Input size="sm" inputMode="numeric" value={BRL(p.amount)} onChange={e => setParcelAmount(i, e.target.value)}
                          borderColor={p.locked ? "orange.400" : undefined} />
                        {p.entrada && <Badge colorScheme="green" flexShrink={0}>entrada</Badge>}
                        {p.locked && <Badge colorScheme="orange" flexShrink={0}>editada</Badge>}
                        <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Remover parcela" onClick={() => removeParcel(i)} />
                      </Flex>
                    ))}
                  </VStack>

                  {parcels.length > 0 && (
                    <Flex justify="space-between" mt={3} p={2} borderRadius="md" fontSize="sm" fontWeight="bold"
                      bg={sumOk ? "green.100" : "orange.100"} color={sumOk ? "green.700" : "orange.700"}>
                      <span>Soma das parcelas</span>
                      <span>{BRL(parcelsSum / 100)} {sumOk ? "= pedido ✓" : `≠ pedido (${BRL(form.totalAmount)})`}</span>
                    </Flex>
                  )}

                  <Text fontSize="xs" color={subtle} mt={3}>
                    Editar o valor de uma parcela redistribui o saldo entre as demais.
                    Lançamentos entram como despesa pendente — o check com comprovante continua no Financeiro:
                    {parcels.length > 0 && form.orderNumber && (
                      <Text as="span" display="block" mt={1} fontStyle="italic">
                        "PEDIDO {form.orderNumber} EM {fmtBR(form.orderDate)} - {(form.supplierName || "").toUpperCase()} PARC 1/{parcels.length}"
                      </Text>
                    )}
                  </Text>
                </>
              )}
            </Box>
          </SimpleGrid>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>Cancelar</Button>
          <Button colorScheme="blue" onClick={save} isLoading={saving}>
            💾 Salvar compra{createEntries && parcels.length ? ` + ${parcels.length} parcela(s)` : ""}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Modal de detalhes ────────────────────────────────────────────────────────
function PurchaseDetailModal({ isOpen, onClose, purchaseId }) {
  const [data, setData] = useState(null);
  const toast = useAppToast();
  const subtle = useColorModeValue("gray.500", "gray.400");

  useEffect(() => {
    if (!isOpen || !purchaseId) { setData(null); return; }
    fetchPurchase(purchaseId).then(setData).catch(() => toast({ title: "Erro ao carregar compra.", status: "error", duration: 3000 }));
  }, [isOpen, purchaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPdf = async () => {
    try { window.open(await fetchPurchaseFileUrl(purchaseId), "_blank"); }
    catch (err) { toast({ title: err.message, status: "error", duration: 3000 }); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Pedido {data?.order_number} · {data?.supplier_name}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {!data ? <Center py={8}><Spinner /></Center> : (
            <>
              <SimpleGrid columns={2} spacing={2} fontSize="sm" mb={3}>
                <Text color={subtle}>Emissão</Text><Text fontWeight="medium">{fmtBRFull(data.order_date)}</Text>
                <Text color={subtle}>Valor total</Text><Text fontWeight="bold">{BRL(data.total_amount)}</Text>
                <Text color={subtle}>Cond. pagamento</Text><Text fontWeight="medium">{data.payment_terms || "—"}</Text>
                <Text color={subtle}>Total de peças</Text><Text fontWeight="medium">{data.total_pieces ?? "—"}</Text>
              </SimpleGrid>
              {data.obs && <Text fontSize="xs" color={subtle} mb={3}>Obs: {data.obs}</Text>}
              {data.file_path && (
                <Button size="xs" leftIcon={<AttachmentIcon />} variant="outline" colorScheme="teal" mb={4} onClick={openPdf}>
                  Ver cópia do pedido (PDF)
                </Button>
              )}

              {data.items?.length > 0 && (
                <>
                  <Text fontSize="sm" fontWeight="bold" mb={1}>Itens</Text>
                  <VStack align="stretch" spacing={1} mb={4}>
                    {data.items.map(it => (
                      <Box key={it.id} borderWidth="1px" borderRadius="md" p={2} fontSize="xs">
                        <Flex justify="space-between" gap={2} align="center">
                          <Text fontWeight="semibold">
                            {it.description}
                            {it.size && <Badge ml={2} fontSize="2xs">{it.size}</Badge>}
                          </Text>
                          <Text fontWeight="bold" flexShrink={0}>{BRL(it.total)}</Text>
                        </Flex>
                        <Text color={subtle}>{it.sizeGrid ? `${it.sizeGrid} · ` : ""}{it.qty} pç × {BRL(it.unitPrice)}</Text>
                        {it.obs && <Text color={subtle}>Obs: {it.obs}</Text>}
                      </Box>
                    ))}
                  </VStack>
                </>
              )}

              <Text fontSize="sm" fontWeight="bold" mb={1}>Parcelas</Text>
              {!data.installments?.length ? (
                <Text fontSize="xs" color={subtle}>Sem parcelas lançadas no fluxo de caixa.</Text>
              ) : (
                <VStack align="stretch" spacing={1}>
                  {data.installments.map(p => (
                    <Flex key={p.id} align="center" gap={2} borderWidth="1px" borderRadius="md" p={2} fontSize="sm">
                      <Badge>{p.seq}</Badge>
                      <Text>{fmtBRFull(p.dueDate)}</Text>
                      <Badge colorScheme={p.entryStatus === "ok" ? "green" : "orange"}>
                        {p.entryStatus === "ok" ? "paga" : "pendente"}
                      </Badge>
                      <Text ml="auto" fontWeight="bold">{BRL(p.amount)}</Text>
                    </Flex>
                  ))}
                </VStack>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter><Button onClick={onClose}>Fechar</Button></ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [lastCategoryId, setLastCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [prefill, setPrefill] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const fileRef = useRef(null);
  const formModal = useDisclosure();
  const detailModal = useDisclosure();
  const toast = useAppToast();

  const isMobile = useBreakpointValue({ base: true, md: false });
  const cardBg = useColorModeValue("white", "gray.800");
  const headerBg = useColorModeValue("gray.50", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, bx, cats, meta, sups] = await Promise.all([
        fetchPurchases(), fetchCashflowBoxes(), fetchCashflowCategories(),
        fetchPurchasesMeta().catch(() => ({})), fetchSuppliers().catch(() => []),
      ]);
      setPurchases(list); setBoxes(bx); setCategories(cats);
      setLastCategoryId(meta.lastCategoryId || null);
      setSuppliers(sups);
    } catch (err) {
      toast({ title: "Erro ao carregar compras.", description: err.message, status: "error", duration: 4000 });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return purchases;
    const t = search.trim().toLowerCase();
    return purchases.filter(p =>
      String(p.orderNumber).toLowerCase().includes(t) ||
      (p.supplierName || "").toLowerCase().includes(t) ||
      BRL(p.totalAmount).includes(t)
    );
  }, [purchases, search]);

  // Agrupa por mês da emissão (mais recente primeiro)
  const months = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = String(p.orderDate).slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, list]) => {
      const [y, m] = key.split("-");
      return { key, label: `${MONTH_NAMES[parseInt(m) - 1]} ${y}`, list, total: list.reduce((s, p) => s + p.totalAmount, 0) };
    });
  }, [filtered]);

  // KPIs do mês corrente
  const kpis = useMemo(() => {
    const nowKey = getSaoPauloDate().slice(0, 7);
    const doMes = purchases.filter(p => String(p.orderDate).slice(0, 7) === nowKey);
    let aPagarMes = 0, aPagarMesQ = 0, emAberto = 0, emAbertoQ = 0;
    const porFornecedor = {};
    purchases.forEach(p => {
      (p.installments || []).forEach(i => {
        if (i.status !== "ok") {
          emAberto += Number(i.amount) || 0; emAbertoQ += 1;
          if (String(i.dueDate).slice(0, 7) === nowKey) { aPagarMes += Number(i.amount) || 0; aPagarMesQ += 1; }
        }
      });
    });
    doMes.forEach(p => { porFornecedor[p.supplierName] = (porFornecedor[p.supplierName] || 0) + p.totalAmount; });
    const totalMes = doMes.reduce((s, p) => s + p.totalAmount, 0);
    const top = Object.entries(porFornecedor).sort((a, b) => b[1] - a[1])[0];
    return {
      totalMes, pedidosMes: doMes.length,
      aPagarMes, aPagarMesQ, emAberto, emAbertoQ,
      topFornecedor: top ? top[0] : "—",
      topPct: top && totalMes ? Math.round(top[1] / totalMes * 100) : 0,
    };
  }, [purchases]);

  const handleImportFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const parsed = await parsePurchaseOrder(file);
      setPrefill(parsed);
      formModal.onOpen();
      if (parsed.order_number) {
        try {
          const dup = await checkPurchaseOrderNumber(parsed.order_number);
          if (dup.exists) toast({ title: `Atenção: o pedido ${parsed.order_number} já está cadastrado.`, status: "warning", duration: 5000 });
        } catch { /* aviso opcional */ }
      }
    } catch (err) {
      toast({ title: err.message || "Não consegui ler o PDF.", description: "Abra 'Nova compra' e preencha manualmente.", status: "error", duration: 5000 });
    } finally { setImporting(false); }
  };

  const handleDelete = async (p) => {
    const pend = p.installmentsCount - p.installmentsPaid;
    if (!window.confirm(`Excluir a compra ${p.orderNumber} (${p.supplierName})?${pend > 0 ? ` As ${pend} parcela(s) pendente(s) saem do fluxo de caixa.` : ""}`)) return;
    try {
      await deletePurchase(p.id);
      toast({ title: "Compra excluída.", status: "success", duration: 3000 });
      load();
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir.", status: "error", duration: 5000 });
    }
  };

  const openDetail = (id) => { setDetailId(id); detailModal.onOpen(); };

  const ParcelBadge = ({ p }) => (
    <Badge colorScheme={p.installmentsCount === 0 ? "gray" : p.installmentsPaid >= p.installmentsCount ? "green" : "orange"} fontSize="xs">
      {p.installmentsCount === 0 ? "sem parcelas" : `${p.installmentsPaid}/${p.installmentsCount} pagas`}
    </Badge>
  );

  if (loading && !purchases.length) return <Center py={20}><Spinner size="xl" color="blue.500" /></Center>;

  return (
    <Box>
      <Flex align="center" justify="space-between" mb={1} wrap="wrap" gap={2}>
        <Box>
          <Heading size="md">Compras</Heading>
          <Text fontSize="sm" color={subtle}>Pedidos de fornecedores, mês a mês — parcelas integradas ao fluxo de caixa.</Text>
        </Box>
        <HStack spacing={2}>
          <input ref={fileRef} type="file" accept="application/pdf" hidden
            onChange={e => { handleImportFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button size="sm" variant="outline" colorScheme="blue" leftIcon={<AttachmentIcon />}
            isLoading={importing} loadingText="Lendo PDF…" onClick={() => fileRef.current?.click()}>
            Importar cópia de pedido
          </Button>
          <Button size="sm" colorScheme="blue" leftIcon={<AddIcon />} onClick={() => { setPrefill(null); formModal.onOpen(); }}>
            Nova compra
          </Button>
        </HStack>
      </Flex>

      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} my={4}>
        <Stat bg={cardBg} borderWidth="1px" borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Compras no mês</StatLabel>
          <StatNumber fontSize="lg">{BRL(kpis.totalMes)}</StatNumber>
          <StatHelpText fontSize="xs" mb={0}>{kpis.pedidosMes} pedido(s)</StatHelpText>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">A pagar no mês</StatLabel>
          <StatNumber fontSize="lg" color="red.500">{BRL(kpis.aPagarMes)}</StatNumber>
          <StatHelpText fontSize="xs" mb={0}>{kpis.aPagarMesQ} parcela(s)</StatHelpText>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Parcelas em aberto</StatLabel>
          <StatNumber fontSize="lg">{BRL(kpis.emAberto)}</StatNumber>
          <StatHelpText fontSize="xs" mb={0}>{kpis.emAbertoQ} parcela(s)</StatHelpText>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Fornecedor top</StatLabel>
          <StatNumber fontSize="md" noOfLines={1}>{kpis.topFornecedor}</StatNumber>
          <StatHelpText fontSize="xs" mb={0}>{kpis.topPct}% do valor no mês</StatHelpText>
        </Stat>
      </SimpleGrid>

      <InputGroup size="sm" maxW={{ md: "330px" }} mb={4}>
        <InputLeftElement pointerEvents="none"><SearchIcon color="gray.400" /></InputLeftElement>
        <Input placeholder="Buscar pedido, fornecedor, valor…" value={search} onChange={e => setSearch(e.target.value)} borderRadius="md" />
      </InputGroup>

      {!months.length && (
        <Box bg={cardBg} borderWidth="1px" borderRadius="lg" py={10} textAlign="center">
          <Text color={subtle} fontSize="sm">Nenhuma compra cadastrada ainda. Importe uma cópia de pedido para começar.</Text>
        </Box>
      )}

      {months.map(m => {
        const isCollapsed = !!collapsed[m.key];
        return (
          <Box key={m.key} mb={4}>
            <Flex align="center" gap={2} py={2} cursor="pointer" onClick={() => setCollapsed(prev => ({ ...prev, [m.key]: !isCollapsed }))}>
              {isCollapsed ? <ChevronRightIcon color="gray.400" /> : <ChevronDownIcon color="gray.400" />}
              <Text fontWeight="bold">{m.label}</Text>
              <Text fontSize="xs" color={subtle}>· {m.list.length} compra(s)</Text>
              <Text ml="auto" fontSize="sm" fontWeight="bold" color="red.500">{BRL(m.total)}</Text>
            </Flex>
            {!isCollapsed && (isMobile ? (
              <VStack align="stretch" spacing={2}>
                {m.list.map(p => (
                  <Box key={p.id} bg={cardBg} borderWidth="1px" borderRadius="lg" p={3} onClick={() => openDetail(p.id)} cursor="pointer">
                    <Flex align="center" gap={2}>
                      <Text fontSize="sm" fontWeight="bold" flex={1} noOfLines={1}>
                        {p.supplierName} · {p.orderNumber} {p.hasFile && <AttachmentIcon boxSize={3} color="gray.400" />}
                      </Text>
                      <Text fontSize="sm" fontWeight="bold" color="red.500" flexShrink={0}>{BRL(p.totalAmount)}</Text>
                    </Flex>
                    <Flex align="center" gap={2} mt={2} wrap="wrap" fontSize="xs" color={subtle}>
                      <span>{fmtBR(p.orderDate)}</span>
                      {p.paymentTerms && <Badge colorScheme="blue" fontSize="2xs">{p.paymentTerms.replace(/\s+/g, "/")}</Badge>}
                      <ParcelBadge p={p} />
                      {p.boxName && <Badge colorScheme="purple" fontSize="2xs">{p.boxName}</Badge>}
                      <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" ml="auto"
                        onClick={e => { e.stopPropagation(); handleDelete(p); }} />
                    </Flex>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Box bg={cardBg} borderWidth="1px" borderRadius="lg" overflow="hidden">
                <TableContainer>
                  <Table size="sm">
                    <Thead>
                      <Tr bg={headerBg}>
                        <Th>Data</Th><Th>Pedido</Th><Th>Fornecedor</Th>
                        <Th isNumeric>Peças</Th><Th isNumeric>Valor</Th>
                        <Th>Cond. pgto</Th><Th>Parcelas</Th><Th>Caixa</Th><Th w="60px"></Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {m.list.map(p => (
                        <Tr key={p.id} _hover={{ bg: headerBg }} cursor="pointer" onClick={() => openDetail(p.id)}>
                          <Td fontSize="sm">{fmtBR(p.orderDate)}</Td>
                          <Td fontSize="sm" fontWeight="bold">
                            {p.orderNumber}{" "}
                            {p.hasFile && (
                              <Tooltip label="Cópia do pedido anexada" hasArrow>
                                <AttachmentIcon boxSize={3} color="gray.400" />
                              </Tooltip>
                            )}
                          </Td>
                          <Td fontSize="sm">{p.supplierName}</Td>
                          <Td isNumeric fontSize="sm">{p.totalPieces ? p.totalPieces.toLocaleString("pt-BR") : "—"}</Td>
                          <Td isNumeric fontSize="sm" fontWeight="semibold" color="red.500">{BRL(p.totalAmount)}</Td>
                          <Td>{p.paymentTerms ? <Badge colorScheme="blue" fontSize="xs">{p.paymentTerms.replace(/\s+/g, "/")}</Badge> : "—"}</Td>
                          <Td><ParcelBadge p={p} /></Td>
                          <Td>{p.boxName ? <Badge colorScheme="purple" fontSize="xs">{p.boxName}</Badge> : "—"}</Td>
                          <Td textAlign="right" onClick={e => e.stopPropagation()}>
                            <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(p)} />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              </Box>
            ))}
          </Box>
        );
      })}

      <PurchaseFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.onClose}
        prefill={prefill}
        boxes={boxes}
        categories={categories}
        suppliers={suppliers}
        lastCategoryId={lastCategoryId}
        onSaved={load}
      />
      <PurchaseDetailModal isOpen={detailModal.isOpen} onClose={detailModal.onClose} purchaseId={detailId} />
    </Box>
  );
}
