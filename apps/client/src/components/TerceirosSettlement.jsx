import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Box,
  Flex,
  Text,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  IconButton,
  Button,
  Badge,
  Checkbox,
  HStack,
  VStack,
  Tooltip,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Spinner,
  Center,
  Textarea,
  useBreakpointValue,
  useToast,
  useColorModeValue
} from "@chakra-ui/react";
import {
  AddIcon,
  ViewIcon,
  EditIcon,
  DeleteIcon,
  SearchIcon,
  CloseIcon,
  CheckIcon,
  WarningIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  createIcon
} from "@chakra-ui/icons";
import SearchableSelect from "./SearchableSelect";
import {
  fetchTerceirosSettlements,
  fetchTerceirosSettlement,
  createTerceirosSettlement,
  updateTerceirosSettlement,
  payTerceirosSettlement,
  unpayTerceirosSettlement,
  deleteTerceirosSettlement,
  removeSettlementItem,
  updateSettlementItem,
  addSettlementItems,
  addSettlementDiscount,
  removeSettlementDiscount,
  fetchTerceirosOfs,
  fetchTerceirosSuppliers,
  fetchTerceirosPricesForOfs,
  saveTerceirosDraft,
  fetchTerceirosDraft
} from "../api";
import { getToken } from "../api";
import { getSaoPauloYear, getSaoPauloMonth } from "../utils/timezone";
import { formatCurrency } from "../utils/format";

const PdfIcon = createIcon({
  displayName: "PdfIcon",
  viewBox: "0 0 24 24",
  path: (
    <>
      <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="#E53E3E" />
      <path d="M14 2v6h6" fill="#FC8181" />
      <text x="12" y="17" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold" fontFamily="Arial">PDF</text>
    </>
  )
});

const ExcelIcon = createIcon({
  displayName: "ExcelIcon",
  viewBox: "0 0 24 24",
  path: (
    <>
      <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="#38A169" />
      <path d="M14 2v6h6" fill="#68D391" />
      <text x="12" y="17" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="bold" fontFamily="Arial">XLS</text>
    </>
  )
});

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const TerceirosSettlement = () => {
  // ── Filters (mês anterior por padrão) ───────────────────────────────────
  const prevMonth = getSaoPauloMonth() === 1 ? 12 : getSaoPauloMonth() - 1;
  const prevYear = getSaoPauloMonth() === 1 ? getSaoPauloYear() - 1 : getSaoPauloYear();
  const [month, setMonth] = useState(prevMonth);
  const [year, setYear] = useState(prevYear);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ofSearch, setOfSearch] = useState("");

  // ── Data ──────────────────────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Detail panel ──────────────────────────────────────────────────────────
  const [viewingSettlement, setViewingSettlement] = useState(null);

  // ── Edit mode ───────────────────────────────────────────────────────────
  const [editingSettlement, setEditingSettlement] = useState(null);
  const [editNotes, setEditNotes] = useState("");
  const [editDiscDesc, setEditDiscDesc] = useState("");
  const [editDiscAmount, setEditDiscAmount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemValue, setEditingItemValue] = useState("");
  const [editingItemField, setEditingItemField] = useState(null); // "qty" or "price"
  const [editMonth, setEditMonth] = useState(null);
  const [editYear, setEditYear] = useState(null);
  const [editingGroupPrice, setEditingGroupPrice] = useState(null);
  const [editingGroupPriceValue, setEditingGroupPriceValue] = useState("");

  // ── New settlement creation ───────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [newSupplier, setNewSupplier] = useState("");
  const [newMonth, setNewMonth] = useState(prevMonth);
  const [newYear, setNewYear] = useState(prevYear);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [unsettledOfs, setUnsettledOfs] = useState([]);
  const [loadingOfs, setLoadingOfs] = useState(false);
  const [selectedOfs, setSelectedOfs] = useState(new Set());
  const [ofPrices, setOfPrices] = useState({});
  const [manualPrices, setManualPrices] = useState({});
  const [notes, setNotes] = useState("");
  const [newDiscounts, setNewDiscounts] = useState([]);
  const [newDiscDesc, setNewDiscDesc] = useState("");
  const [newDiscAmount, setNewDiscAmount] = useState("");
  const [ofSearchNew, setOfSearchNew] = useState("");
  const [etapaFilter, setEtapaFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editedQuantities, setEditedQuantities] = useState({});
  const [editedGroupPrices, setEditedGroupPrices] = useState({});
  const [editingSize, setEditingSize] = useState(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [restoringDraft, setRestoringDraft] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [expandedOfGroups, setExpandedOfGroups] = useState(new Set());
  const [expandedEditGroups, setExpandedEditGroups] = useState(new Set());

  const ofSearchNewRef = useRef(null);

  const toast = useToast();
  const isMobile = useBreakpointValue({ base: true, md: false });

  // ── Colors ────────────────────────────────────────────────────────────────
  const cardBg = useColorModeValue("white", "gray.800");
  const headerBg = useColorModeValue("gray.50", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const detailBg = useColorModeValue("gray.50", "gray.750");
  const hoverBg = useColorModeValue("gray.50", "gray.700");
  const selectedRowBg = useColorModeValue("blue.50", "blue.900");

  // ── Load suppliers on mount ───────────────────────────────────────────────
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const data = await fetchTerceirosSuppliers();
        setSuppliers(data);
      } catch (err) {
        console.error("Erro ao carregar fornecedores:", err);
      }
    };
    loadSuppliers();
  }, []);

  // ── Load settlements when filters change ──────────────────────────────────
  const loadSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.append("month", month);
      if (year) params.append("year", year);
      if (supplierFilter) params.append("codcli", supplierFilter);
      if (statusFilter) params.append("status", statusFilter);
      if (ofSearch.trim()) params.append("of", ofSearch.trim());
      const data = await fetchTerceirosSettlements(params.toString());
      setSettlements(data);
    } catch (err) {
      console.error("Erro ao carregar fechamentos:", err);
      toast({ title: "Erro ao carregar fechamentos.", status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [month, year, supplierFilter, statusFilter, ofSearch, toast]);

  useEffect(() => {
    loadSettlements();
  }, [loadSettlements]);

  // ── View settlement detail ────────────────────────────────────────────────
  const handleViewDetail = useCallback(async (id) => {
    if (viewingSettlement && viewingSettlement.id === id) {
      setViewingSettlement(null);
      return;
    }
    setLoadingDetail(true);
    try {
      const data = await fetchTerceirosSettlement(id);
      setViewingSettlement(data);
    } catch (err) {
      toast({ title: "Erro ao carregar detalhes.", status: "error", duration: 3000 });
    } finally {
      setLoadingDetail(false);
    }
  }, [viewingSettlement, toast]);

  // ── Toggle paid/unpaid ────────────────────────────────────────────────────
  const handleTogglePaid = useCallback(async (settlement) => {
    try {
      if (settlement.status === "paid") {
        await unpayTerceirosSettlement(settlement.id);
        toast({ title: "Fechamento marcado como em aberto.", status: "info", duration: 3000 });
      } else {
        await payTerceirosSettlement(settlement.id);
        toast({ title: "Fechamento marcado como pago.", status: "success", duration: 3000 });
      }
      await loadSettlements();
      if (viewingSettlement && viewingSettlement.id === settlement.id) {
        const updated = await fetchTerceirosSettlement(settlement.id);
        setViewingSettlement(updated);
      }
    } catch (err) {
      toast({ title: "Erro ao alterar status.", status: "error", duration: 3000 });
    }
  }, [loadSettlements, viewingSettlement, toast]);

  // ── Delete settlement ─────────────────────────────────────────────────────
  const handleDelete = useCallback(async (settlement) => {
    if (!window.confirm(`Excluir o fechamento de "${settlement.supplierName}" - ${monthNames[(settlement.referenceMonth || 1) - 1]}/${settlement.referenceYear}?`)) return;
    try {
      await deleteTerceirosSettlement(settlement.id);
      toast({ title: "Fechamento excluído.", status: "success", duration: 3000 });
      if (viewingSettlement && viewingSettlement.id === settlement.id) {
        setViewingSettlement(null);
      }
      await loadSettlements();
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir.", status: "error", duration: 3000 });
    }
  }, [loadSettlements, viewingSettlement, toast]);

  // ── Edit settlement ─────────────────────────────────────────────────────
  const handleStartEdit = useCallback(async (settlement) => {
    setViewingSettlement(null);
    setLoadingDetail(true);
    try {
      const data = await fetchTerceirosSettlement(settlement.id);
      setEditingSettlement(data);
      setEditNotes(data.notes || "");
      setEditMonth(data.referenceMonth || data.reference_month || 1);
      setEditYear(data.referenceYear || data.reference_year || getSaoPauloYear());
    } catch (err) {
      toast({ title: "Erro ao carregar fechamento.", status: "error", duration: 3000 });
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingSettlement) return;
    setSavingEdit(true);
    try {
      await updateTerceirosSettlement(editingSettlement.id, { notes: editNotes, referenceMonth: editMonth, referenceYear: editYear });
      toast({ title: "Fechamento atualizado.", status: "success", duration: 3000 });
      const updated = await fetchTerceirosSettlement(editingSettlement.id);
      setEditingSettlement(updated);
      await loadSettlements();
    } catch (err) {
      toast({ title: "Erro ao salvar.", status: "error", duration: 3000 });
    } finally {
      setSavingEdit(false);
    }
  }, [editingSettlement, editNotes, editMonth, editYear, loadSettlements, toast]);

  const handleRemoveItem = useCallback(async (itemId) => {
    if (!editingSettlement) return;
    if (!window.confirm("Remover este item do fechamento?")) return;
    try {
      await removeSettlementItem(editingSettlement.id, itemId);
      toast({ title: "Item removido.", status: "success", duration: 2000 });
      const updated = await fetchTerceirosSettlement(editingSettlement.id);
      setEditingSettlement(updated);
      await loadSettlements();
    } catch (err) {
      toast({ title: "Erro ao remover item.", status: "error", duration: 3000 });
    }
  }, [editingSettlement, loadSettlements, toast]);

  const handleUpdateItem = useCallback(async (itemId, data) => {
    if (!editingSettlement) return;
    try {
      await updateSettlementItem(editingSettlement.id, itemId, data);
      toast({ title: "Item atualizado.", status: "success", duration: 2000 });
      const updated = await fetchTerceirosSettlement(editingSettlement.id);
      setEditingSettlement(updated);
      await loadSettlements();
    } catch (err) {
      toast({ title: "Erro ao atualizar item.", status: "error", duration: 3000 });
    }
  }, [editingSettlement, loadSettlements, toast]);

  const handleReaddItem = useCallback(async (ofId, quantity, unitPrice) => {
    if (!editingSettlement) return;
    try {
      await addSettlementItems(editingSettlement.id, [{
        ofId,
        quantity: parseFloat(quantity) || 0,
        unitPrice: parseFloat(unitPrice) || 0,
        priceSource: "table"
      }]);
      toast({ title: "Item readicionado.", status: "success", duration: 2000 });
      const updated = await fetchTerceirosSettlement(editingSettlement.id);
      setEditingSettlement(updated);
      await loadSettlements();
    } catch (err) {
      toast({ title: "Erro ao readicionar item.", status: "error", duration: 3000 });
    }
  }, [editingSettlement, loadSettlements, toast]);

  const handleCancelEdit = useCallback(() => {
    setEditingSettlement(null);
    setEditNotes("");
    setEditMonth(null);
    setEditYear(null);
    setExpandedEditGroups(new Set());
  }, []);

  // ── Export helper ─────────────────────────────────────────────────────────
  const buildExportFilename = useCallback((settlement, ext) => {
    const m = String(settlement.referenceMonth || 1).padStart(2, "0");
    const y = settlement.referenceYear || new Date().getFullYear();
    return `fechamento_${m}_${y}.${ext}`;
  }, []);

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async (settlement) => {
    try {
      const token = getToken();
      const response = await fetch(`/api/terceiros/settlements/${settlement.id}/export/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error("Erro ao exportar PDF.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildExportFilename(settlement, "pdf");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast({ title: "Erro ao exportar PDF.", status: "error", duration: 3000 });
    }
  }, [toast, buildExportFilename]);

  // ── Export Excel ──────────────────────────────────────────────────────────
  const handleExportExcel = useCallback(async (settlement) => {
    try {
      const token = getToken();
      const response = await fetch(`/api/terceiros/settlements/${settlement.id}/export/excel`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error("Erro ao exportar Excel.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildExportFilename(settlement, "xlsx");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast({ title: "Erro ao exportar Excel.", status: "error", duration: 3000 });
    }
  }, [toast, buildExportFilename]);

  // ── New Settlement: load OFs ─────────────────────────────────────────────
  const loadUnsettledOfs = useCallback(async ({ codcli, ofNumbers } = {}) => {
    const hasSupplier = !!codcli;
    const hasOfs = ofNumbers && ofNumbers.trim().length > 0;
    const hasDates = !!dateFrom || !!dateTo;

    if (!hasSupplier && !hasOfs && !hasDates) {
      setUnsettledOfs([]);
      return;
    }

    setLoadingOfs(true);
    try {
      const params = new URLSearchParams();
      if (codcli) params.append("codcli", codcli);
      params.append("unsettledOnly", "true");
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (hasOfs) params.append("facNumero", ofNumbers.trim());
      const result = await fetchTerceirosOfs(params.toString());
      const data = result.rows || result || [];
      setUnsettledOfs(data);
      setSelectedOfs(new Set());
      setManualPrices({});
      setEtapaFilter("");

      // Fetch prices for these OFs (group by supplier)
      if (data.length > 0) {
        const bySupplier = {};
        data.forEach((of) => {
          const key = of.fac_codcli || "__none__";
          if (!bySupplier[key]) bySupplier[key] = [];
          bySupplier[key].push(of);
        });

        const priceMap = {};
        const autoSelected = new Set();

        for (const [supplierCode, ofs] of Object.entries(bySupplier)) {
          if (supplierCode === "__none__") continue;
          const items = ofs.map((of) => ({
            productCode: of.fac_codigo_produto,
            parte: of.fac_parte,
            cor: of.fac_cor,
            etapa: of.fac_codsetor || null
          }));
          try {
            const prices = await fetchTerceirosPricesForOfs(supplierCode, items);
            if (Array.isArray(prices)) {
              prices.forEach((p) => {
                const key = `${supplierCode}|${p.productCode}|${p.parte}|${p.cor}`;
                priceMap[key] = {
                  price: p.price,
                  source: p.source,
                  error: p.error || null,
                  groupName: p.groupName || null
                };
              });
            }
          } catch {
            // ignore price fetch errors per supplier
          }
        }

        // Map prices back and auto-select
        data.forEach((of, idx) => {
          const key = `${of.fac_codcli}|${of.fac_codigo_produto}|${of.fac_parte}|${of.fac_cor}`;
          if (priceMap[key] && priceMap[key].price != null) {
            autoSelected.add(idx);
          }
        });

        // Also store with original key format for getOfPriceInfo
        const legacyPriceMap = {};
        data.forEach((of) => {
          const newKey = `${of.fac_codcli}|${of.fac_codigo_produto}|${of.fac_parte}|${of.fac_cor}`;
          const legacyKey = `${of.fac_codigo_produto}|${of.fac_parte}|${of.fac_cor}`;
          if (priceMap[newKey]) {
            legacyPriceMap[legacyKey] = priceMap[newKey];
          }
        });

        setOfPrices(legacyPriceMap);
        setSelectedOfs(autoSelected);
      } else {
        setOfPrices({});
      }
    } catch (err) {
      toast({ title: "Erro ao carregar OFs.", status: "error", duration: 3000 });
    } finally {
      setLoadingOfs(false);
    }
  }, [dateFrom, dateTo, toast]);

  const handleNewSupplierChange = useCallback((codcli) => {
    setNewSupplier(codcli);
    const currentSearch = ofSearchNewRef.current?.value || ofSearchNew;
    loadUnsettledOfs({ codcli, ofNumbers: currentSearch });
  }, [loadUnsettledOfs, ofSearchNew]);

  const handleOfSearch = useCallback(() => {
    const currentSearch = ofSearchNewRef.current?.value || "";
    setOfSearchNew(currentSearch);
    const hasSupplier = !!newSupplier;
    const hasOfs = currentSearch.trim().length > 0;
    const hasDates = !!dateFrom || !!dateTo;

    if (!hasSupplier && !hasOfs && !hasDates) {
      toast({ title: "Informe pelo menos um filtro: fornecedor, OFs ou período.", status: "warning", duration: 3000 });
      return;
    }
    loadUnsettledOfs({ codcli: newSupplier || null, ofNumbers: currentSearch });
  }, [newSupplier, dateFrom, dateTo, loadUnsettledOfs, toast]);

  useEffect(() => {
    if (newSupplier) {
      loadUnsettledOfs({ codcli: newSupplier, ofNumbers: ofSearchNew });
    }
  }, [dateFrom, dateTo]);

  // ── OF price helper ───────────────────────────────────────────────────────
  const getOfPriceInfo = useCallback((of) => {
    const key = `${of.fac_codigo_produto}|${of.fac_parte}|${of.fac_cor}`;
    return ofPrices[key] || null;
  }, [ofPrices]);

  const getOfPrice = useCallback((of, index) => {
    // Check group-level price edit first
    const groupKey = `${of.fac_numero}|${of.fac_codsetor || ''}|${of.fac_codigo_produto}|${of.fac_cor}|${of.fac_parte}`;
    if (editedGroupPrices[groupKey] !== undefined && editedGroupPrices[groupKey] !== "") {
      return parseFloat(String(editedGroupPrices[groupKey]).replace(",", ".")) || 0;
    }
    const manualKey = `${index}`;
    if (manualPrices[manualKey] !== undefined) {
      return parseFloat(manualPrices[manualKey]) || 0;
    }
    const info = getOfPriceInfo(of);
    return info?.price ?? null;
  }, [getOfPriceInfo, manualPrices, editedGroupPrices]);

  const hasPrice = useCallback((of, index) => {
    const groupKey = `${of.fac_numero}|${of.fac_codsetor || ''}|${of.fac_codigo_produto}|${of.fac_cor}|${of.fac_parte}`;
    if (editedGroupPrices[groupKey] !== undefined && editedGroupPrices[groupKey] !== "") {
      return true;
    }
    const manualKey = `${index}`;
    if (manualPrices[manualKey] !== undefined && manualPrices[manualKey] !== "") {
      return true;
    }
    const info = getOfPriceInfo(of);
    return info?.price != null;
  }, [getOfPriceInfo, manualPrices, editedGroupPrices]);

  // ── Derived etapas from loaded OFs ─────────────────────────────────────────
  const availableEtapas = useMemo(() => {
    const etapas = new Map();
    unsettledOfs.forEach((of) => {
      if (of.fac_codsetor) {
        etapas.set(of.fac_codsetor, of.fac_descsetor || of.fac_codsetor);
      }
    });
    return [...etapas.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [unsettledOfs]);

  const filteredUnsettledOfs = useMemo(() => {
    if (!etapaFilter) return unsettledOfs;
    return unsettledOfs.filter((of) => of.fac_codsetor === etapaFilter);
  }, [unsettledOfs, etapaFilter]);

  // ── Select All / Deselect All ─────────────────────────────────────────────
  const handleSelectAll = useCallback(() => {
    const allIndices = new Set(filteredUnsettledOfs.map((of) => unsettledOfs.indexOf(of)));
    setSelectedOfs(allIndices);
  }, [filteredUnsettledOfs, unsettledOfs]);

  const handleDeselectAll = useCallback(() => {
    setSelectedOfs(new Set());
  }, []);

  const toggleOfSelection = useCallback((index) => {
    setSelectedOfs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // ── Compute total for new settlement ──────────────────────────────────────
  const newSettlementTotal = useMemo(() => {
    let total = 0;
    selectedOfs.forEach((index) => {
      const of = unsettledOfs[index];
      if (!of) return;
      const price = getOfPrice(of, index);
      const qty = editedQuantities[index] !== undefined
        ? (parseFloat(editedQuantities[index]) || 0)
        : (parseFloat(of.fac_quant) || 0);
      if (price != null && price > 0) {
        total += price * qty;
      }
    });
    return total;
  }, [selectedOfs, unsettledOfs, getOfPrice, editedQuantities]);

  const newSettlementPcs = useMemo(() => {
    let pcs = 0;
    selectedOfs.forEach((index) => {
      const of = unsettledOfs[index];
      if (!of) return;
      const qty = editedQuantities[index] !== undefined
        ? (parseFloat(editedQuantities[index]) || 0)
        : (parseFloat(of.fac_quant) || 0);
      pcs += qty;
    });
    return pcs;
  }, [selectedOfs, unsettledOfs, editedQuantities]);

  // ── Create new settlement ─────────────────────────────────────────────────
  const handleCreateSettlement = useCallback(async () => {
    if (selectedOfs.size === 0) {
      toast({ title: "Selecione pelo menos uma OF.", status: "warning", duration: 3000 });
      return;
    }

    // Detect supplier from selected OFs (must all be same supplier)
    const selectedSuppliers = new Set();
    selectedOfs.forEach((index) => {
      const of = unsettledOfs[index];
      if (of) selectedSuppliers.add(of.fac_codcli);
    });

    if (selectedSuppliers.size > 1) {
      toast({ title: "As OFs selecionadas pertencem a fornecedores diferentes. Selecione OFs de um único fornecedor.", status: "warning", duration: 5000 });
      return;
    }

    const codcli = newSupplier || [...selectedSuppliers][0];
    if (!codcli) {
      toast({ title: "Não foi possível identificar o fornecedor.", status: "warning", duration: 3000 });
      return;
    }

    // Validate prices
    let missingPrices = false;
    const items = [];
    selectedOfs.forEach((index) => {
      const of = unsettledOfs[index];
      if (!of) return;
      const price = getOfPrice(of, index);
      if (price == null || price <= 0) {
        missingPrices = true;
        return;
      }
      const originalQty = parseFloat(of.fac_quant) || 0;
      const effectiveQty = editedQuantities[index] !== undefined
        ? (parseFloat(editedQuantities[index]) || 0)
        : originalQty;
      const manualKey = `${index}`;
      const isPriceManual = manualPrices[manualKey] !== undefined && manualPrices[manualKey] !== "";
      const isQtyEdited = editedQuantities[index] !== undefined && parseFloat(editedQuantities[index]) !== originalQty;
      const originalPrice = getOfPriceInfo(of)?.price ?? null;
      const isPriceEdited = isPriceManual || (editedGroupPrices[`${of.fac_numero}|${of.fac_codsetor || ''}|${of.fac_codigo_produto}|${of.fac_cor}|${of.fac_parte}`] !== undefined);
      const manuallyEdited = isQtyEdited || isPriceEdited;
      items.push({
        ofId: of.id,
        quantity: effectiveQty,
        unitPrice: price,
        priceSource: isPriceManual ? "manual" : "table",
        manuallyEdited,
        originalQuantity: manuallyEdited ? originalQty : undefined,
        originalUnitPrice: manuallyEdited ? (originalPrice ?? price) : undefined
      });
    });

    if (missingPrices) {
      toast({ title: "Existem itens selecionados sem preço definido.", status: "warning", duration: 4000 });
      return;
    }

    const supplierObj = suppliers.find((s) => String(s.codcli) === String(codcli));
    const supplierName = supplierObj ? supplierObj.nome || codcli : (unsettledOfs.find(o => o.fac_codcli === codcli)?.cliente_nome || codcli);

    setSubmitting(true);
    try {
      await createTerceirosSettlement({
        codcli,
        supplierName,
        referenceMonth: newMonth,
        referenceYear: newYear,
        notes,
        items,
        discounts: newDiscounts.length > 0 ? newDiscounts : undefined,
        draftId: activeDraftId || undefined
      });
      toast({ title: "Fechamento criado com sucesso.", status: "success", duration: 3000 });
      setActiveDraftId(null);
      setCreating(false);
      setNewSupplier("");
      setOfSearchNew("");
      if (ofSearchNewRef.current) ofSearchNewRef.current.value = "";
      setEtapaFilter("");
      setUnsettledOfs([]);
      setSelectedOfs(new Set());
      setOfPrices({});
      setManualPrices({});
      setEditedQuantities({});
      setEditedGroupPrices({});
      setEditingSize(null);
      setExpandedOfGroups(new Set());
      setNotes("");
      setNewMonth(prevMonth);
      setNewYear(prevYear);
      setNewDiscounts([]);
      await loadSettlements();
    } catch (err) {
      toast({ title: err.message || "Erro ao criar fechamento.", status: "error", duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  }, [newSupplier, selectedOfs, unsettledOfs, getOfPrice, getOfPriceInfo, editedQuantities, editedGroupPrices, manualPrices, suppliers, newMonth, newYear, prevMonth, prevYear, notes, newDiscounts, loadSettlements, toast]);

  // ── Draft save/restore (persisted in DB) ─────────────────────────────────
  const handleSaveDraft = useCallback(async () => {
    if (!newSupplier) {
      toast({ title: "Selecione um fornecedor para salvar o rascunho.", status: "warning", duration: 3000 });
      return;
    }

    const ofIds = [];
    selectedOfs.forEach((index) => {
      const of = unsettledOfs[index];
      if (of) ofIds.push(of.id);
    });

    const supplierObj = suppliers.find((s) => String(s.codcli) === String(newSupplier));
    const supplierName = supplierObj ? supplierObj.nome || newSupplier : newSupplier;

    const draftData = {
      dateFrom, dateTo, ofSearchNew, etapaFilter,
      newMonth, newYear,
      selectedOfIds: ofIds,
      manualPrices, editedQuantities, editedGroupPrices,
      newDiscounts
    };

    setSavingDraft(true);
    try {
      const result = await saveTerceirosDraft({
        codcli: newSupplier,
        supplierName,
        referenceMonth: newMonth,
        referenceYear: newYear,
        notes,
        draftData
      }, activeDraftId || undefined);

      setActiveDraftId(result.id);
      toast({ title: "Rascunho salvo com sucesso.", status: "success", duration: 3000 });
      await loadSettlements();
    } catch (err) {
      toast({ title: err.message || "Erro ao salvar rascunho.", status: "error", duration: 4000 });
    } finally {
      setSavingDraft(false);
    }
  }, [newSupplier, dateFrom, dateTo, ofSearchNew, etapaFilter, selectedOfs, unsettledOfs, manualPrices, editedQuantities, editedGroupPrices, notes, newDiscounts, suppliers, newMonth, newYear, activeDraftId, loadSettlements, toast]);

  const handleRestoreDraft = useCallback(async (draftId) => {
    setRestoringDraft(true);
    try {
      const draft = await fetchTerceirosDraft(draftId);
      if (!draft) throw new Error("Rascunho não encontrado.");

      const dd = draft.draftData || {};

      setCreating(true);
      setActiveDraftId(draft.id);
      setNewSupplier(draft.codcli || "");
      setNewMonth(draft.reference_month || dd.newMonth || prevMonth);
      setNewYear(draft.reference_year || dd.newYear || prevYear);
      setDateFrom(dd.dateFrom || "");
      setDateTo(dd.dateTo || "");
      setOfSearchNew(dd.ofSearchNew || "");
      if (ofSearchNewRef.current) ofSearchNewRef.current.value = dd.ofSearchNew || "";
      setEtapaFilter(dd.etapaFilter || "");
      setNotes(draft.notes || "");
      setNewDiscounts(dd.newDiscounts || []);

      // Reload OFs from server
      const params = new URLSearchParams();
      if (draft.codcli) params.append("codcli", draft.codcli);
      params.append("unsettledOnly", "true");
      if (dd.dateFrom) params.append("dateFrom", dd.dateFrom);
      if (dd.dateTo) params.append("dateTo", dd.dateTo);
      if (dd.ofSearchNew) params.append("facNumero", dd.ofSearchNew.trim());

      setLoadingOfs(true);
      const result = await fetchTerceirosOfs(params.toString());
      const data = result.rows || result || [];
      setUnsettledOfs(data);

      // Re-select OFs by id
      const idToIndex = {};
      data.forEach((of, idx) => { idToIndex[of.id] = idx; });
      const restored = new Set();
      (dd.selectedOfIds || []).forEach((id) => {
        if (idToIndex[id] !== undefined) restored.add(idToIndex[id]);
      });

      // Reload prices
      if (data.length > 0 && draft.codcli) {
        const items = data.map((of) => ({
          productCode: of.fac_codigo_produto,
          parte: of.fac_parte,
          cor: of.fac_cor,
          etapa: of.fac_codsetor || null
        }));
        try {
          const prices = await fetchTerceirosPricesForOfs(draft.codcli, items);
          const legacyPriceMap = {};
          if (Array.isArray(prices)) {
            prices.forEach((p) => {
              const key = `${p.productCode}|${p.parte}|${p.cor}`;
              legacyPriceMap[key] = { price: p.price, source: p.source, error: p.error || null, groupName: p.groupName || null };
            });
            if (restored.size === 0) {
              data.forEach((of, idx) => {
                const key = `${of.fac_codigo_produto}|${of.fac_parte}|${of.fac_cor}`;
                if (legacyPriceMap[key]?.price != null) restored.add(idx);
              });
            }
          }
          setOfPrices(legacyPriceMap);
        } catch {
          setOfPrices({});
        }
      }

      setSelectedOfs(restored);
      setManualPrices(dd.manualPrices || {});
      setEditedQuantities(dd.editedQuantities || {});
      setEditedGroupPrices(dd.editedGroupPrices || {});

      setLoadingOfs(false);
      toast({ title: "Rascunho restaurado.", status: "info", duration: 3000 });
    } catch (err) {
      toast({ title: err.message || "Erro ao restaurar rascunho.", status: "error", duration: 3000 });
    } finally {
      setRestoringDraft(false);
    }
  }, [toast]);

  // ── Cancel new settlement ─────────────────────────────────────────────────
  const handleCancelCreate = useCallback(() => {
    setCreating(false);
    setActiveDraftId(null);
    setNewSupplier("");
    setOfSearchNew("");
    if (ofSearchNewRef.current) ofSearchNewRef.current.value = "";
    setEtapaFilter("");
    setDateFrom("");
    setDateTo("");
    setUnsettledOfs([]);
    setSelectedOfs(new Set());
    setOfPrices({});
    setManualPrices({});
    setEditedQuantities({});
    setEditedGroupPrices({});
    setEditingSize(null);
    setExpandedOfGroups(new Set());
    setNotes("");
    setNewDiscounts([]);
    setNewDiscDesc("");
    setNewDiscAmount("");
  }, []);

  // ── Discount handlers (create panel - local state) ──────────────────────
  const handleAddNewDiscount = useCallback(() => {
    const desc = newDiscDesc.trim();
    const amt = parseFloat(String(newDiscAmount).replace(",", "."));
    if (!desc || !amt || amt <= 0) return;
    setNewDiscounts((prev) => [...prev, { description: desc, amount: amt }]);
    setNewDiscDesc("");
    setNewDiscAmount("");
  }, [newDiscDesc, newDiscAmount]);

  const handleRemoveNewDiscount = useCallback((index) => {
    setNewDiscounts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Discount handlers (edit panel - API calls) ──────────────────────────
  const handleAddEditDiscount = useCallback(async (desc, amount) => {
    if (!editingSettlement) return;
    try {
      await addSettlementDiscount(editingSettlement.id, { description: desc, amount });
      const updated = await fetchTerceirosSettlement(editingSettlement.id);
      setEditingSettlement(updated);
      await loadSettlements();
    } catch (err) {
      toast({ title: err.message || "Erro ao adicionar desconto.", status: "error", duration: 3000 });
    }
  }, [editingSettlement, loadSettlements, toast]);

  const handleRemoveEditDiscount = useCallback(async (discountId) => {
    if (!editingSettlement) return;
    try {
      await removeSettlementDiscount(editingSettlement.id, discountId);
      const updated = await fetchTerceirosSettlement(editingSettlement.id);
      setEditingSettlement(updated);
      await loadSettlements();
    } catch (err) {
      toast({ title: err.message || "Erro ao remover desconto.", status: "error", duration: 3000 });
    }
  }, [editingSettlement, loadSettlements, toast]);

  // ── Get supplier name ─────────────────────────────────────────────────────
  const getSupplierName = useCallback((codcli) => {
    const s = suppliers.find((sup) => String(sup.codcli) === String(codcli));
    return s ? s.nome || codcli : codcli;
  }, [suppliers]);

  // ── Filtered settlements (client-side OF search) ──────────────────────────
  const filteredSettlements = useMemo(() => {
    return settlements;
  }, [settlements]);

  // ── Render: Filters Bar ───────────────────────────────────────────────────
  const renderFilters = () => {
    const handlePrevMonth = () => {
      if (month === 1) { setMonth(12); setYear(year - 1); }
      else setMonth(month - 1);
    };
    const handleNextMonth = () => {
      if (month === 12) { setMonth(1); setYear(year + 1); }
      else setMonth(month + 1);
    };

    const filterContent = (
      <>
        <HStack spacing={2}>
          <IconButton icon={<ChevronLeftIcon />} aria-label="Mes anterior" size="sm" variant="outline" onClick={handlePrevMonth} />
          <Text fontWeight="bold" minW="140px" textAlign="center" fontSize="sm" whiteSpace="nowrap">
            {monthNames[month - 1]} / {year}
          </Text>
          <IconButton icon={<ChevronRightIcon />} aria-label="Proximo mes" size="sm" variant="outline" onClick={handleNextMonth} />
        </HStack>
        <Select
          size="sm"
          placeholder="Fornecedor"
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          w={isMobile ? "100%" : "200px"}
        >
          {suppliers.map((s) => (
            <option key={s.codcli} value={s.codcli}>
              {s.codcli} - {s.nome || s.codcli}
            </option>
          ))}
        </Select>
        <Select
          size="sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          w={isMobile ? "100%" : "140px"}
        >
          <option value="">Todos</option>
          <option value="draft">Rascunho</option>
          <option value="open">Em Aberto</option>
          <option value="paid">Pago</option>
        </Select>
        <InputGroup size="sm" w={isMobile ? "100%" : "160px"}>
          <InputLeftElement pointerEvents="none">
            <SearchIcon color="gray.400" />
          </InputLeftElement>
          <Input
            placeholder="Buscar OF..."
            value={ofSearch}
            onChange={(e) => setOfSearch(e.target.value)}
          />
        </InputGroup>
        <Button
          leftIcon={<AddIcon />}
          colorScheme="blue"
          size="sm"
          onClick={() => setCreating(true)}
          flexShrink={0}
        >
          Novo Fechamento
        </Button>
      </>
    );

    if (isMobile) {
      return (
        <VStack align="stretch" spacing={2} mb={4}>
          {filterContent}
        </VStack>
      );
    }

    return (
      <HStack spacing={3} mb={4} wrap="wrap">
        {filterContent}
      </HStack>
    );
  };

  // ── Render: Settlements Table ─────────────────────────────────────────────
  const renderSettlementsTable = () => {
    if (loading) {
      return <Center py={10}><Spinner size="lg" color="blue.500" /></Center>;
    }

    if (filteredSettlements.length === 0) {
      return (
        <Box bg={cardBg} borderRadius="lg" borderWidth="1px" borderColor={borderColor} py={8} textAlign="center">
          <Text color="gray.500" fontSize="sm">Nenhum fechamento encontrado.</Text>
        </Box>
      );
    }

    if (isMobile) {
      return (
        <VStack align="stretch" spacing={2}>
          {filteredSettlements.map((s) => (
            <Box
              key={s.id}
              bg={cardBg}
              borderRadius="lg"
              borderWidth="1px"
              borderColor={borderColor}
              p={3}
            >
              <Flex justify="space-between" align="center" mb={1}>
                <HStack spacing={1}>
                  <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
                    {s.supplierName || getSupplierName(s.codcli)}
                  </Text>
                  {s.status === "draft" && s.createdByName && (
                    <Text fontSize="2xs" color="gray.400">por {s.createdByName}</Text>
                  )}
                  {s.missingCount > 0 && (
                    <Tooltip label={`${s.missingCount} tamanho(s) nao incluido(s)`}>
                      <Box as="span">
                        <WarningIcon color="red.500" boxSize={3} />
                      </Box>
                    </Tooltip>
                  )}
                </HStack>
                <Badge colorScheme={s.status === "paid" ? "green" : s.status === "draft" ? "purple" : "yellow"} fontSize="xs">
                  {s.status === "paid" ? "Pago" : s.status === "draft" ? "Rascunho" : "Em Aberto"}
                </Badge>
              </Flex>
              <Flex justify="space-between" align="center" mb={2}>
                <Text fontSize="xs" color="gray.500">
                  {monthNames[(s.referenceMonth || 1) - 1]}/{s.referenceYear} - {s.totalItems ?? 0} itens
                </Text>
                <VStack spacing={0} align="flex-end">
                  {parseFloat(s.totalDiscounts) > 0 && (
                    <Text fontSize="xs" color="gray.400" textDecoration="line-through">
                      {formatCurrency(s.totalAmount ?? 0)}
                    </Text>
                  )}
                  <Text fontSize="sm" fontWeight="bold">
                    {formatCurrency(parseFloat(s.totalDiscounts) > 0 ? (s.totalPayable ?? 0) : (s.totalAmount ?? 0))}
                  </Text>
                </VStack>
              </Flex>
              <HStack spacing={1} justify="flex-end">
                {s.status === "draft" ? (
                  <>
                    <Button size="xs" colorScheme="purple" variant="outline" onClick={() => handleRestoreDraft(s.id)} isLoading={restoringDraft}>
                      Continuar
                    </Button>
                    <Tooltip label="Excluir rascunho">
                      <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(s)} />
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <Tooltip label="Ver detalhes">
                      <IconButton icon={<ViewIcon />} size="xs" variant="ghost" aria-label="Ver detalhes" onClick={() => handleViewDetail(s.id)} />
                    </Tooltip>
                    <Tooltip label="Editar">
                      <IconButton icon={<EditIcon />} size="xs" variant="ghost" colorScheme="blue" aria-label="Editar" onClick={() => handleStartEdit(s)} />
                    </Tooltip>
                    <Tooltip label={s.status === "paid" ? "Marcar como em aberto" : "Marcar como pago"}>
                      <IconButton icon={<CheckIcon />} size="xs" variant="ghost" colorScheme={s.status === "paid" ? "yellow" : "green"} aria-label="Alternar status" onClick={() => handleTogglePaid(s)} />
                    </Tooltip>
                    <Tooltip label="Exportar PDF">
                      <IconButton icon={<PdfIcon boxSize={5} />} size="sm" variant="ghost" aria-label="Exportar PDF" onClick={() => handleExportPdf(s)} />
                    </Tooltip>
                    <Tooltip label="Exportar Excel">
                      <IconButton icon={<ExcelIcon boxSize={5} />} size="sm" variant="ghost" aria-label="Exportar Excel" onClick={() => handleExportExcel(s)} />
                    </Tooltip>
                    <Tooltip label="Excluir">
                      <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(s)} />
                    </Tooltip>
                  </>
                )}
              </HStack>
            </Box>
          ))}
        </VStack>
      );
    }

    return (
      <Box bg={cardBg} borderRadius="lg" boxShadow="sm" borderWidth="1px" borderColor={borderColor} overflow="hidden">
        <TableContainer>
          <Table size="sm">
            <Thead>
              <Tr bg={headerBg}>
                <Th>Fornecedor</Th>
                <Th>Mês/Ano</Th>
                <Th isNumeric>Itens</Th>
                <Th isNumeric>Valor Total</Th>
                <Th>Status</Th>
                <Th textAlign="right">Ações</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredSettlements.map((s) => (
                <Tr key={s.id} _hover={{ bg: hoverBg }}>
                  <Td fontSize="sm">
                    <HStack spacing={1}>
                      <Text>{s.supplierName || getSupplierName(s.codcli)}</Text>
                      {s.missingCount > 0 && (
                        <Tooltip label={`${s.missingCount} tamanho(s) nao incluido(s) no fechamento`}>
                          <Box as="span">
                            <WarningIcon color="red.500" boxSize={3.5} />
                          </Box>
                        </Tooltip>
                      )}
                    </HStack>
                  </Td>
                  <Td fontSize="sm">{monthNames[(s.referenceMonth || 1) - 1]}/{s.referenceYear}</Td>
                  <Td fontSize="sm" isNumeric>{s.totalItems ?? 0}</Td>
                  <Td fontSize="sm" isNumeric>
                    {parseFloat(s.totalDiscounts) > 0 && (
                      <Text fontSize="xs" color="gray.400" textDecoration="line-through">
                        {formatCurrency(s.totalAmount ?? 0)}
                      </Text>
                    )}
                    <Text fontWeight="bold">
                      {formatCurrency(parseFloat(s.totalDiscounts) > 0 ? (s.totalPayable ?? 0) : (s.totalAmount ?? 0))}
                    </Text>
                  </Td>
                  <Td>
                    <Badge colorScheme={s.status === "paid" ? "green" : s.status === "draft" ? "purple" : "yellow"} fontSize="xs">
                      {s.status === "paid" ? "Pago" : s.status === "draft" ? "Rascunho" : "Em Aberto"}
                    </Badge>
                  </Td>
                  <Td textAlign="right">
                    <HStack justify="flex-end" spacing={1}>
                      {s.status === "draft" ? (
                        <>
                          <Button size="xs" colorScheme="purple" variant="outline" onClick={() => handleRestoreDraft(s.id)} isLoading={restoringDraft}>
                            Continuar
                          </Button>
                          <Tooltip label="Excluir rascunho">
                            <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(s)} />
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          <Tooltip label="Ver detalhes">
                            <IconButton icon={<ViewIcon />} size="xs" variant="ghost" aria-label="Ver detalhes" onClick={() => handleViewDetail(s.id)} />
                          </Tooltip>
                          <Tooltip label="Editar">
                            <IconButton icon={<EditIcon />} size="xs" variant="ghost" colorScheme="blue" aria-label="Editar" onClick={() => handleStartEdit(s)} />
                          </Tooltip>
                          <Tooltip label={s.status === "paid" ? "Marcar como em aberto" : "Marcar como pago"}>
                            <IconButton icon={<CheckIcon />} size="xs" variant="ghost" colorScheme={s.status === "paid" ? "yellow" : "green"} aria-label="Alternar status" onClick={() => handleTogglePaid(s)} />
                          </Tooltip>
                          <Tooltip label="Exportar PDF">
                            <IconButton icon={<PdfIcon boxSize={5} />} size="sm" variant="ghost" aria-label="Exportar PDF" onClick={() => handleExportPdf(s)} />
                          </Tooltip>
                          <Tooltip label="Exportar Excel">
                            <IconButton icon={<ExcelIcon boxSize={5} />} size="sm" variant="ghost" aria-label="Exportar Excel" onClick={() => handleExportExcel(s)} />
                          </Tooltip>
                          <Tooltip label="Excluir">
                            <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(s)} />
                          </Tooltip>
                        </>
                      )}
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // ── Render: grouped card row (shared by detail + edit) ────────────────────
  const renderGroupCard = (group, editable) => {
    const groupTotal = group.sizes.reduce((s, sz) => s + sz.total, 0);
    const groupQty = group.sizes.reduce((s, sz) => s + sz.qty, 0);
    const hasEdits = group.hasManualEdits;
    const originalUnitPrice = hasEdits ? group.sizes.find(sz => sz.originalUnitPrice != null)?.originalUnitPrice : null;

    return (
      <Box
        key={group.key}
        borderWidth={group.hasMissing ? "2px" : hasEdits ? "2px" : "1px"}
        borderColor={group.hasMissing ? "red.300" : hasEdits ? "orange.300" : borderColor}
        borderRadius="md"
        p={3}
        _hover={editable ? { borderColor: "blue.200" } : undefined}
      >
        {hasEdits && (
          <Flex align="center" gap={1} mb={1}>
            <EditIcon color="orange.500" boxSize={3} />
            <Text fontSize="xs" color="orange.600" fontWeight="medium">Editado manualmente</Text>
          </Flex>
        )}
        <Flex align={{ base: "stretch", md: "center" }} gap={3} wrap="wrap" flexDirection={{ base: "column", md: "row" }}>
          {/* Left: OF + Etapa + Produto + Cor + Parte */}
          <HStack spacing={3} wrap="wrap" fontSize="sm" flex={{ base: "1 1 100%", md: "0 0 auto" }}>
            <Box minW="60px">
              <Text fontSize="xs" color="gray.500" fontWeight="medium">OF</Text>
              <Text fontWeight="bold">{group.facNumero}</Text>
            </Box>
            {group.facCodsetor && (
              <Box minW="70px">
                <Text fontSize="xs" color="gray.500" fontWeight="medium">Etapa</Text>
                <Text>{group.facCodsetor}{group.facDescsetor ? ` - ${group.facDescsetor}` : ""}</Text>
              </Box>
            )}
            <Box minW="80px">
              <Text fontSize="xs" color="gray.500" fontWeight="medium">Produto</Text>
              <Text fontWeight="medium">{group.facCodigoProduto}</Text>
              {group.facDescProduto && (
                <Text fontSize="xs" color="gray.500" noOfLines={1}>{group.facDescProduto}</Text>
              )}
            </Box>
            <Box minW="70px">
              <Text fontSize="xs" color="gray.500" fontWeight="medium">Cor</Text>
              <Text>{group.facCor}{group.facDesccor && group.facDesccor !== group.facCor ? ` - ${group.facDesccor}` : ""}</Text>
            </Box>
            <Box minW="70px">
              <Text fontSize="xs" color="gray.500" fontWeight="medium">Parte</Text>
              <Text>{group.facParte}{group.facDescparte && group.facDescparte !== group.facParte ? ` - ${group.facDescparte}` : ""}</Text>
            </Box>
          </HStack>

          {/* Center: Sizes grid inline */}
          <Flex wrap="wrap" gap={1} flex={{ base: "1 1 100%", md: "1 1 auto" }} justify={{ base: "flex-start", md: "center" }}>
            {group.sizes.map((sz) => (
              <Tooltip
                key={sz.id}
                label={sz.missing ? "Tamanho nao incluido no fechamento" : sz.manuallyEdited && sz.originalQuantity != null ? `Qtde original: ${sz.originalQuantity}` : ""}
                isDisabled={!sz.missing && !sz.manuallyEdited}
              >
                <Box
                  textAlign="center"
                  minW="52px"
                  borderWidth={sz.missing ? "2px" : sz.manuallyEdited ? "2px" : "1px"}
                  borderColor={sz.missing ? "red.400" : sz.manuallyEdited ? "orange.400" : "gray.200"}
                  borderRadius="md"
                  px={2}
                  py={1}
                  bg={sz.missing ? "red.50" : sz.manuallyEdited ? "orange.50" : "gray.50"}
                  position="relative"
                  opacity={sz.missing ? 0.85 : 1}
                >
                  {sz.missing && editable && (
                    <Box
                      position="absolute"
                      top="-6px"
                      right="-6px"
                      bg="green.500"
                      color="white"
                      borderRadius="full"
                      w="14px"
                      h="14px"
                      fontSize="8px"
                      lineHeight="14px"
                      textAlign="center"
                      cursor="pointer"
                      onClick={() => {
                        const realOfId = String(sz.id).replace("missing-", "");
                        handleReaddItem(realOfId, sz.qty, group.unitPrice);
                      }}
                      _hover={{ bg: "green.600" }}
                      zIndex={1}
                      title="Readicionar ao fechamento"
                    >
                      +
                    </Box>
                  )}
                  {sz.missing && !editable && (
                    <WarningIcon
                      color="red.500"
                      boxSize={2.5}
                      position="absolute"
                      top="1px"
                      right="1px"
                    />
                  )}
                  {sz.manuallyEdited && !sz.missing && (
                    <EditIcon
                      color="orange.500"
                      boxSize={2.5}
                      position="absolute"
                      top="1px"
                      right="1px"
                    />
                  )}
                  <Text fontSize="xs" fontWeight="bold" color={sz.missing ? "red.600" : "gray.600"}>{sz.tam}</Text>
                  {editable && !sz.missing && editingItemId === sz.id && editingItemField === "qty" ? (
                    <Input
                      size="xs"
                      w="48px"
                      textAlign="center"
                      ref={(el) => { if (el) setTimeout(() => el.focus(), 0); }}
                      value={editingItemValue}
                      onChange={(e) => setEditingItemValue(e.target.value.replace(/[^0-9]/g, ""))}
                      onBlur={() => {
                        const newQty = parseFloat(editingItemValue);
                        if (newQty > 0 && newQty !== sz.qty) {
                          handleUpdateItem(sz.id, { quantity: newQty });
                        }
                        setEditingItemId(null);
                        setEditingItemField(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.target.blur();
                        if (e.key === "Escape") { setEditingItemId(null); setEditingItemField(null); }
                      }}
                      p={0}
                      h="20px"
                      fontSize="sm"
                      borderColor="blue.400"
                    />
                  ) : (
                    <Text
                      fontSize="sm"
                      fontWeight="medium"
                      color={sz.missing ? "red.500" : sz.manuallyEdited ? "orange.600" : "inherit"}
                      cursor={editable && !sz.missing ? "pointer" : "default"}
                      onClick={() => {
                        if (editable && !sz.missing) {
                          setEditingItemId(sz.id);
                          setEditingItemField("qty");
                          setEditingItemValue(String(sz.qty));
                        }
                      }}
                      _hover={editable && !sz.missing ? { textDecoration: "underline" } : undefined}
                      title={editable && !sz.missing ? "Clique para editar quantidade" : ""}
                    >
                      {sz.qty}
                    </Text>
                  )}
                  {sz.manuallyEdited && sz.originalQuantity != null && sz.originalQuantity !== sz.qty && (
                    <Text fontSize="8px" color="orange.500" lineHeight="1">{sz.originalQuantity}</Text>
                  )}
                  {editable && !sz.missing && (
                    <Box
                      position="absolute"
                      top="-6px"
                      right="-6px"
                      bg="red.500"
                      color="white"
                      borderRadius="full"
                      w="14px"
                      h="14px"
                      fontSize="8px"
                      lineHeight="14px"
                      textAlign="center"
                      cursor="pointer"
                      onClick={() => handleRemoveItem(sz.id)}
                      _hover={{ bg: "red.600" }}
                      zIndex={1}
                      title="Remover do fechamento"
                    >
                      x
                    </Box>
                  )}
                </Box>
              </Tooltip>
            ))}
          </Flex>

          {/* Right: Price + Total */}
          <Box
            flex={{ base: "1 1 100%", md: "0 0 auto" }}
            minW={{ base: "auto", md: "120px" }}
            textAlign="right"
          >
            <Text fontSize="xs" color="gray.500">Preço Unit</Text>
            {editable && editingGroupPrice === group.key ? (
              <Box display="flex" justifyContent="flex-end">
                <Input
                  size="xs"
                  w="80px"
                  textAlign="right"
                  ref={(el) => { if (el) setTimeout(() => el.focus(), 0); }}
                  value={editingGroupPriceValue}
                  onChange={(e) => setEditingGroupPriceValue(e.target.value.replace(/[^0-9,\.]/g, ""))}
                  onBlur={() => {
                    const newPrice = parseFloat(String(editingGroupPriceValue).replace(",", "."));
                    if (newPrice > 0 && newPrice !== parseFloat(group.unitPrice)) {
                      group.sizes.filter(sz => !sz.missing).forEach(sz => {
                        handleUpdateItem(sz.id, { unitPrice: newPrice });
                      });
                    }
                    setEditingGroupPrice(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.target.blur();
                    if (e.key === "Escape") setEditingGroupPrice(null);
                  }}
                />
              </Box>
            ) : (
              <HStack spacing={1} justify="flex-end">
                {originalUnitPrice != null && parseFloat(originalUnitPrice) !== parseFloat(group.unitPrice) && (
                  <Tooltip label={`Preço original: ${formatCurrency(originalUnitPrice)}`}>
                    <EditIcon color="orange.500" boxSize={3} />
                  </Tooltip>
                )}
                <Text
                  color={originalUnitPrice != null && parseFloat(originalUnitPrice) !== parseFloat(group.unitPrice) ? "orange.600" : "green.600"}
                  fontWeight="medium"
                  fontSize="sm"
                  cursor={editable ? "pointer" : "default"}
                  _hover={editable ? { textDecoration: "underline" } : undefined}
                  title={editable ? "Clique para editar preço" : ""}
                  onClick={() => {
                    if (editable) {
                      setEditingGroupPrice(group.key);
                      setEditingGroupPriceValue(String(parseFloat(group.unitPrice) || 0).replace(".", ","));
                    }
                  }}
                >
                  {formatCurrency(group.unitPrice)}
                </Text>
              </HStack>
            )}
            <Text fontSize="xs" color="gray.500" mt={1}>Total ({groupQty} pcs)</Text>
            <Text fontWeight="bold" color="blue.600">{formatCurrency(groupTotal)}</Text>
          </Box>
        </Flex>
      </Box>
    );
  };

  // ── Render: Detail panel ──────────────────────────────────────────────────
  const renderDetailPanel = () => {
    if (!viewingSettlement) return null;

    const items = viewingSettlement.items || [];
    const missingOfs = viewingSettlement.missingOfs || [];
    const total = parseFloat(viewingSettlement.totalAmount) || items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
    const groups = groupSettlementItems(items, missingOfs);

    return (
      <Box
        bg={detailBg}
        borderRadius="lg"
        borderWidth="1px"
        borderColor={borderColor}
        p={4}
        mt={4}
      >
        <Flex justify="space-between" align="center" mb={3} gap={2}>
          <Heading size="sm" noOfLines={2} flex="1">
            Detalhes - {viewingSettlement.supplierName || getSupplierName(viewingSettlement.codcli)}
          </Heading>
          <IconButton
            icon={<CloseIcon />}
            size="sm"
            variant="ghost"
            aria-label="Fechar detalhes"
            onClick={() => setViewingSettlement(null)}
          />
        </Flex>

        {loadingDetail ? (
          <Center py={6}><Spinner size="md" color="blue.500" /></Center>
        ) : items.length === 0 ? (
          <Box py={6} textAlign="center">
            <Text color="gray.500" fontSize="sm">Nenhum item neste fechamento.</Text>
          </Box>
        ) : (
          <>
            <VStack spacing={3} align="stretch">
              {groupByOfParte(groups).map((ofGroup) => {
                const ofQty = ofGroup.colorGroups.reduce((s, g) => s + g.sizes.filter(sz => !sz.missing).reduce((ss, sz) => ss + sz.qty, 0), 0);
                const ofTotal = ofGroup.colorGroups.reduce((s, g) => s + g.sizes.filter(sz => !sz.missing).reduce((ss, sz) => ss + sz.total, 0), 0);
                const isExpanded = expandedEditGroups.has(ofGroup.key);

                return (
                  <Box key={ofGroup.key} borderWidth="1px" borderColor={borderColor} borderRadius="md" overflow="hidden">
                    <Flex
                      align="center" gap={3} px={3} py={2} bg={headerBg}
                      cursor="pointer" _hover={{ bg: hoverBg }}
                      onClick={() => toggleOfGroup(ofGroup.key, setExpandedEditGroups)}
                    >
                      <Box as={ChevronRightIcon} transform={isExpanded ? "rotate(90deg)" : "rotate(0deg)"} transition="transform 0.2s" boxSize={4} color="gray.500" flex="0 0 auto" />
                      <HStack spacing={4} flex="1" wrap="wrap" fontSize="sm">
                        <Text fontWeight="bold">OF {ofGroup.facNumero}</Text>
                        <Text color="gray.600">{ofGroup.facDescProduto}</Text>
                        {ofGroup.facCodsetor && (
                          <Text color="gray.500">Etapa: {ofGroup.facCodsetor}{ofGroup.facDescsetor ? ` - ${ofGroup.facDescsetor}` : ""}</Text>
                        )}
                        {ofGroup.facParte && (
                          <Text color="gray.500">Parte: {ofGroup.facParte}{ofGroup.facDescparte && ofGroup.facDescparte !== ofGroup.facParte ? ` - ${ofGroup.facDescparte}` : ""}</Text>
                        )}
                      </HStack>
                      <HStack spacing={4} flex="0 0 auto" fontSize="sm">
                        <Badge colorScheme="gray" variant="subtle">{ofGroup.colorGroups.length} {ofGroup.colorGroups.length === 1 ? "cor" : "cores"}</Badge>
                        <Text fontWeight="medium" color="gray.600">{ofQty} pcs</Text>
                        <Text fontWeight="bold" color="blue.600">{formatCurrency(ofTotal)}</Text>
                      </HStack>
                    </Flex>
                    {isExpanded && (
                      <VStack spacing={0} p={2} pt={1} align="stretch">
                        {ofGroup.colorGroups.map((group) => renderGroupCard(group, false))}
                      </VStack>
                    )}
                  </Box>
                );
              })}
            </VStack>
            {(() => {
              const detailDiscounts = viewingSettlement.discounts || [];
              const totalDiscounts = detailDiscounts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
              const totalPayable = Math.max(0, total - totalDiscounts);
              return (
                <>
                  <Flex justify="flex-end" mt={3} pr={2}>
                    <VStack spacing={0} align="flex-end">
                      <HStack spacing={2}>
                        <Text fontWeight="bold" fontSize="sm">{detailDiscounts.length > 0 ? "Subtotal:" : "Total:"}</Text>
                        <Text fontWeight="bold" fontSize="md" color="blue.500">
                          {formatCurrency(total)}
                        </Text>
                      </HStack>
                      {detailDiscounts.length > 0 && (
                        <>
                          {detailDiscounts.map((d) => (
                            <HStack key={d.id} spacing={2}>
                              <Text fontSize="xs" color="red.500">{d.description}:</Text>
                              <Text fontSize="sm" color="red.500" fontWeight="bold">- {formatCurrency(d.amount)}</Text>
                            </HStack>
                          ))}
                          <HStack spacing={2} mt={1}>
                            <Text fontWeight="bold" fontSize="sm">Total a Pagar:</Text>
                            <Text fontWeight="bold" fontSize="md" color="green.500">
                              {formatCurrency(totalPayable)}
                            </Text>
                          </HStack>
                        </>
                      )}
                    </VStack>
                  </Flex>
                </>
              );
            })()}
          </>
        )}
      </Box>
    );
  };

  // ── Group items by OF/Product/Color/Part ──────────────────────────────────
  const SIZE_ORDER = ["pre", "rn", "p", "m", "g", "gg",
    "1", "2", "3", "4", "6", "8", "10", "12", "14", "16"];

  const sortSizes = useCallback((sizes) => {
    return [...sizes].sort((a, b) => {
      const ta = String(a.tam || "").trim().toLowerCase();
      const tb = String(b.tam || "").trim().toLowerCase();
      const ia = SIZE_ORDER.indexOf(ta);
      const ib = SIZE_ORDER.indexOf(tb);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      const na = parseFloat(ta);
      const nb = parseFloat(tb);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return ta.localeCompare(tb);
    });
  }, []);

  const groupUnsettledOfs = useCallback((ofs, globalOfs) => {
    const groups = [];
    const map = new Map();
    ofs.forEach((of) => {
      // Use global index from unsettledOfs so selectedOfs indices match
      const globalIndex = globalOfs ? globalOfs.indexOf(of) : ofs.indexOf(of);
      const key = `${of.fac_numero}|${of.fac_codsetor || ''}|${of.fac_codigo_produto}|${of.fac_cor}|${of.fac_parte}`;
      if (!map.has(key)) {
        const priceInfo = getOfPriceInfo(of);
        const group = {
          key,
          facNumero: of.fac_numero,
          facCodcli: of.fac_codcli,
          clienteNome: of.cliente_nome,
          facCodsetor: of.fac_codsetor,
          facDescsetor: of.fac_descsetor,
          facCodigoProduto: of.fac_codigo_produto,
          facDescProduto: of.fac_desc_produto,
          facCor: of.fac_cor,
          facDesccor: of.fac_desccor,
          facParte: of.fac_parte,
          facDescparte: of.fac_descparte,
          priceInfo,
          tablePrice: priceInfo?.price ?? null,
          sizes: [],
          indices: []
        };
        map.set(key, group);
        groups.push(group);
      }
      const g = map.get(key);
      g.sizes.push({
        index: globalIndex,
        tam: of.fac_tam,
        qty: parseFloat(of.fac_quant) || 0,
        ofId: of.id
      });
      g.indices.push(globalIndex);
    });
    for (const group of groups) {
      group.sizes = sortSizes(group.sizes);
    }
    return groups;
  }, [sortSizes, getOfPriceInfo]);

  const groupSettlementItems = useCallback((items, missingOfs = []) => {
    const groups = [];
    const map = new Map();
    for (const item of items) {
      const key = `${item.facNumero}|${item.facCodsetor || ''}|${item.facCodigoProduto}|${item.facCor}|${item.facParte}`;
      if (!map.has(key)) {
        const group = {
          key,
          facNumero: item.facNumero,
          facCodsetor: item.facCodsetor,
          facDescsetor: item.facDescsetor,
          facCodigoProduto: item.facCodigoProduto,
          facDescProduto: item.facDescProduto,
          facCor: item.facCor,
          facDesccor: item.facDesccor,
          facParte: item.facParte,
          facDescparte: item.facDescparte,
          unitPrice: item.unitPrice,
          sizes: [],
          hasMissing: false,
          hasManualEdits: false
        };
        map.set(key, group);
        groups.push(group);
      }
      const g = map.get(key);
      const isEdited = item.manuallyEdited === true;
      if (isEdited) g.hasManualEdits = true;
      g.sizes.push({
        id: item.id,
        tam: item.facTam,
        qty: parseFloat(item.quantity) || 0,
        total: parseFloat(item.totalPrice) || (parseFloat(item.unitPrice) || 0) * (parseFloat(item.quantity) || 0),
        missing: false,
        manuallyEdited: isEdited,
        originalQuantity: isEdited ? parseFloat(item.originalQuantity) || null : null,
        originalUnitPrice: isEdited ? parseFloat(item.originalUnitPrice) || null : null
      });
    }
    // Add missing OFs as missing sizes
    for (const mof of missingOfs) {
      const key = `${mof.facNumero}|${mof.facCodsetor || ''}|${mof.facCodigoProduto}|${mof.facCor}|${mof.facParte}`;
      const g = map.get(key);
      if (g) {
        g.sizes.push({
          id: `missing-${mof.id}`,
          tam: mof.facTam,
          qty: parseFloat(mof.facQuant) || 0,
          total: 0,
          missing: true
        });
        g.hasMissing = true;
      }
    }
    // Sort sizes within each group
    for (const group of groups) {
      group.sizes = sortSizes(group.sizes);
    }
    return groups;
  }, [sortSizes]);

  // ── Group color-level groups into OF/Parte accordion groups ──────────────
  const groupByOfParte = useCallback((colorGroups) => {
    const map = new Map();
    const result = [];
    for (const cg of colorGroups) {
      const key = `${cg.facNumero}|${cg.facCodsetor || ''}|${cg.facParte || ''}`;
      if (!map.has(key)) {
        const g = {
          key,
          facNumero: cg.facNumero,
          facCodsetor: cg.facCodsetor,
          facDescsetor: cg.facDescsetor,
          facParte: cg.facParte,
          facDescparte: cg.facDescparte,
          facDescProduto: cg.facDescProduto || cg.facCodigoProduto,
          colorGroups: []
        };
        map.set(key, g);
        result.push(g);
      }
      map.get(key).colorGroups.push(cg);
    }
    return result;
  }, []);

  const toggleOfGroup = useCallback((key, setter) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── Render: Edit Settlement Panel ─────────────────────────────────────────
  const renderEditPanel = () => {
    if (!editingSettlement) return null;

    const items = editingSettlement.items || [];
    const missingOfs = editingSettlement.missingOfs || [];
    const total = parseFloat(editingSettlement.totalAmount) || items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
    const groups = groupSettlementItems(items, missingOfs);

    return (
      <Box
        bg={cardBg}
        borderRadius="lg"
        borderWidth="2px"
        borderColor="orange.300"
        p={isMobile ? 3 : 5}
        mb={6}
      >
        <Flex justify="space-between" align="center" mb={4} gap={2}>
          <Heading size="sm" noOfLines={2} flex="1">
            Editar Fechamento - {editingSettlement.supplierName || getSupplierName(editingSettlement.codcli)}
          </Heading>
          <IconButton
            icon={<CloseIcon />}
            size="sm"
            variant="ghost"
            aria-label="Fechar"
            onClick={handleCancelEdit}
          />
        </Flex>

        <Flex gap={3} mb={4} wrap="wrap" align="center">
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>Mês de Referência</Text>
            <Select
              size="sm"
              value={editMonth || 1}
              onChange={(e) => setEditMonth(parseInt(e.target.value))}
              w="150px"
            >
              {monthNames.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </Select>
          </Box>
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>Ano</Text>
            <Select
              size="sm"
              value={editYear || getSaoPauloYear()}
              onChange={(e) => setEditYear(parseInt(e.target.value))}
              w="90px"
            >
              {Array.from({ length: 5 }, (_, i) => getSaoPauloYear() - 2 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Box>
          <Badge colorScheme={editingSettlement.status === "paid" ? "green" : "yellow"} alignSelf="flex-end" mb={1}>
            {editingSettlement.status === "paid" ? "Pago" : editingSettlement.status === "draft" ? "Rascunho" : "Em Aberto"}
          </Badge>
        </Flex>

        {items.length === 0 ? (
          <Box py={6} textAlign="center">
            <Text color="gray.500" fontSize="sm">Nenhum item neste fechamento.</Text>
          </Box>
        ) : (
          <VStack spacing={3} align="stretch">
            {groupByOfParte(groups).map((ofGroup) => {
              const ofQty = ofGroup.colorGroups.reduce((s, g) => s + g.sizes.filter(sz => !sz.missing).reduce((ss, sz) => ss + sz.qty, 0), 0);
              const ofTotal = ofGroup.colorGroups.reduce((s, g) => s + g.sizes.filter(sz => !sz.missing).reduce((ss, sz) => ss + sz.total, 0), 0);
              const isExpanded = expandedEditGroups.has(ofGroup.key);

              return (
                <Box
                  key={ofGroup.key}
                  borderWidth="1px"
                  borderColor={borderColor}
                  borderRadius="md"
                  overflow="hidden"
                >
                  <Flex
                    align="center"
                    gap={3}
                    px={3}
                    py={2}
                    bg={headerBg}
                    cursor="pointer"
                    _hover={{ bg: hoverBg }}
                    onClick={() => toggleOfGroup(ofGroup.key, setExpandedEditGroups)}
                  >
                    <Box
                      as={ChevronRightIcon}
                      transform={isExpanded ? "rotate(90deg)" : "rotate(0deg)"}
                      transition="transform 0.2s"
                      boxSize={4}
                      color="gray.500"
                      flex="0 0 auto"
                    />
                    <HStack spacing={4} flex="1" wrap="wrap" fontSize="sm">
                      <Text fontWeight="bold">OF {ofGroup.facNumero}</Text>
                      <Text color="gray.600">{ofGroup.facDescProduto}</Text>
                      {ofGroup.facCodsetor && (
                        <Text color="gray.500">Etapa: {ofGroup.facCodsetor}{ofGroup.facDescsetor ? ` - ${ofGroup.facDescsetor}` : ""}</Text>
                      )}
                      {ofGroup.facParte && (
                        <Text color="gray.500">Parte: {ofGroup.facParte}{ofGroup.facDescparte && ofGroup.facDescparte !== ofGroup.facParte ? ` - ${ofGroup.facDescparte}` : ""}</Text>
                      )}
                    </HStack>
                    <HStack spacing={4} flex="0 0 auto" fontSize="sm">
                      <Badge colorScheme="gray" variant="subtle">{ofGroup.colorGroups.length} {ofGroup.colorGroups.length === 1 ? "cor" : "cores"}</Badge>
                      <Text fontWeight="medium" color="gray.600">{ofQty} pcs</Text>
                      <Text fontWeight="bold" color="blue.600">{formatCurrency(ofTotal)}</Text>
                    </HStack>
                  </Flex>
                  {isExpanded && (
                    <VStack spacing={0} p={2} pt={1} align="stretch">
                      {ofGroup.colorGroups.map((group) => renderGroupCard(group, true))}
                    </VStack>
                  )}
                </Box>
              );
            })}
          </VStack>
        )}

        {(() => {
          const editDiscounts = editingSettlement.discounts || [];
          const totalDiscounts = editDiscounts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
          const totalPayable = Math.max(0, total - totalDiscounts);
          return (
            <>
              <Flex justify="flex-end" mt={4} pr={2}>
                <VStack spacing={0} align="flex-end">
                  <HStack spacing={2}>
                    <Text fontWeight="bold" fontSize="sm">{editDiscounts.length > 0 ? "Subtotal:" : "Total Geral:"}</Text>
                    <Text fontWeight="bold" fontSize="lg" color="blue.500">
                      {formatCurrency(total)}
                    </Text>
                  </HStack>
                  {editDiscounts.length > 0 && (
                    <>
                      <HStack spacing={2}>
                        <Text fontSize="sm" color="red.500">Descontos:</Text>
                        <Text fontSize="sm" color="red.500" fontWeight="bold">
                          - {formatCurrency(totalDiscounts)}
                        </Text>
                      </HStack>
                      <HStack spacing={2}>
                        <Text fontWeight="bold" fontSize="sm">Total a Pagar:</Text>
                        <Text fontWeight="bold" fontSize="lg" color="green.500">
                          {formatCurrency(totalPayable)}
                        </Text>
                      </HStack>
                    </>
                  )}
                </VStack>
              </Flex>

              {/* Discounts grid */}
              <Box mt={4} borderWidth="1px" borderColor={borderColor} borderRadius="md" p={3}>
                <Text fontSize="sm" fontWeight="bold" mb={2}>Descontos</Text>
                {editDiscounts.length > 0 && (
                  <VStack align="stretch" spacing={1} mb={2}>
                    {editDiscounts.map((disc) => (
                      <Flex key={disc.id} align="center" gap={2} bg="red.50" px={2} py={1} borderRadius="md">
                        <Text fontSize="sm" flex="1">{disc.description}</Text>
                        <Text fontSize="sm" fontWeight="bold" color="red.500">- {formatCurrency(disc.amount)}</Text>
                        <IconButton
                          icon={<CloseIcon />}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          aria-label="Remover desconto"
                          onClick={() => handleRemoveEditDiscount(disc.id)}
                        />
                      </Flex>
                    ))}
                  </VStack>
                )}
                <Flex gap={2} align="center">
                  <Input
                    size="sm"
                    placeholder="Descricao do desconto"
                    value={editDiscDesc}
                    onChange={(e) => setEditDiscDesc(e.target.value)}
                    flex="1"
                  />
                  <InputGroup size="sm" w="140px">
                    <InputLeftElement pointerEvents="none" fontSize="xs" color="gray.500">R$</InputLeftElement>
                    <Input
                      placeholder="0,00"
                      value={editDiscAmount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9,\.]/g, "");
                        setEditDiscAmount(v);
                      }}
                      textAlign="right"
                      pl="10"
                    />
                  </InputGroup>
                  <IconButton
                    icon={<AddIcon />}
                    size="sm"
                    colorScheme="blue"
                    variant="outline"
                    aria-label="Adicionar desconto"
                    onClick={async () => {
                      const desc = editDiscDesc.trim();
                      const amt = parseFloat(String(editDiscAmount).replace(",", "."));
                      if (!desc || !amt || amt <= 0) return;
                      await handleAddEditDiscount(desc, amt);
                      setEditDiscDesc("");
                      setEditDiscAmount("");
                    }}
                    isDisabled={!editDiscDesc.trim() || !editDiscAmount || parseFloat(String(editDiscAmount).replace(",", ".")) <= 0}
                  />
                </Flex>
              </Box>

              <Box mt={4}>
                <Text fontSize="sm" fontWeight="medium" mb={1}>Observacoes</Text>
                <Textarea
                  size="sm"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Observacoes sobre o fechamento..."
                  rows={3}
                />
              </Box>

              <HStack spacing={3} mt={4} justify="flex-end">
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  Cancelar
                </Button>
                <Button
                  colorScheme="blue"
                  size="sm"
                  onClick={handleSaveEdit}
                  isLoading={savingEdit}
                  loadingText="Salvando..."
                >
                  Salvar
                </Button>
              </HStack>
            </>
          );
        })()}
      </Box>
    );
  };

  // ── Render: New Settlement Creation ───────────────────────────────────────
  const renderNewSettlement = () => {
    if (!creating) return null;

    return (
      <Box
        bg={cardBg}
        borderRadius="lg"
        borderWidth="2px"
        borderColor="blue.300"
        p={isMobile ? 3 : 5}
        mb={6}
      >
        <Flex justify="space-between" align="center" mb={4}>
          <HStack spacing={2}>
            <Heading size="sm">{activeDraftId ? "Continuar Rascunho" : "Novo Fechamento"}</Heading>
            {activeDraftId && <Badge colorScheme="purple" fontSize="2xs">#{activeDraftId}</Badge>}
          </HStack>
          <IconButton
            icon={<CloseIcon />}
            size="sm"
            variant="ghost"
            aria-label="Fechar"
            onClick={handleCancelCreate}
          />
        </Flex>

        {/* Supplier + period + OF search selectors */}
        <Flex gap={3} mb={3} wrap="wrap" align="flex-end">
          <Box flex={isMobile ? "1 1 100%" : "0 0 auto"}>
            <Text fontSize="xs" color="gray.500" mb={1}>Fornecedor</Text>
            <SearchableSelect
              size="sm"
              placeholder="Selecione o fornecedor"
              value={newSupplier}
              onChange={(val) => handleNewSupplierChange(val)}
              w={isMobile ? "100%" : "260px"}
              options={suppliers.map((s) => ({ value: s.codcli, label: `${s.codcli} - ${s.nome || s.codcli}` }))}
            />
          </Box>
          <Box flex={{ base: "1 1 calc(50% - 6px)", md: "0 0 auto" }}>
            <Text fontSize="xs" color="gray.500" mb={1}>De</Text>
            <Input
              size="sm"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              w={{ base: "100%", md: "160px" }}
            />
          </Box>
          <Box flex={{ base: "1 1 calc(50% - 6px)", md: "0 0 auto" }}>
            <Text fontSize="xs" color="gray.500" mb={1}>Ate</Text>
            <Input
              size="sm"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              w={{ base: "100%", md: "160px" }}
            />
          </Box>
        </Flex>
        <Flex gap={3} mb={4} wrap="wrap" align="flex-end">
          <Box flex={isMobile ? "1 1 100%" : "0 0 auto"}>
            <Text fontSize="xs" color="gray.500" mb={1}>Buscar OFs (separadas por vírgula)</Text>
            <InputGroup size="sm" w={isMobile ? "100%" : "400px"}>
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input
                ref={ofSearchNewRef}
                placeholder="Ex: 12345, 12346, 12347"
                defaultValue={ofSearchNew}
                onKeyDown={(e) => { if (e.key === "Enter") handleOfSearch(); }}
              />
            </InputGroup>
          </Box>
          <Button
            size="sm"
            colorScheme="blue"
            leftIcon={<SearchIcon />}
            onClick={handleOfSearch}
            isLoading={loadingOfs}
          >
            Buscar
          </Button>
        </Flex>

        {/* Mês de referência do fechamento */}
        <Flex gap={3} mb={3} wrap="wrap" align="flex-end">
          <Box flex={{ base: "1 1 calc(50% - 6px)", md: "0 0 auto" }}>
            <Text fontSize="xs" color="gray.500" mb={1}>Mês de Referência</Text>
            <Select
              size="sm"
              value={newMonth}
              onChange={(e) => setNewMonth(parseInt(e.target.value))}
              w={{ base: "100%", md: "160px" }}
            >
              {monthNames.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </Select>
          </Box>
          <Box flex={{ base: "1 1 calc(50% - 6px)", md: "0 0 auto" }}>
            <Text fontSize="xs" color="gray.500" mb={1}>Ano</Text>
            <Select
              size="sm"
              value={newYear}
              onChange={(e) => setNewYear(parseInt(e.target.value))}
              w={{ base: "100%", md: "100px" }}
            >
              {Array.from({ length: 5 }, (_, i) => getSaoPauloYear() - 2 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Box>
        </Flex>

        {/* Etapa filter (shown when OFs are loaded and have etapas) */}
        {unsettledOfs.length > 0 && availableEtapas.length > 1 && (
          <Flex gap={3} mb={3} align="center">
            <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">Filtrar por Etapa:</Text>
            <Select
              size="sm"
              placeholder="Todas as etapas"
              value={etapaFilter}
              onChange={(e) => setEtapaFilter(e.target.value)}
              w={isMobile ? "100%" : "250px"}
            >
              {availableEtapas.map(([code, desc]) => (
                <option key={code} value={code}>
                  {code} - {desc}
                </option>
              ))}
            </Select>
          </Flex>
        )}

        {/* Unsettled OFs table */}
        {loadingOfs ? (
          <Center py={6}><Spinner size="md" color="blue.500" /></Center>
        ) : unsettledOfs.length === 0 && (newSupplier || ofSearchNew.trim()) ? (
          <Box py={6} textAlign="center">
            <Text color="gray.500" fontSize="sm">Nenhuma OF pendente encontrada com os filtros informados.</Text>
          </Box>
        ) : unsettledOfs.length === 0 ? (
          <Box py={6} textAlign="center">
            <Text color="gray.500" fontSize="sm">Informe pelo menos um filtro (fornecedor, OFs ou período) e clique em Buscar.</Text>
          </Box>
        ) : unsettledOfs.length > 0 ? (
          <>
            <HStack spacing={2} mb={3}>
              <Button size="xs" variant="outline" onClick={handleSelectAll}>
                Selecionar Todos
              </Button>
              <Button size="xs" variant="outline" onClick={handleDeselectAll}>
                Desmarcar Todos
              </Button>
              <Text fontSize="xs" color="gray.500">
                {(() => {
                  let count = 0;
                  for (const of_ of filteredUnsettledOfs) {
                    if (selectedOfs.has(unsettledOfs.indexOf(of_))) count++;
                  }
                  return count;
                })()} de {filteredUnsettledOfs.length} selecionados
                {etapaFilter && ` (filtrado de ${unsettledOfs.length})`}
              </Text>
            </HStack>

            <VStack align="stretch" spacing={2}>
              {groupByOfParte(groupUnsettledOfs(filteredUnsettledOfs, unsettledOfs)).map((ofGroup) => {
                // Compute OF/Parte-level totals
                let ofGroupQty = 0;
                let ofGroupTotal = 0;
                let ofGroupAllSelected = true;
                let ofGroupSomeSelected = false;
                const allOfIndices = [];

                ofGroup.colorGroups.forEach((group) => {
                  const firstIndex = group.indices[0];
                  const manualVal = manualPrices[`${firstIndex}`];
                  const groupPriceKey = group.key;
                  const groupPriceEdited = editedGroupPrices[groupPriceKey];
                  const tablePriceVal = group.tablePrice;
                  const effectivePrice = groupPriceEdited !== undefined && groupPriceEdited !== ""
                    ? (parseFloat(String(groupPriceEdited).replace(",", ".")) || 0)
                    : tablePriceVal != null
                      ? tablePriceVal
                      : (manualVal !== undefined && manualVal !== "" ? parseFloat(manualVal) || 0 : null);

                  group.sizes.forEach((sz) => {
                    allOfIndices.push(sz.index);
                    const isSelected = selectedOfs.has(sz.index);
                    if (isSelected) {
                      ofGroupSomeSelected = true;
                      const q = editedQuantities[sz.index] !== undefined
                        ? (parseFloat(editedQuantities[sz.index]) || 0)
                        : sz.qty;
                      ofGroupQty += q;
                      if (effectivePrice != null) ofGroupTotal += effectivePrice * q;
                    } else {
                      ofGroupAllSelected = false;
                    }
                  });
                });
                if (allOfIndices.length === 0) ofGroupAllSelected = false;

                const isExpanded = expandedOfGroups.has(ofGroup.key);

                const toggleOfGroupSelect = () => {
                  setSelectedOfs((prev) => {
                    const next = new Set(prev);
                    if (ofGroupAllSelected) {
                      allOfIndices.forEach((i) => next.delete(i));
                    } else {
                      allOfIndices.forEach((i) => next.add(i));
                    }
                    return next;
                  });
                };

                return (
                  <Box
                    key={ofGroup.key}
                    borderWidth="1px"
                    borderColor={ofGroupSomeSelected ? "blue.300" : borderColor}
                    borderRadius="md"
                    overflow="hidden"
                    transition="all 0.15s"
                  >
                    {/* Accordion header */}
                    <Flex
                      align="center"
                      gap={3}
                      px={3}
                      py={2}
                      bg={ofGroupAllSelected ? selectedRowBg : headerBg}
                      cursor="pointer"
                      _hover={{ bg: ofGroupAllSelected ? selectedRowBg : hoverBg }}
                      onClick={() => toggleOfGroup(ofGroup.key, setExpandedOfGroups)}
                    >
                      <Checkbox
                        isChecked={ofGroupAllSelected}
                        isIndeterminate={ofGroupSomeSelected && !ofGroupAllSelected}
                        onChange={(e) => { e.stopPropagation(); toggleOfGroupSelect(); }}
                        colorScheme="blue"
                        flex="0 0 auto"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Box
                        as={ChevronRightIcon}
                        transform={isExpanded ? "rotate(90deg)" : "rotate(0deg)"}
                        transition="transform 0.2s"
                        boxSize={4}
                        color="gray.500"
                        flex="0 0 auto"
                      />
                      <HStack spacing={4} flex="1" wrap="wrap" fontSize="sm">
                        <Text fontWeight="bold">OF {ofGroup.facNumero}</Text>
                        <Text color="gray.600">{ofGroup.facDescProduto}</Text>
                        {ofGroup.facCodsetor && (
                          <Text color="gray.500">Etapa: {ofGroup.facCodsetor}{ofGroup.facDescsetor ? ` - ${ofGroup.facDescsetor}` : ""}</Text>
                        )}
                        {ofGroup.facParte && (
                          <Text color="gray.500">Parte: {ofGroup.facParte}{ofGroup.facDescparte && ofGroup.facDescparte !== ofGroup.facParte ? ` - ${ofGroup.facDescparte}` : ""}</Text>
                        )}
                      </HStack>
                      <HStack spacing={4} flex="0 0 auto" fontSize="sm">
                        <Badge colorScheme="gray" variant="subtle">{ofGroup.colorGroups.length} {ofGroup.colorGroups.length === 1 ? "cor" : "cores"}</Badge>
                        <Text fontWeight="medium" color="gray.600">{ofGroupQty} pcs</Text>
                        <Text fontWeight="bold" color="blue.600">{formatCurrency(ofGroupTotal)}</Text>
                      </HStack>
                    </Flex>

                    {/* Expanded color-level details */}
                    {isExpanded && (
                      <VStack align="stretch" spacing={0} p={2} pt={1}>
                        {ofGroup.colorGroups.map((group) => {
                const allSelected = group.indices.every((i) => selectedOfs.has(i));
                const someSelected = group.indices.some((i) => selectedOfs.has(i));
                const hasError = group.priceInfo && !group.priceInfo.price && group.priceInfo.error;
                const firstIndex = group.indices[0];
                const manualVal = manualPrices[`${firstIndex}`];
                const groupPriceKey = group.key;
                const groupPriceEdited = editedGroupPrices[groupPriceKey];
                const tablePriceVal = group.tablePrice;
                const effectivePrice = groupPriceEdited !== undefined && groupPriceEdited !== ""
                  ? (parseFloat(String(groupPriceEdited).replace(",", ".")) || 0)
                  : tablePriceVal != null
                    ? tablePriceVal
                    : (manualVal !== undefined && manualVal !== "" ? parseFloat(manualVal) || 0 : null);
                const priceFound = effectivePrice != null && effectivePrice > 0;
                const isPriceManuallyEdited = groupPriceEdited !== undefined && groupPriceEdited !== "" && tablePriceVal != null && parseFloat(String(groupPriceEdited).replace(",", ".")) !== tablePriceVal;
                const selectedQty = group.sizes
                  .filter((sz) => selectedOfs.has(sz.index))
                  .reduce((s, sz) => {
                    const q = editedQuantities[sz.index] !== undefined
                      ? (parseFloat(editedQuantities[sz.index]) || 0)
                      : sz.qty;
                    return s + q;
                  }, 0);
                const groupTotal = effectivePrice != null ? effectivePrice * selectedQty : 0;

                const toggleGroup = () => {
                  setSelectedOfs((prev) => {
                    const next = new Set(prev);
                    if (allSelected) {
                      group.indices.forEach((i) => next.delete(i));
                    } else {
                      group.indices.forEach((i) => next.add(i));
                    }
                    return next;
                  });
                };

                return (
                  <Box
                    key={group.key}
                    borderWidth={hasError ? "2px" : "1px"}
                    borderColor={hasError ? "red.300" : someSelected ? "blue.300" : borderColor}
                    borderRadius="md"
                    p={3}
                    mt={1}
                    bg={allSelected ? selectedRowBg : undefined}
                    _hover={{ borderColor: "blue.200" }}
                    transition="all 0.15s"
                  >
                    <Flex align={{ base: "stretch", md: "center" }} gap={3} wrap="wrap" flexDirection={{ base: "column", md: "row" }}>
                      {/* Checkbox do grupo */}
                      <Checkbox
                        isChecked={allSelected}
                        isIndeterminate={someSelected && !allSelected}
                        onChange={toggleGroup}
                        colorScheme="blue"
                        flex="0 0 auto"
                        alignSelf="flex-start"
                      />

                      {/* Left: Cor info */}
                      <HStack spacing={3} wrap="wrap" fontSize="sm" flex={{ base: "1 1 100%", md: "0 0 auto" }}>
                        {!newSupplier && group.facCodcli && (
                          <Box minW="100px">
                            <Text fontSize="xs" color="gray.500" fontWeight="medium">Fornecedor</Text>
                            <Text fontSize="xs" noOfLines={1}>{group.facCodcli} - {group.clienteNome || group.facCodcli}</Text>
                          </Box>
                        )}
                        {group.facCodsetor && (
                          <Box minW="70px">
                            <Text fontSize="xs" color="gray.500" fontWeight="medium">Etapa</Text>
                            <Text>{group.facCodsetor}{group.facDescsetor ? ` - ${group.facDescsetor}` : ""}</Text>
                          </Box>
                        )}
                        <Box minW="70px">
                          <Text fontSize="xs" color="gray.500" fontWeight="medium">Cor</Text>
                          <Text>{group.facCor}{group.facDesccor && group.facDesccor !== group.facCor ? ` - ${group.facDesccor}` : ""}</Text>
                        </Box>
                      </HStack>

                      {/* Center: Sizes grid - click to edit qty, X to exclude */}
                      <Flex wrap="wrap" gap={1} flex={{ base: "1 1 100%", md: "1 1 auto" }} justify={{ base: "flex-start", md: "center" }}>
                        {group.sizes.map((sz) => {
                          const isSelected = selectedOfs.has(sz.index);
                          const isEditing = editingSize === sz.index;
                          const editedQty = editedQuantities[sz.index];
                          const displayQty = editedQty !== undefined ? parseFloat(editedQty) || 0 : sz.qty;
                          const isQtyEdited = editedQty !== undefined && parseFloat(editedQty) !== sz.qty;
                          return (
                            <Box
                              key={sz.index}
                              textAlign="center"
                              minW="52px"
                              borderWidth={isQtyEdited ? "2px" : "1px"}
                              borderColor={!isSelected ? "gray.200" : isQtyEdited ? "orange.400" : "blue.400"}
                              borderRadius="md"
                              px={2}
                              py={1}
                              bg={!isSelected ? "gray.50" : isQtyEdited ? "orange.50" : "blue.50"}
                              opacity={isSelected ? 1 : 0.4}
                              position="relative"
                              transition="all 0.15s"
                            >
                              {/* X button to exclude size */}
                              {isSelected && (
                                <Box
                                  position="absolute"
                                  top="-6px"
                                  right="-6px"
                                  bg="red.500"
                                  color="white"
                                  borderRadius="full"
                                  w="14px"
                                  h="14px"
                                  fontSize="8px"
                                  lineHeight="14px"
                                  textAlign="center"
                                  cursor="pointer"
                                  onClick={(e) => { e.stopPropagation(); toggleOfSelection(sz.index); setEditingSize(null); }}
                                  _hover={{ bg: "red.600" }}
                                  zIndex={1}
                                >
                                  x
                                </Box>
                              )}
                              {/* Re-include excluded size */}
                              {!isSelected && (
                                <Box
                                  position="absolute"
                                  top="-6px"
                                  right="-6px"
                                  bg="green.500"
                                  color="white"
                                  borderRadius="full"
                                  w="14px"
                                  h="14px"
                                  fontSize="8px"
                                  lineHeight="14px"
                                  textAlign="center"
                                  cursor="pointer"
                                  onClick={(e) => { e.stopPropagation(); toggleOfSelection(sz.index); }}
                                  _hover={{ bg: "green.600" }}
                                  zIndex={1}
                                >
                                  +
                                </Box>
                              )}
                              <Text fontSize="xs" fontWeight="bold" color={isSelected ? "blue.700" : "gray.400"}>{sz.tam}</Text>
                              {isEditing ? (
                                <Input
                                  size="xs"
                                  w="48px"
                                  textAlign="center"
                                  ref={(el) => { if (el) setTimeout(() => el.focus(), 0); }}
                                  value={editedQty !== undefined ? editedQty : String(sz.qty)}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, "");
                                    setEditedQuantities((prev) => ({ ...prev, [sz.index]: val }));
                                  }}
                                  onBlur={() => setTimeout(() => setEditingSize((cur) => cur === sz.index ? null : cur), 150)}
                                  onKeyDown={(e) => { if (e.key === "Enter") setEditingSize(null); if (e.key === "Escape") { setEditedQuantities((prev) => { const n = { ...prev }; delete n[sz.index]; return n; }); setEditingSize(null); } }}
                                  p={0}
                                  h="20px"
                                  fontSize="sm"
                                  borderColor="blue.400"
                                />
                              ) : (
                                <Text
                                  fontSize="sm"
                                  fontWeight="medium"
                                  color={!isSelected ? "gray.400" : isQtyEdited ? "orange.600" : "inherit"}
                                  cursor={isSelected ? "pointer" : "default"}
                                  onClick={() => { if (isSelected) setEditingSize(sz.index); }}
                                  _hover={isSelected ? { textDecoration: "underline" } : undefined}
                                  title={isSelected ? "Clique para editar quantidade" : ""}
                                >
                                  {displayQty}
                                </Text>
                              )}
                              {isQtyEdited && (
                                <Text fontSize="8px" color="orange.500" lineHeight="1">{sz.qty}</Text>
                              )}
                            </Box>
                          );
                        })}
                      </Flex>

                      {/* Right: Price + Total */}
                      <Box
                        flex={{ base: "1 1 100%", md: "0 0 auto" }}
                        minW={{ base: "auto", md: "120px" }}
                        textAlign="right"
                      >
                        <Text fontSize="xs" color="gray.500">Preço Unit</Text>
                        {group.tablePrice != null && groupPriceEdited === undefined ? (
                          <Tooltip label="Clique para editar preço">
                            <Text
                              color="green.600"
                              fontWeight="medium"
                              fontSize="sm"
                              cursor="pointer"
                              _hover={{ textDecoration: "underline" }}
                              onClick={() => setEditedGroupPrices((prev) => ({ ...prev, [groupPriceKey]: String(group.tablePrice).replace(".", ",") }))}
                            >
                              {formatCurrency(group.tablePrice)}
                            </Text>
                          </Tooltip>
                        ) : groupPriceEdited !== undefined ? (
                          <Box display="flex" justifyContent="flex-end">
                            <HStack spacing={1}>
                              {isPriceManuallyEdited && (
                                <Tooltip label={`Preço original: ${formatCurrency(tablePriceVal)}`}>
                                  <EditIcon color="orange.500" boxSize={3} />
                                </Tooltip>
                              )}
                              <Input
                                size="xs"
                                w="80px"
                                placeholder="0,00"
                                textAlign="right"
                                autoFocus
                                value={groupPriceEdited}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9,\.]/g, "");
                                  setEditedGroupPrices((prev) => ({ ...prev, [groupPriceKey]: val }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape" && tablePriceVal != null) {
                                    setEditedGroupPrices((prev) => { const n = { ...prev }; delete n[groupPriceKey]; return n; });
                                  }
                                }}
                              />
                            </HStack>
                          </Box>
                        ) : (
                          <Box display="flex" justifyContent="flex-end">
                            <HStack spacing={1}>
                              <Tooltip label={group.priceInfo?.error || "Preço não encontrado"}>
                                <WarningIcon color="red.500" boxSize={3} />
                              </Tooltip>
                              <Input
                                size="xs"
                                w="80px"
                                placeholder="0,00"
                                textAlign="right"
                                value={manualVal ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setManualPrices((prev) => {
                                    const next = { ...prev };
                                    group.indices.forEach((i) => { next[`${i}`] = val; });
                                    return next;
                                  });
                                }}
                              />
                            </HStack>
                          </Box>
                        )}
                        {selectedQty > 0 && effectivePrice != null && (
                          <>
                            <Text fontSize="xs" color="gray.500" mt={1}>Total ({selectedQty} pcs)</Text>
                            <Text fontWeight="bold" color="blue.600">{formatCurrency(groupTotal)}</Text>
                          </>
                        )}
                      </Box>
                    </Flex>
                    {hasError && (
                      <Text fontSize="xs" color="red.600" fontWeight="medium" mt={1}>
                        {group.priceInfo.error}
                      </Text>
                    )}
                  </Box>
                );
                        })}
                      </VStack>
                    )}
                  </Box>
                );
              })}
            </VStack>

            <Flex justify="flex-end" mt={3} pr={2}>
              <VStack spacing={0} align="flex-end">
                <HStack spacing={2}>
                  <Text fontSize="sm" color="gray.500">Total de Pecas:</Text>
                  <Text fontSize="sm" fontWeight="bold">
                    {newSettlementPcs.toLocaleString("pt-BR")}
                  </Text>
                </HStack>
                <HStack spacing={2}>
                  <Text fontWeight="bold" fontSize="sm">{newDiscounts.length > 0 ? "Subtotal:" : "Total Selecionado:"}</Text>
                  <Text fontWeight="bold" fontSize="lg" color="blue.500">
                    {formatCurrency(newSettlementTotal)}
                  </Text>
                </HStack>
                {newDiscounts.length > 0 && (
                  <>
                    <HStack spacing={2}>
                      <Text fontSize="sm" color="red.500">Descontos:</Text>
                      <Text fontSize="sm" color="red.500" fontWeight="bold">
                        - {formatCurrency(newDiscounts.reduce((s, d) => s + d.amount, 0))}
                      </Text>
                    </HStack>
                    <HStack spacing={2}>
                      <Text fontWeight="bold" fontSize="sm">Total a Pagar:</Text>
                      <Text fontWeight="bold" fontSize="lg" color="green.500">
                        {formatCurrency(Math.max(0, newSettlementTotal - newDiscounts.reduce((s, d) => s + d.amount, 0)))}
                      </Text>
                    </HStack>
                  </>
                )}
              </VStack>
            </Flex>

            {/* Discounts grid */}
            <Box mt={4} borderWidth="1px" borderColor={borderColor} borderRadius="md" p={3}>
              <Text fontSize="sm" fontWeight="bold" mb={2}>Descontos</Text>
              {newDiscounts.length > 0 && (
                <VStack align="stretch" spacing={1} mb={2}>
                  {newDiscounts.map((disc, i) => (
                    <Flex key={i} align="center" gap={2} bg="red.50" px={2} py={1} borderRadius="md">
                      <Text fontSize="sm" flex="1">{disc.description}</Text>
                      <Text fontSize="sm" fontWeight="bold" color="red.500">- {formatCurrency(disc.amount)}</Text>
                      <IconButton
                        icon={<CloseIcon />}
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        aria-label="Remover desconto"
                        onClick={() => handleRemoveNewDiscount(i)}
                      />
                    </Flex>
                  ))}
                </VStack>
              )}
              <Flex gap={2} align="center">
                <Input
                  size="sm"
                  placeholder="Descricao do desconto"
                  value={newDiscDesc}
                  onChange={(e) => setNewDiscDesc(e.target.value)}
                  flex="1"
                />
                <InputGroup size="sm" w="140px">
                  <InputLeftElement pointerEvents="none" fontSize="xs" color="gray.500">R$</InputLeftElement>
                  <Input
                    placeholder="0,00"
                    value={newDiscAmount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9,\.]/g, "");
                      setNewDiscAmount(v);
                    }}
                    textAlign="right"
                    pl="10"
                  />
                </InputGroup>
                <IconButton
                  icon={<AddIcon />}
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  aria-label="Adicionar desconto"
                  onClick={handleAddNewDiscount}
                  isDisabled={!newDiscDesc.trim() || !newDiscAmount || parseFloat(String(newDiscAmount).replace(",", ".")) <= 0}
                />
              </Flex>
            </Box>

            <Box mt={4}>
              <Text fontSize="sm" fontWeight="medium" mb={1}>Observacoes (opcional)</Text>
              <Textarea
                size="sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observacoes sobre o fechamento..."
                rows={3}
              />
            </Box>

            <HStack spacing={3} mt={4} justify="flex-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                isLoading={savingDraft}
                isDisabled={selectedOfs.size === 0}
              >
                Salvar Rascunho
              </Button>
              <Button
                colorScheme="blue"
                size="sm"
                onClick={handleCreateSettlement}
                isLoading={submitting}
                loadingText="Criando..."
              >
                Criar Fechamento
              </Button>
            </HStack>
          </>
        ) : null}

      </Box>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <Box>
      <Heading size="md" mb={4}>Fechamento de Terceiros</Heading>

      {/* Edit settlement panel */}
      {renderEditPanel()}

      {/* New settlement creation panel */}
      {renderNewSettlement()}

      {/* Filters */}
      {renderFilters()}

      {/* Summary cards */}
      {!loading && filteredSettlements.length > 0 && (() => {
        const nonDraft = filteredSettlements.filter(s => s.status !== "draft");
        const totalFechamentos = nonDraft.length;
        const totalPecas = nonDraft.reduce((s, x) => s + (parseInt(x.totalItems) || 0), 0);
        const totalValor = nonDraft.reduce((s, x) => s + (parseFloat(x.totalPayable ?? x.totalAmount) || 0), 0);
        const pagos = nonDraft.filter(s => s.status === "paid");
        const totalPago = pagos.reduce((s, x) => s + (parseFloat(x.totalPayable ?? x.totalAmount) || 0), 0);
        const abertos = nonDraft.filter(s => s.status === "open");
        const totalAberto = abertos.reduce((s, x) => s + (parseFloat(x.totalPayable ?? x.totalAmount) || 0), 0);

        const cards = [
          { label: "Fechamentos", value: totalFechamentos, color: "blue" },
          { label: "Total Peças", value: totalPecas.toLocaleString("pt-BR"), color: "purple" },
          { label: "Valor Total", value: formatCurrency(totalValor), color: "blue" },
          { label: "Pago", value: formatCurrency(totalPago), color: "green" },
          { label: "Em Aberto", value: formatCurrency(totalAberto), color: "orange" },
        ];

        return (
          <Flex gap={3} mb={4} wrap="wrap">
            {cards.map((c) => (
              <Box
                key={c.label}
                flex={{ base: "1 1 calc(50% - 6px)", md: "1 1 0" }}
                bg={cardBg}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={borderColor}
                p={3}
                textAlign="center"
              >
                <Text fontSize="xs" color="gray.500" fontWeight="medium" textTransform="uppercase" letterSpacing="wide">{c.label}</Text>
                <Text fontSize="lg" fontWeight="bold" color={`${c.color}.500`} mt={1}>{c.value}</Text>
              </Box>
            ))}
          </Flex>
        );
      })()}

      {/* Settlements table */}
      {renderSettlementsTable()}

      {/* Detail panel */}
      {renderDetailPanel()}
    </Box>
  );
};

export default TerceirosSettlement;
