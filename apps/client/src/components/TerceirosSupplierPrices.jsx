import { useState, useEffect, useMemo } from "react";
import {
  Box,
  VStack,
  HStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Input,
  Select,
  Button,
  IconButton,
  useToast,
  useColorModeValue,
  useBreakpointValue,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Badge,
  Text,
  Flex,
  Spinner,
  Center,
  Divider
} from "@chakra-ui/react";
import { AddIcon, EditIcon, DeleteIcon, ChevronDownIcon, ChevronRightIcon, TimeIcon, CloseIcon } from "@chakra-ui/icons";
import {
  fetchTerceirosSupplierPrices,
  createTerceirosSupplierPrice,
  createTerceirosSupplierPricesBatch,
  updateTerceirosSupplierPrice,
  deleteTerceirosSupplierPrice,
  fetchTerceirosSuppliers,
  fetchTerceirosProductGroups,
  fetchTerceirosParts
} from "../api";
const formatPrice = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(Number(value || 0));
import SearchableSelect from "./SearchableSelect";

const emptyForm = {
  codcli: "",
  groupId: "",
  part: "",
  price: 0,
  validFrom: "",
  validUntil: ""
};

const formatBRL = (v) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const TerceirosSupplierPrices = () => {
  const [prices, setPrices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  // Single edit modal
  const [editingPrice, setEditingPrice] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [modalParts, setModalParts] = useState([]);
  const [loadingParts, setLoadingParts] = useState(false);

  // Bulk create modal
  const [bulkForm, setBulkForm] = useState({ codcli: "", groupId: "", validFrom: "", validUntil: "" });
  const [bulkParts, setBulkParts] = useState([]);
  const [loadingBulkParts, setLoadingBulkParts] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [savingBulk, setSavingBulk] = useState(false);

  // Track which groups are expanded to show history
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const modal = useDisclosure();
  const bulkModal = useDisclosure();
  const toast = useToast();

  const isMobile = useBreakpointValue({ base: true, md: false });
  const panelBg = useColorModeValue("white", "gray.800");
  const headerBg = useColorModeValue("gray.50", "gray.700");
  const historyBg = useColorModeValue("gray.50", "gray.750");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  // ── Load reference data on mount ──────────────────────────────────────────
  useEffect(() => {
    const loadRefs = async () => {
      try {
        const [suppData, grpData] = await Promise.all([
          fetchTerceirosSuppliers(),
          fetchTerceirosProductGroups()
        ]);
        setSuppliers(suppData);
        setGroups(grpData);
      } catch (err) {
        toast({ title: "Erro ao carregar dados de referência.", status: "error", duration: 3000 });
      }
    };
    loadRefs();
  }, []);

  // ── Load prices when filters change ───────────────────────────────────────
  const loadPrices = async () => {
    setLoading(true);
    try {
      const data = await fetchTerceirosSupplierPrices(filterSupplier, filterGroup);
      setPrices(data);
    } catch (err) {
      toast({ title: "Erro ao carregar preços.", status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();
    // Auto-expand when filtering by specific supplier
    if (filterSupplier) {
      setExpandedSuppliers(new Set([filterSupplier]));
    }
  }, [filterSupplier, filterGroup]);

  // ── Load parts dynamically in single edit modal ───────────────────────────
  useEffect(() => {
    if (!form.codcli || !form.groupId) {
      setModalParts([]);
      return;
    }
    const loadModalParts = async () => {
      setLoadingParts(true);
      try {
        const data = await fetchTerceirosParts(form.codcli, form.groupId);
        setModalParts(data);
      } catch {
        setModalParts([]);
      } finally {
        setLoadingParts(false);
      }
    };
    loadModalParts();
  }, [form.codcli, form.groupId]);

  // ── Load parts dynamically in bulk modal and auto-populate grid ────────────
  useEffect(() => {
    if (!bulkForm.groupId) {
      setBulkParts([]);
      setBulkRows([]);
      return;
    }
    const load = async () => {
      setLoadingBulkParts(true);
      try {
        // First try with supplier+group, then fallback to group only
        let data = await fetchTerceirosParts(bulkForm.codcli, bulkForm.groupId);
        if (data.length === 0 && bulkForm.codcli) {
          data = await fetchTerceirosParts(null, bulkForm.groupId);
        }
        setBulkParts(data);
        if (data.length > 0) {
          setBulkRows(data.map((p) => ({ part: p.code, partLabel: `${p.code}${p.name ? ` - ${p.name}` : ""}`, price: 0, _key: p.code })));
        } else {
          setBulkRows([{ part: "", partLabel: "Todas", price: 0, _key: "all" }]);
        }
      } catch {
        setBulkParts([]);
        setBulkRows([{ part: "", partLabel: "Todas", price: 0, _key: "all" }]);
      } finally {
        setLoadingBulkParts(false);
      }
    };
    load();
  }, [bulkForm.codcli, bulkForm.groupId]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const supplierLabel = (codcli) => {
    const s = suppliers.find((x) => String(x.codcli) === String(codcli));
    return s ? s.nome : codcli;
  };

  const groupLabel = (id) => {
    const g = groups.find((x) => String(x.id) === String(id));
    return g ? g.name : id;
  };

  const isExpired = (validUntil) => {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date(new Date().toISOString().slice(0, 10));
  };

  const isActive = (validFrom, validUntil) => {
    const today = new Date().toISOString().slice(0, 10);
    const fromOk = !validFrom || validFrom <= today;
    const untilOk = !validUntil || validUntil >= today;
    return fromOk && untilOk;
  };

  const formatDate = (value) => {
    if (!value || value === "null") return "-";
    const str = typeof value === "string" ? value.slice(0, 10) : "";
    if (!str || str.length < 10) return "-";
    const d = new Date(str + "T00:00:00");
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR");
  };

  const vigenciaLabel = (vFrom, vUntil) => {
    const from = formatDate(vFrom);
    const until = formatDate(vUntil);
    if (from === "-" && until === "-") return "Sem vigencia";
    if (from === "-") return `Ate ${until}`;
    if (until === "-") return `A partir de ${from}`;
    return `${from} a ${until}`;
  };

  // ── Group prices by supplier+group+part for history view ──────────────────
  const groupedPrices = useMemo(() => {
    const map = new Map();
    prices.forEach((row) => {
      const key = `${row.codcli}|${row.groupId || row.group_id}|${row.part || ""}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          codcli: row.codcli,
          supplierName: row.supplierName || row.supplier_name,
          groupId: row.groupId || row.group_id,
          groupName: row.groupName || row.group_name,
          part: row.part,
          entries: []
        });
      }
      map.get(key).entries.push(row);
    });
    map.forEach((group) => {
      group.entries.sort((a, b) => {
        const aFrom = a.validFrom || a.valid_from || "";
        const bFrom = b.validFrom || b.valid_from || "";
        if (!aFrom && bFrom) return -1;
        if (aFrom && !bFrom) return 1;
        return bFrom.localeCompare(aFrom);
      });
      group.current = group.entries.find((e) => isActive(e.validFrom || e.valid_from, e.validUntil || e.valid_until)) || group.entries[0];
      group.historyCount = group.entries.length - 1;
    });
    return Array.from(map.values()).sort((a, b) => {
      const nameA = (a.supplierName || "").toLowerCase();
      const nameB = (b.supplierName || "").toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      const groupA = (a.groupName || "").toLowerCase();
      const groupB = (b.groupName || "").toLowerCase();
      return groupA.localeCompare(groupB);
    });
  }, [prices]);

  // ── Group by supplier for accordion ────────────────────────────────────────
  const supplierGroups = useMemo(() => {
    const map = new Map();
    groupedPrices.forEach((gp) => {
      const sKey = String(gp.codcli);
      if (!map.has(sKey)) {
        map.set(sKey, {
          codcli: gp.codcli,
          supplierName: gp.supplierName,
          items: []
        });
      }
      map.get(sKey).items.push(gp);
    });
    return Array.from(map.values());
  }, [groupedPrices]);

  const [expandedSuppliers, setExpandedSuppliers] = useState(new Set());

  const toggleSupplier = (codcli) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(codcli)) next.delete(codcli);
      else next.add(codcli);
      return next;
    });
  };

  // ── Expand/collapse history ────────────────────────────────────────────────
  const toggleExpand = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Currency input handler ────────────────────────────────────────────────
  const handleCurrencyChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    const mils = parseInt(digits || "0", 10);
    setForm({ ...form, price: mils / 1000 });
  };

  const parseCurrencyInput = (raw) => {
    const digits = raw.replace(/\D/g, "");
    return parseInt(digits || "0", 10) / 1000;
  };

  // ── Single edit modal open helpers ────────────────────────────────────────
  const openEdit = (row) => {
    setEditingPrice(row);
    setForm({
      codcli: String(row.codcli || ""),
      groupId: String(row.groupId || row.group_id || ""),
      part: row.part || "",
      price: Number(row.price) || 0,
      validFrom: toDateInput(row.validFrom || row.valid_from),
      validUntil: toDateInput(row.validUntil || row.valid_until)
    });
    modal.onOpen();
  };

  const toDateInput = (val) => {
    if (!val) return "";
    return String(val).slice(0, 10);
  };

  // ── Bulk modal open ───────────────────────────────────────────────────────
  const openBulkCreate = () => {
    const year = new Date().getFullYear();
    setBulkForm({
      codcli: filterSupplier || "",
      groupId: filterGroup || "",
      validFrom: `${year}-01-01`,
      validUntil: `${year}-12-31`
    });
    // Grid will auto-populate via the useEffect when codcli+groupId are set
    setBulkRows([]);
    bulkModal.onOpen();
  };

  const updateBulkRowPrice = (index, rawValue) => {
    const price = parseCurrencyInput(rawValue);
    setBulkRows((prev) => prev.map((row, i) => (i === index ? { ...row, price } : row)));
  };

  const applyPriceToAll = () => {
    if (bulkRows.length === 0) return;
    const firstPrice = bulkRows[0].price;
    if (firstPrice <= 0) return;
    setBulkRows((prev) => prev.map((row) => ({ ...row, price: row.price > 0 ? row.price : firstPrice })));
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.codcli || !form.groupId) {
      toast({ title: "Fornecedor e Grupo são obrigatórios.", status: "warning", duration: 3000 });
      return;
    }
    if (form.price <= 0) {
      toast({ title: "Informe um preço válido.", status: "warning", duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      const supplier = suppliers.find((s) => String(s.codcli) === String(form.codcli));
      const payload = {
        codcli: form.codcli,
        supplierName: supplier?.nome || "",
        groupId: form.groupId,
        part: form.part || null,
        price: form.price,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null
      };
      if (editingPrice) {
        await updateTerceirosSupplierPrice(editingPrice.id, payload);
        toast({ title: "Preço atualizado.", status: "success", duration: 3000 });
      } else {
        await createTerceirosSupplierPrice(payload);
        toast({ title: "Preço criado.", status: "success", duration: 3000 });
      }
      modal.onClose();
      await loadPrices();
    } catch (err) {
      toast({ title: err.message || "Erro ao salvar preço.", status: "error", duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSave = async () => {
    if (!bulkForm.codcli || !bulkForm.groupId) {
      toast({ title: "Fornecedor e Grupo são obrigatórios.", status: "warning", duration: 3000 });
      return;
    }
    const validRows = bulkRows.filter((r) => r.price > 0);
    if (validRows.length === 0) {
      toast({ title: "Informe pelo menos um preço.", status: "warning", duration: 3000 });
      return;
    }
    setSavingBulk(true);
    try {
      const supplier = suppliers.find((s) => String(s.codcli) === String(bulkForm.codcli));
      const items = validRows.map((r) => ({
        codcli: bulkForm.codcli,
        supplierName: supplier?.nome || "",
        groupId: bulkForm.groupId,
        part: r.part || null,
        price: r.price,
        validFrom: bulkForm.validFrom || null,
        validUntil: bulkForm.validUntil || null
      }));
      const result = await createTerceirosSupplierPricesBatch(items);
      const created = result.created?.length || 0;
      const errors = result.errors || [];
      if (errors.length > 0) {
        toast({
          title: `${created} criado(s), ${errors.length} erro(s)`,
          description: errors.map((e) => `${e.part}: ${e.error}`).join("; "),
          status: errors.length === items.length ? "error" : "warning",
          duration: 8000,
          isClosable: true
        });
      } else {
        toast({ title: `${created} preço(s) criado(s).`, status: "success", duration: 3000 });
      }
      if (created > 0) {
        bulkModal.onClose();
        await loadPrices();
      }
    } catch (err) {
      toast({ title: err.message || "Erro ao salvar preços.", status: "error", duration: 5000 });
    } finally {
      setSavingBulk(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Excluir este preço?`)) return;
    try {
      await deleteTerceirosSupplierPrice(row.id);
      toast({ title: "Preço excluído.", status: "success", duration: 3000 });
      await loadPrices();
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir preço.", status: "error", duration: 5000 });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const FiltersBar = isMobile ? (
    <VStack spacing={3} mb={4} align="stretch">
      <Select
        placeholder="Todos os fornecedores"
        value={filterSupplier}
        onChange={(e) => setFilterSupplier(e.target.value)}
        size="sm"
      >
        {suppliers.map((s) => (
          <option key={s.codcli} value={s.codcli}>{s.codcli} - {s.nome || s.codcli}</option>
        ))}
      </Select>
      <Select
        placeholder="Todos os grupos"
        value={filterGroup}
        onChange={(e) => setFilterGroup(e.target.value)}
        size="sm"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </Select>
      <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm" onClick={openBulkCreate} w="100%">
        Novo Preço
      </Button>
    </VStack>
  ) : (
    <Flex justify="space-between" align="center" mb={4} gap={3} wrap="wrap">
      <HStack spacing={3} flex={1}>
        <Select
          placeholder="Todos os fornecedores"
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          size="sm"
          maxW="280px"
        >
          {suppliers.map((s) => (
            <option key={s.codcli} value={s.codcli}>{s.codcli} - {s.nome || s.codcli}</option>
          ))}
        </Select>
        <Select
          placeholder="Todos os grupos"
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          size="sm"
          maxW="240px"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
      </HStack>
      <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm" onClick={openBulkCreate} flexShrink={0}>
        Novo Preço
      </Button>
    </Flex>
  );

  return (
    <Box className="panel" bg={panelBg} p={{ base: 3, md: 6 }} borderRadius="lg" boxShadow="sm" maxW="1100px" mx="auto" mt={{ base: 2, md: 8 }}>
      <Text fontSize="lg" fontWeight="bold" mb={4}>Preços por Fornecedor</Text>

      {FiltersBar}

      {loading ? (
        <Center py={10}>
          <Spinner />
        </Center>
      ) : groupedPrices.length === 0 ? (
        <Center py={10}>
          <Text color="gray.500">Nenhum preço encontrado.</Text>
        </Center>
      ) : isMobile ? (
        /* ── Mobile: cards ── */
        <VStack spacing={3} align="stretch">
          {groupedPrices.map((group) => {
            const current = group.current;
            const vFrom = current.validFrom || current.valid_from;
            const vUntil = current.validUntil || current.valid_until;
            const active = isActive(vFrom, vUntil);
            const expanded = expandedGroups.has(group.key);
            const history = group.entries.filter((e) => e.id !== current.id);

            return (
              <Box key={group.key} borderWidth="1px" borderColor={borderColor} borderRadius="md" overflow="hidden">
                <Box p={3}>
                  <Flex justify="space-between" align="flex-start" mb={1}>
                    <Box flex={1} minW={0}>
                      <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
                        {group.supplierName || supplierLabel(group.codcli)}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {group.groupName || groupLabel(group.groupId)}
                        {group.part ? ` · ${group.part}` : ""}
                      </Text>
                    </Box>
                    <HStack spacing={1} ml={2} flexShrink={0}>
                      <IconButton icon={<EditIcon />} size="xs" variant="ghost" aria-label="Editar" onClick={() => openEdit(current)} />
                      <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(current)} />
                    </HStack>
                  </Flex>
                  <Flex justify="space-between" align="center">
                    <Box>
                      <Text fontSize="xs" color="gray.500">Preço atual</Text>
                      <Text fontSize="lg" fontWeight="bold" color="blue.600">{formatPrice(current.price)}</Text>
                    </Box>
                    <Box textAlign="right">
                      <Text fontSize="xs" color="gray.500">Vigência</Text>
                      <Text fontSize="xs">{vigenciaLabel(vFrom, vUntil)}</Text>
                      {active && <Badge colorScheme="green" fontSize="2xs">Vigente</Badge>}
                    </Box>
                  </Flex>
                  {history.length > 0 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      leftIcon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                      onClick={() => toggleExpand(group.key)}
                      mt={2}
                      color="gray.500"
                    >
                      {history.length} histórico{history.length !== 1 ? "s" : ""}
                    </Button>
                  )}
                </Box>
                {expanded && (
                  <Box bg={historyBg} borderTopWidth="1px" borderColor={borderColor}>
                    {history.map((row) => {
                      const hFrom = row.validFrom || row.valid_from;
                      const hUntil = row.validUntil || row.valid_until;
                      const hExpired = isExpired(hUntil);
                      return (
                        <Flex
                          key={row.id}
                          px={3}
                          py={2}
                          align="center"
                          opacity={hExpired ? 0.5 : 0.8}
                          borderBottomWidth="1px"
                          borderColor={borderColor}
                          _last={{ borderBottomWidth: 0 }}
                        >
                          <TimeIcon boxSize={3} color="gray.400" mr={2} flexShrink={0} />
                          <Box flex={1} minW={0}>
                            <Text fontSize="sm" fontWeight="medium">{formatPrice(row.price)}</Text>
                            <Text fontSize="xs" color="gray.500">{vigenciaLabel(hFrom, hUntil)}</Text>
                          </Box>
                          <HStack spacing={1} flexShrink={0}>
                            <IconButton icon={<EditIcon />} size="xs" variant="ghost" aria-label="Editar" onClick={() => openEdit(row)} />
                            <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(row)} />
                          </HStack>
                        </Flex>
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}
        </VStack>
      ) : (
        /* ── Desktop: accordion by supplier ── */
        <VStack spacing={0} align="stretch" borderWidth="1px" borderColor={borderColor} borderRadius="md" overflow="hidden">
          {supplierGroups.map((sg) => {
            const isExpanded = expandedSuppliers.has(String(sg.codcli));
            return (
              <Box key={sg.codcli}>
                {/* Supplier header row */}
                <Flex
                  align="center"
                  px={4}
                  py={3}
                  bg={headerBg}
                  cursor="pointer"
                  onClick={() => toggleSupplier(String(sg.codcli))}
                  borderBottomWidth="1px"
                  borderColor={borderColor}
                  _hover={{ opacity: 0.85 }}
                >
                  <Box mr={2}>
                    {isExpanded ? <ChevronDownIcon boxSize={5} /> : <ChevronRightIcon boxSize={5} />}
                  </Box>
                  <Text fontSize="sm" fontWeight="bold" flex={1}>
                    {sg.supplierName || supplierLabel(sg.codcli)}
                  </Text>
                  <Badge colorScheme="blue" fontSize="xs">
                    {sg.items.length} preço{sg.items.length !== 1 ? "s" : ""}
                  </Badge>
                </Flex>

                {/* Expanded: table of prices for this supplier */}
                {isExpanded && (
                  <Box overflowX="auto">
                    <Table size="sm" w="100%">
                      <Thead>
                        <Tr>
                          <Th w="30px" px={1}></Th>
                          <Th whiteSpace="nowrap">Grupo</Th>
                          <Th whiteSpace="nowrap">Parte</Th>
                          <Th isNumeric whiteSpace="nowrap">Preço Atual (R$)</Th>
                          <Th whiteSpace="nowrap">Vigência</Th>
                          <Th w="100px" whiteSpace="nowrap">Ações</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {sg.items.map((group) => {
                          const current = group.current;
                          const vFrom = current.validFrom || current.valid_from;
                          const vUntil = current.validUntil || current.valid_until;
                          const active = isActive(vFrom, vUntil);
                          const expanded = expandedGroups.has(group.key);
                          const history = group.entries.filter((e) => e.id !== current.id);

                          return (
                            <>
                              <Tr key={group.key}>
                                <Td px={1}>
                                  {history.length > 0 && (
                                    <IconButton
                                      icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                                      size="xs"
                                      variant="ghost"
                                      aria-label="Histórico"
                                      onClick={() => toggleExpand(group.key)}
                                    />
                                  )}
                                </Td>
                                <Td><Text fontSize="sm" whiteSpace="nowrap">{group.groupName || groupLabel(group.groupId)}</Text></Td>
                                <Td><Text fontSize="sm" whiteSpace="nowrap">{group.part || "Todas"}</Text></Td>
                                <Td isNumeric><Text fontWeight="semibold" whiteSpace="nowrap">{formatPrice(current.price)}</Text></Td>
                                <Td>
                                  <HStack spacing={2}>
                                    <Text fontSize="sm" whiteSpace="nowrap">{vigenciaLabel(vFrom, vUntil)}</Text>
                                    {active && <Badge colorScheme="green" fontSize="2xs">Vigente</Badge>}
                                  </HStack>
                                </Td>
                                <Td>
                                  <HStack spacing={1}>
                                    <IconButton icon={<EditIcon />} size="xs" variant="ghost" aria-label="Editar" onClick={() => openEdit(current)} />
                                    <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(current)} />
                                    {history.length > 0 && (
                                      <Badge colorScheme="gray" fontSize="2xs" cursor="pointer" onClick={() => toggleExpand(group.key)}>
                                        <HStack spacing={1}>
                                          <TimeIcon boxSize={2.5} />
                                          <Text>{history.length}</Text>
                                        </HStack>
                                      </Badge>
                                    )}
                                  </HStack>
                                </Td>
                              </Tr>
                              {expanded && history.map((row) => {
                                const hFrom = row.validFrom || row.valid_from;
                                const hUntil = row.validUntil || row.valid_until;
                                const hExpired = isExpired(hUntil);
                                return (
                                  <Tr key={row.id} bg={historyBg} opacity={hExpired ? 0.5 : 0.75}>
                                    <Td px={1}></Td>
                                    <Td colSpan={2}>
                                      <HStack spacing={2} pl={4}>
                                        <TimeIcon boxSize={3} color="gray.400" />
                                        <Text fontSize="xs" color="gray.500">Histórico</Text>
                                      </HStack>
                                    </Td>
                                    <Td isNumeric><Text fontSize="sm">{formatPrice(row.price)}</Text></Td>
                                    <Td><Text fontSize="sm" color="gray.500">{vigenciaLabel(hFrom, hUntil)}</Text></Td>
                                    <Td>
                                      <HStack spacing={1}>
                                        <IconButton icon={<EditIcon />} size="xs" variant="ghost" aria-label="Editar" onClick={() => openEdit(row)} />
                                        <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(row)} />
                                      </HStack>
                                    </Td>
                                  </Tr>
                                );
                              })}
                            </>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </Box>
                )}
              </Box>
            );
          })}
        </VStack>
      )}

      {/* ── Single Edit Modal ────────────────────────────────────────────────── */}
      <Modal isOpen={modal.isOpen} onClose={modal.onClose} isCentered size={{ base: "full", md: "lg" }}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Editar preço</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Fornecedor</FormLabel>
                <SearchableSelect
                  placeholder="Selecione o fornecedor"
                  value={form.codcli}
                  onChange={(val) => setForm({ ...form, codcli: val, part: "" })}
                  options={suppliers.map((s) => ({ value: s.codcli, label: `${s.codcli} - ${s.nome || s.codcli}` }))}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Grupo</FormLabel>
                <SearchableSelect
                  placeholder="Selecione o grupo"
                  value={form.groupId}
                  onChange={(val) => setForm({ ...form, groupId: val, part: "" })}
                  options={groups.map((g) => ({ value: String(g.id), label: `${g.name} (${g.productCount} produtos)` }))}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Parte</FormLabel>
                <SearchableSelect
                  placeholder={loadingParts ? "Carregando partes..." : (!form.codcli || !form.groupId) ? "Selecione fornecedor e grupo" : "Todas (opcional)"}
                  value={form.part}
                  onChange={(val) => setForm({ ...form, part: val })}
                  isDisabled={!form.codcli || !form.groupId || loadingParts}
                  options={modalParts.map((p) => ({ value: p.code, label: `${p.code}${p.name ? ` - ${p.name}` : ""}` }))}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Preço (R$)</FormLabel>
                <Input
                  value={form.price > 0 ? formatBRL(form.price) : ""}
                  onChange={handleCurrencyChange}
                  placeholder="0,000"
                  inputMode="numeric"
                />
              </FormControl>
              <Flex gap={4} w="100%" direction={{ base: "column", md: "row" }}>
                <FormControl>
                  <FormLabel>Vigência De</FormLabel>
                  <Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
                </FormControl>
                <FormControl>
                  <FormLabel>Vigência Até</FormLabel>
                  <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
                </FormControl>
              </Flex>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={modal.onClose}>Cancelar</Button>
            <Button colorScheme="blue" onClick={handleSave} isLoading={saving}>Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Bulk Create Modal ────────────────────────────────────────────────── */}
      <Modal isOpen={bulkModal.isOpen} onClose={bulkModal.onClose} isCentered size={{ base: "full", md: "4xl" }}>
        <ModalOverlay />
        <ModalContent maxW="900px">
          <ModalHeader>Cadastrar Preços</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Header fields: supplier, group, dates */}
              <Flex gap={4} direction={{ base: "column", md: "row" }}>
                <FormControl isRequired flex={1}>
                  <FormLabel fontSize="sm">Fornecedor</FormLabel>
                  <SearchableSelect
                    placeholder="Selecione o fornecedor"
                    value={bulkForm.codcli}
                    onChange={(val) => setBulkForm({ ...bulkForm, codcli: val })}
                    options={suppliers.map((s) => ({ value: s.codcli, label: `${s.codcli} - ${s.nome || s.codcli}` }))}
                  />
                </FormControl>
                <FormControl isRequired flex={1}>
                  <FormLabel fontSize="sm">Grupo</FormLabel>
                  <SearchableSelect
                    placeholder="Selecione o grupo"
                    value={bulkForm.groupId}
                    onChange={(val) => setBulkForm({ ...bulkForm, groupId: val })}
                    options={groups.map((g) => ({ value: String(g.id), label: `${g.name} (${g.productCount} produtos)` }))}
                  />
                </FormControl>
              </Flex>
              <Flex gap={4} direction={{ base: "column", md: "row" }}>
                <FormControl flex={1}>
                  <FormLabel fontSize="sm">Vigência De</FormLabel>
                  <Input size="sm" type="date" value={bulkForm.validFrom} onChange={(e) => setBulkForm({ ...bulkForm, validFrom: e.target.value })} />
                </FormControl>
                <FormControl flex={1}>
                  <FormLabel fontSize="sm">Vigência Até</FormLabel>
                  <Input size="sm" type="date" value={bulkForm.validUntil} onChange={(e) => setBulkForm({ ...bulkForm, validUntil: e.target.value })} />
                </FormControl>
              </Flex>

              <Divider />

              {/* Grid header */}
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" fontWeight="semibold">
                  Preços por Parte
                  {bulkRows.length > 0 && <Badge ml={2} colorScheme="blue" fontSize="xs">{bulkRows.length}</Badge>}
                </Text>
                {bulkRows.length > 1 && (
                  <Button size="xs" variant="outline" colorScheme="blue" onClick={applyPriceToAll}>
                    Replicar 1° preço nos vazios
                  </Button>
                )}
              </Flex>

              {loadingBulkParts && bulkForm.codcli && bulkForm.groupId && (
                <Center py={2}><Spinner size="sm" /><Text fontSize="xs" ml={2}>Carregando partes...</Text></Center>
              )}

              {!bulkForm.codcli || !bulkForm.groupId ? (
                <Center py={6}>
                  <Text fontSize="sm" color="gray.500">Selecione fornecedor e grupo para carregar as partes.</Text>
                </Center>
              ) : !loadingBulkParts && bulkRows.length === 0 ? (
                <Center py={6}>
                  <Text fontSize="sm" color="gray.500">Nenhuma parte encontrada para este fornecedor/grupo.</Text>
                </Center>
              ) : (
                /* Grid */
                <Box overflowX="auto" maxH="400px" overflowY="auto">
                  <Table size="sm" variant="simple">
                    <Thead bg={headerBg} position="sticky" top={0} zIndex={1}>
                      <Tr>
                        <Th w="50px" fontSize="xs">#</Th>
                        <Th fontSize="xs">Parte</Th>
                        <Th fontSize="xs" w="180px">Preço (R$)</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {bulkRows.map((row, idx) => (
                        <Tr key={row._key} bg={row.price > 0 ? "green.50" : undefined} _dark={{ bg: row.price > 0 ? "green.900" : undefined }}>
                          <Td fontSize="xs" color="gray.500">{idx + 1}</Td>
                          <Td>
                            <Text fontSize="sm" fontWeight="medium">{row.partLabel || row.part || "Todas"}</Text>
                          </Td>
                          <Td>
                            <Input
                              size="sm"
                              value={row.price > 0 ? formatBRL(row.price) : ""}
                              onChange={(e) => updateBulkRowPrice(idx, e.target.value)}
                              placeholder="0,000"
                              inputMode="numeric"
                            />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}

              <Text fontSize="xs" color="gray.500">
                Preencha os preços para cada parte. Linhas com preço zero serão ignoradas. Datas opcionais = vigente indefinidamente.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Text fontSize="xs" color="gray.500" mr="auto">
              {bulkRows.filter((r) => r.price > 0).length} preço(s) a salvar
            </Text>
            <Button variant="ghost" mr={3} onClick={bulkModal.onClose}>Cancelar</Button>
            <Button
              colorScheme="blue"
              onClick={handleBulkSave}
              isLoading={savingBulk}
              isDisabled={bulkRows.filter((r) => r.price > 0).length === 0}
            >
              Salvar Todos
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default TerceirosSupplierPrices;
