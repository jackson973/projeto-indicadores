import { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Flex,
  Text,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
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
  Tooltip,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Select,
  Spinner,
  Center,
  VStack,
  useBreakpointValue,
  useDisclosure,
  useColorModeValue
} from "@chakra-ui/react";
import { AddIcon, AttachmentIcon, ChevronLeftIcon, ChevronRightIcon, DeleteIcon, SearchIcon, CloseIcon, DownloadIcon } from "@chakra-ui/icons";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import CashFlowEntryModal from "./CashFlowEntryModal";
import CashFlowReceiptModal, { AttachmentViewerModal } from "./CashFlowReceiptModal";
import CashFlowCategoriesModal from "./CashFlowCategoriesModal";
import CashFlowRecurrencesModal from "./CashFlowRecurrencesModal";
import CashFlowBoxesModal from "./CashFlowBoxesModal";
import CashFlowImportModal from "./CashFlowImportModal";
import { makeWeekdayFor, DayTick, buildCumulativeSeries, zeroSplitOffset } from "./cashflowChartUtils";
import { getSaoPauloYear, getSaoPauloMonth } from "../utils/timezone";
import {
  fetchCashflowCategories,
  fetchCashflowEntries,
  createCashflowEntry,
  updateCashflowEntry,
  toggleCashflowEntryStatus,
  deleteCashflowEntry,
  fetchCashflowSummary,
  setCashflowBalance,
  importCashflow,
  fetchCashflowBoxes,
  fetchCashflowAlerts,
  fetchCashflowAttachments
} from "../api";
import useAppToast from "../hooks/useAppToast";

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const formatCurrency = (value) =>
  (value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateBR = (d) => {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  return `${day}/${m}`;
};

const CashFlow = () => {
  const [year, setYear] = useState(getSaoPauloYear());
  const [month, setMonth] = useState(getSaoPauloMonth());
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [boxes, setBoxes] = useState([]);
  const [selectedBoxId, setSelectedBoxId] = useState(() => {
    const saved = localStorage.getItem("cashflow_selectedBoxId");
    return saved ? parseInt(saved) : null;
  });
  const [alerts, setAlerts] = useState({
    overdueCount: 0,
    overdueTotal: 0,
    overdueItems: [],
    upcomingCount: 0,
    upcomingTotal: 0,
    upcomingItems: []
  });
  const [activeFilter, setActiveFilter] = useState(null); // null, 'paid', 'overdue', 'upcoming'
  const [searchTerm, setSearchTerm] = useState("");
  const [dayRange, setDayRange] = useState(null); // {start, end} — dias selecionados no gráfico
  const [dragSel, setDragSel] = useState(null); // seleção em andamento no gráfico (arrasto)
  const [chartType, setChartType] = useState(() => localStorage.getItem("cashflow_chartType") || "saldo"); // saldo | rd

  const [receiptEntry, setReceiptEntry] = useState(null); // pagamento recém-marcado, para anexar comprovante
  const [viewerAttachment, setViewerAttachment] = useState(null); // anexo único aberto pelo clipe da listagem
  const entryModal = useDisclosure();
  const receiptModal = useDisclosure();
  const categoriesModal = useDisclosure();
  const recurrencesModal = useDisclosure();
  const boxesModal = useDisclosure();
  const importModal = useDisclosure();
  const toast = useAppToast();

  const isMobile = useBreakpointValue({ base: true, md: false });
  const cardBg = useColorModeValue("white", "gray.800");
  const tableBg = useColorModeValue("white", "gray.800");
  const headerBg = useColorModeValue("gray.50", "gray.700");
  const cardBorder = useColorModeValue("gray.200", "gray.600");
  const selPanelBg = useColorModeValue("blue.50", "rgba(49, 130, 206, 0.12)");
  const selPanelBorder = useColorModeValue("blue.200", "blue.600");
  const pendingOpacity = 0.5;

  const loadBoxes = async () => {
    try {
      const data = await fetchCashflowBoxes();
      setBoxes(data);
      if (data.length > 0) {
        const saved = localStorage.getItem("cashflow_selectedBoxId");
        const validSaved = saved && data.some(b => String(b.id) === saved);
        if (!validSaved) {
          const firstId = parseInt(data[0].id);
          setSelectedBoxId(firstId);
          localStorage.setItem("cashflow_selectedBoxId", firstId);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar caixas:", err);
    }
  };

  useEffect(() => { loadBoxes(); }, []);

  const loadData = async () => {
    if (!selectedBoxId) return;
    setLoading(true);
    try {
      const [catsResult, entsResult, sumResult, alertsResult] = await Promise.allSettled([
        fetchCashflowCategories(),
        fetchCashflowEntries(year, month, selectedBoxId),
        fetchCashflowSummary(year, month, selectedBoxId),
        fetchCashflowAlerts(year, month, selectedBoxId)
      ]);

      if (catsResult.status === "fulfilled") setCategories(catsResult.value);
      else console.error("Erro categorias:", catsResult.reason);

      if (entsResult.status === "fulfilled") setEntries(entsResult.value);
      else console.error("Erro entries:", entsResult.reason);

      if (sumResult.status === "fulfilled") setSummary(sumResult.value);
      else console.error("Erro summary:", sumResult.reason);

      if (alertsResult.status === "fulfilled") setAlerts(alertsResult.value);
      else console.error("Erro alerts:", alertsResult.reason);

      const failed = [catsResult, entsResult, sumResult, alertsResult].filter(r => r.status === "rejected");
      if (failed.length > 0) {
        toast({  title: "Erro ao carregar alguns dados. Verifique o console.", status: "warning", duration: 4000 });
      }
    } catch (err) {
      console.error("loadData error:", err);
      toast({  title: "Erro ao carregar dados.", status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setDayRange(null); // seleção de dias do gráfico não vale para outro mês/caixa
    setDragSel(null);
  }, [year, month, selectedBoxId]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const handleSaveEntry = async (data, id) => {
    if (id) {
      await updateCashflowEntry(id, data);
      if (data.boxId && data.boxId !== selectedBoxId) {
        const dest = boxes.find(b => b.id === data.boxId);
        toast({ title: `Lançamento migrado para "${dest?.name || "outro caixa"}".`, status: "success", duration: 4000 });
      }
    } else {
      await createCashflowEntry({ ...data, boxId: data.boxId || selectedBoxId });
    }
    await loadData();
  };

  const handleToggleStatus = async (entry) => {
    try {
      const result = await toggleCashflowEntryStatus(entry.id);
      await loadData();
      // Pagamento (despesa) marcado como realizado → oferece anexar o comprovante.
      // O check já está persistido; fechar a modal (Esc/clique fora) não desfaz nada.
      if (entry.type === "expense" && result?.status === "ok") {
        setReceiptEntry(entry);
        receiptModal.onOpen();
      }
    } catch (err) {
      toast({  title: "Erro ao alterar status.", status: "error", duration: 3000 });
    }
  };

  const handleDeleteEntry = async (id) => {
    try {
      await deleteCashflowEntry(id);
      await loadData();
    } catch (err) {
      toast({  title: "Erro ao excluir.", status: "error", duration: 3000 });
    }
  };

  const handleBalanceCurrencyChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    const cents = parseInt(digits || "0", 10);
    setBalanceInput(cents / 100);
  };

  const handleSaveBalance = async () => {
    const value = typeof balanceInput === "number" ? balanceInput : parseFloat(balanceInput);
    if (isNaN(value)) return;
    try {
      await setCashflowBalance(year, month, value, selectedBoxId);
      setEditingBalance(false);
      await loadData();
    } catch (err) {
      toast({  title: "Erro ao salvar saldo.", status: "error", duration: 3000 });
    }
  };

  const handleImportSubmit = async (file, boxId) => {
    setImporting(true);
    try {
      const result = await importCashflow(file, boxId);
      toast({ 
        title: result.message || "Importação concluída.",
        description: result.sheets?.join(", "),
        status: "success",
        duration: 6000
 });
      await loadData();
    } catch (err) {
      toast({  title: err.message || "Erro na importação.", status: "error", duration: 4000 });
    } finally {
      setImporting(false);
    }
  };

  const handleFilterPaid = () => {
    setActiveFilter(activeFilter === 'paid' ? null : 'paid');
  };

  const handleFilterOverdue = () => {
    setActiveFilter(activeFilter === 'overdue' ? null : 'overdue');
  };

  const handleFilterUpcoming = () => {
    setActiveFilter(activeFilter === 'upcoming' ? null : 'upcoming');
  };

  const clearFilter = () => {
    setActiveFilter(null);
    setDayRange(null);
  };

  // Seleção de dias no gráfico: clique filtra um dia; arrastar seleciona um intervalo
  const handleChartMouseDown = (e) => {
    if (e?.activeLabel) setDragSel({ start: e.activeLabel, end: e.activeLabel });
  };

  const handleChartMouseMove = (e) => {
    if (!e?.activeLabel) return;
    setDragSel(s => (s && s.end !== e.activeLabel ? { ...s, end: e.activeLabel } : s));
  };

  const handleChartMouseUp = () => {
    if (!dragSel) return;
    const a = parseInt(dragSel.start), b = parseInt(dragSel.end);
    setDragSel(null);
    if (Number.isNaN(a) || Number.isNaN(b)) return;
    setDayRange({ start: Math.min(a, b), end: Math.max(a, b) });
  };

  const openNewEntry = () => {
    setEditingEntry(null);
    entryModal.onOpen();
  };

  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    entryModal.onOpen();
  };

  // Clipe: com 1 anexo abre o visualizador direto; com vários, a modal de edição (como o clique na linha)
  const handleClipClick = async (e, entry) => {
    e.stopPropagation();
    if (entry.attachmentCount === 1) {
      try {
        const list = await fetchCashflowAttachments(entry.id);
        if (list.length === 1) {
          setViewerAttachment(list[0]);
          return;
        }
      } catch { /* cai para a modal de edição */ }
    }
    openEditEntry(entry);
  };

  const handleExportExcel = () => {
    if (!entriesWithBalance.length) {
      toast({ title: "Nenhum lançamento para exportar.", status: "warning", duration: 3000 });
      return;
    }

    const monthLabel = monthNames[month - 1];
    const openingBalance = summary?.openingBalance ?? 0;

    const rows = [
      ["Status", "Data", "Tipo", "Histórico", "Despesa", "Receita", "Saldo"],
      ["", "", "", "SALDO ANTERIOR", "", "", openingBalance],
      ...entriesWithBalance.map(e => {
        const [y, m, d] = String(e.date).slice(0, 10).split("-");
        return [
          e.status === "ok" ? "OK" : "Pendente",
          `${d}/${m}/${y}`,
          e.categoryName || "",
          e.description || "",
          e.type === "expense" ? e.amount : "",
          e.type === "income" ? e.amount : "",
          e.runningBalance
        ];
      })
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 50 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }
    ];

    const currencyFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = 1; R <= range.e.r; R++) {
      for (const C of [4, 5, 6]) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && typeof cell.v === "number") cell.z = currencyFmt;
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${monthLabel} ${year}`);
    XLSX.writeFile(wb, `fluxo-caixa-${String(month).padStart(2, "0")}-${year}.xlsx`);
  };

  const handleExportPdf = () => {
    if (!entriesWithBalance.length) {
      toast({ title: "Nenhum lançamento para exportar.", status: "warning", duration: 3000 });
      return;
    }

    const BRL = (n) => Number(n || 0).toLocaleString("pt-BR", {
      style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    const NAVY = [26, 54, 93], BLUE = [49, 130, 206], RED = [192, 57, 43],
      GREEN = [39, 103, 73], GRAY = [85, 85, 85];
    const M = 12; // margem, em mm (A4 retrato)

    const monthLabel = monthNames[month - 1];
    const boxName = boxes.find(b => String(b.id) === String(selectedBoxId))?.name || "";
    const generatedAt = new Date().toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    let y = M + 4;

    // Título com o mês em destaque
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(20, 20, 20);
    doc.text("Fluxo de Caixa", M, y);
    const titleW = doc.getTextWidth("Fluxo de Caixa ");
    doc.setFontSize(16); doc.setTextColor(...BLUE);
    doc.text(`${monthLabel} / ${year}`, M + titleW + 2, y);
    y += 6;

    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text(`${boxName ? `Caixa: ${boxName} · ` : ""}Gerado em ${generatedAt}${activeFilter || searchTerm || dayRange ? " · Lista filtrada" : ""}${dayRange ? ` (${dayRangeLabel.toLowerCase()})` : ""}`, M, y);
    y += 4;

    // Resumo do mês
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [["Saldo Inicial", "Total Receitas", "Total Despesas", "Saldo Final"]],
      body: [[
        BRL(summary?.openingBalance),
        BRL(summary?.totalIncome),
        BRL(summary?.totalExpense),
        BRL(summary?.closingBalance)
      ]],
      styles: { fontSize: 9.5, halign: "center", fontStyle: "bold", cellPadding: 1.8 },
      headStyles: { fillColor: NAVY, halign: "center", fontSize: 8.5 },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        if (d.column.index === 1) d.cell.styles.textColor = GREEN;
        if (d.column.index === 2) d.cell.styles.textColor = RED;
        if (d.column.index === 3) d.cell.styles.textColor = (summary?.closingBalance ?? 0) >= 0 ? BLUE : RED;
      },
    });
    y = doc.lastAutoTable.finalY + 5;

    // Lançamentos (mesma lista/ordem da tela, incluindo filtro ativo)
    const body = [
      ["", "", "", "SALDO ANTERIOR", "", "", BRL(summary?.openingBalance)],
      ...entriesWithBalance.map(e => {
        const [yy, mm, dd] = String(e.date).slice(0, 10).split("-");
        return [
          e.status === "ok" ? "OK" : "Pendente",
          `${dd}/${mm}/${yy}`,
          e.categoryName || "",
          e.description || "",
          e.type === "expense" ? BRL(e.amount) : "",
          e.type === "income" ? BRL(e.amount) : "",
          BRL(e.runningBalance)
        ];
      })
    ];

    autoTable(doc, {
      startY: y, margin: { left: M, right: M, bottom: 14 },
      head: [["Status", "Data", "Tipo", "Histórico", "Despesa", "Receita", "Saldo"]],
      body,
      styles: { fontSize: 7.5, cellPadding: 1.4, halign: "right" },
      headStyles: { fillColor: NAVY, halign: "right" },
      columnStyles: {
        0: { halign: "center", cellWidth: 15 },
        1: { halign: "center", cellWidth: 16 },
        2: { halign: "left", cellWidth: 26 },
        3: { halign: "left" },
        4: { cellWidth: 21 },
        5: { cellWidth: 21 },
        6: { cellWidth: 23 },
      },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        if (d.row.index === 0) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = [235, 235, 235]; }
        if (d.column.index === 0 && d.cell.raw === "Pendente") d.cell.styles.textColor = GRAY;
        if (d.column.index === 4 && d.cell.raw) d.cell.styles.textColor = RED;
        if (d.column.index === 5 && d.cell.raw) d.cell.styles.textColor = GREEN;
        if (d.column.index === 6 && d.cell.raw) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.textColor = String(d.cell.raw).includes("-") ? RED : BLUE;
        }
      },
    });

    // Rodapé: data/hora de geração + paginação
    const pages = doc.getNumberOfPages();
    const pageH = doc.internal.pageSize.getHeight();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(`Gerado em ${generatedAt}`, M, pageH - 7);
      doc.text(`Página ${p} de ${pages}`, pageW - M, pageH - 7, { align: "right" });
    }

    doc.save(`fluxo-caixa-${String(month).padStart(2, "0")}-${year}.pdf`);
  };

  // Despesas pagas do mês (espelha a semântica de Vencidos/A Vencer, que são só despesas)
  const paidStats = useMemo(() => {
    const items = entries.filter(e => e.type === "expense" && e.status === "ok");
    return {
      count: items.length,
      total: items.reduce((sum, e) => sum + e.amount, 0)
    };
  }, [entries]);

  // Compute running balance for table and apply filters
  const entriesWithBalance = useMemo(() => {
    if (!summary) return entries.map(e => ({ ...e, runningBalance: 0 }));

    let balance = summary.openingBalance;
    let result = entries.map(e => {
      if (e.type === "income") balance += e.amount;
      else balance -= e.amount;
      return { ...e, runningBalance: Number(balance.toFixed(2)) };
    });

    // Apply active filter
    if (activeFilter === 'paid') {
      result = result.filter(e => e.type === "expense" && e.status === "ok");
    } else if (activeFilter === 'overdue') {
      const overdueIds = new Set(alerts.overdueItems.map(item => item.id));
      result = result.filter(e => overdueIds.has(e.id));
    } else if (activeFilter === 'upcoming') {
      const upcomingIds = new Set(alerts.upcomingItems.map(item => item.id));
      result = result.filter(e => upcomingIds.has(e.id));
    }

    // Apply day range filter (seleção no gráfico)
    if (dayRange) {
      result = result.filter(e => {
        const d = parseInt(String(e.date).slice(8, 10));
        return d >= dayRange.start && d <= dayRange.end;
      });
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(e =>
        (e.description && e.description.toLowerCase().includes(term)) ||
        (e.categoryName && e.categoryName.toLowerCase().includes(term)) ||
        formatCurrency(e.amount).toLowerCase().includes(term) ||
        formatDateBR(e.date).includes(term)
      );
    }

    return result;
  }, [entries, summary, activeFilter, alerts, searchTerm, dayRange]);

  // Chart data
  const chartData = useMemo(() => {
    if (!summary?.dailyBalance) return [];
    return summary.dailyBalance.map(d => ({
      date: d.date.slice(8, 10),
      saldo: d.balance
    }));
  }, [summary]);

  // Modo "Receitas e Despesas": acumulado do mês, dia a dia
  const cumChartData = useMemo(() => buildCumulativeSeries(entries, year, month), [entries, year, month]);

  // Trecho da linha de saldo abaixo de zero fica vermelho
  const saldoSplit = useMemo(() => zeroSplitOffset(chartData.map(d => d.saldo)), [chartData]);

  const weekdayFor = useMemo(() => makeWeekdayFor(year, month), [year, month]);

  const handleChartTypeChange = (e) => {
    setChartType(e.target.value);
    localStorage.setItem("cashflow_chartType", e.target.value);
  };

  const chartTooltipFormatter = (value) => [formatCurrency(value), "Saldo"];
  const rdTooltipFormatter = (value, name) =>
    [formatCurrency(value), name === "receitas" ? "Receitas acumuladas" : "Despesas acumuladas"];
  const chartLabelFormatter = (l) => `Dia ${l} · ${weekdayFor(l)}`;

  // Resumo do(s) dia(s) selecionado(s) no gráfico — calculado sobre todos os
  // lançamentos do mês no intervalo, independente de busca/outros filtros
  const daySelectionStats = useMemo(() => {
    if (!dayRange) return null;
    const inRange = entries.filter(e => {
      const d = parseInt(String(e.date).slice(8, 10));
      return d >= dayRange.start && d <= dayRange.end;
    });
    const income = inRange.filter(e => e.type === "income");
    const expense = inRange.filter(e => e.type === "expense");
    const totalIncome = income.reduce((s, e) => s + e.amount, 0);
    const totalExpense = expense.reduce((s, e) => s + e.amount, 0);
    const endDay = String(dayRange.end).padStart(2, "0");
    const endPoint = chartData.find(d => d.date === endDay) || chartData[chartData.length - 1];
    return {
      count: inRange.length,
      totalIncome,
      incomeCount: income.length,
      totalExpense,
      expenseCount: expense.length,
      net: totalIncome - totalExpense,
      endBalance: endPoint?.saldo ?? 0
    };
  }, [dayRange, entries, chartData]);

  const dayRangeLabel = dayRange
    ? (dayRange.start === dayRange.end
      ? `Dia ${String(dayRange.start).padStart(2, "0")}`
      : `Dias ${String(dayRange.start).padStart(2, "0")} a ${String(dayRange.end).padStart(2, "0")}`)
    : "";

  if (loading && !summary) {
    return <Center py={20}><Spinner size="xl" color="blue.500" /></Center>;
  }

  return (
    <Box>
      {/* Header: Month selector + box selector + action buttons */}
      {isMobile ? (
        <VStack align="stretch" spacing={3} mb={6}>
          <HStack justify="center" spacing={3}>
            <IconButton icon={<ChevronLeftIcon />} aria-label="Mês anterior" size="sm" variant="outline" onClick={prevMonth} />
            <Heading size="md" minW="150px" textAlign="center" fontSize="md">
              {monthNames[month - 1]} / {year}
            </Heading>
            <IconButton icon={<ChevronRightIcon />} aria-label="Próximo mês" size="sm" variant="outline" onClick={nextMonth} />
          </HStack>
          <Select
            size="sm"
            value={selectedBoxId || ""}
            onChange={(e) => {
              const id = parseInt(e.target.value);
              setSelectedBoxId(id);
              localStorage.setItem("cashflow_selectedBoxId", id);
            }}
          >
            {boxes.map((box) => (
              <option key={box.id} value={box.id}>{box.name}</option>
            ))}
          </Select>
          <SimpleGrid columns={2} spacing={2}>
            <Button
              size="sm"
              variant="outline"
              onClick={importModal.onOpen}
              isLoading={importing}
              loadingText="Importando..."
            >
              Importar
            </Button>
            <Button size="sm" variant="outline" onClick={recurrencesModal.onOpen}>Recorrências</Button>
            <Button size="sm" variant="outline" onClick={categoriesModal.onOpen}>Categorias</Button>
            <Button size="sm" variant="outline" onClick={boxesModal.onOpen}>Caixas</Button>
          </SimpleGrid>
        </VStack>
      ) : (
        <Flex justify="space-between" align="center" mb={6} wrap="wrap" gap={3}>
          <HStack spacing={3}>
            <IconButton icon={<ChevronLeftIcon />} aria-label="Mês anterior" size="sm" variant="outline" onClick={prevMonth} />
            <Heading size="md" minW="180px" textAlign="center">
              {monthNames[month - 1]} / {year}
            </Heading>
            <IconButton icon={<ChevronRightIcon />} aria-label="Próximo mês" size="sm" variant="outline" onClick={nextMonth} />
            <Select
              size="sm"
              w="180px"
              value={selectedBoxId || ""}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                setSelectedBoxId(id);
                localStorage.setItem("cashflow_selectedBoxId", id);
              }}
            >
              {boxes.map((box) => (
                <option key={box.id} value={box.id}>{box.name}</option>
              ))}
            </Select>
          </HStack>
          <HStack spacing={2}>
            <Button
              size="sm"
              variant="outline"
              onClick={importModal.onOpen}
              isLoading={importing}
              loadingText="Importando..."
            >
              Importar planilha
            </Button>
            <Button size="sm" variant="outline" onClick={recurrencesModal.onOpen}>Recorrências</Button>
            <Button size="sm" variant="outline" onClick={categoriesModal.onOpen}>Categorias</Button>
            <Button size="sm" variant="outline" onClick={boxesModal.onOpen}>Caixas</Button>
          </HStack>
        </Flex>
      )}

      {/* Summary cards */}
      <SimpleGrid columns={{ base: 2, md: 4, xl: 7 }} spacing={{ base: 2, md: 3 }} mb={6}>
        <Box bg={cardBg} p={4} borderRadius="lg" boxShadow="sm" borderWidth="1px">
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">Saldo Inicial</StatLabel>
            {editingBalance ? (
              <HStack mt={1}>
                <Input
                  size="sm"
                  value={formatCurrency(typeof balanceInput === "number" ? balanceInput : 0)}
                  onChange={handleBalanceCurrencyChange}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveBalance()}
                  inputMode="numeric"
                  autoFocus
                  w="140px"
                />
                <Button size="xs" colorScheme="blue" onClick={handleSaveBalance}>OK</Button>
                <Button size="xs" variant="ghost" onClick={() => setEditingBalance(false)}>X</Button>
              </HStack>
            ) : (
              <StatNumber
                fontSize="lg"
                cursor="pointer"
                onClick={() => { setBalanceInput(summary?.openingBalance ?? 0); setEditingBalance(true); }}
                title="Clique para editar"
              >
                {formatCurrency(summary?.openingBalance)}
              </StatNumber>
            )}
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="lg" boxShadow="sm" borderWidth="1px">
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">Total Receitas</StatLabel>
            <StatNumber fontSize={{ base: "md", "2xl": "lg" }} color="green.500">{formatCurrency(summary?.totalIncome)}</StatNumber>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="lg" boxShadow="sm" borderWidth="1px">
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">Total Despesas</StatLabel>
            <StatNumber fontSize={{ base: "md", "2xl": "lg" }} color="red.500">{formatCurrency(summary?.totalExpense)}</StatNumber>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="lg" boxShadow="sm" borderWidth="1px">
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">Saldo Final</StatLabel>
            <StatNumber fontSize={{ base: "md", "2xl": "lg" }} color={(summary?.closingBalance ?? 0) >= 0 ? "blue.500" : "red.500"}>
              {formatCurrency(summary?.closingBalance)}
            </StatNumber>
          </Stat>
        </Box>

        {/* Pagos Card */}
        <Box
          bg={cardBg}
          p={4}
          borderRadius="lg"
          boxShadow={activeFilter === 'paid' ? 'lg' : 'sm'}
          borderWidth="2px"
          borderColor={activeFilter === 'paid' ? 'green.500' : 'transparent'}
          cursor="pointer"
          onClick={handleFilterPaid}
          transition="all 0.2s"
          _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
        >
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">
              Pagos
              {activeFilter === 'paid' && <Badge ml={2} colorScheme="green" fontSize="xs">Filtrado</Badge>}
            </StatLabel>
            <StatNumber fontSize={{ base: "md", "2xl": "lg" }} color="green.500">
              {formatCurrency(paidStats.total)}
            </StatNumber>
            <StatHelpText fontSize="xs" color="gray.600" mt={1}>
              {paidStats.count} pagamento{paidStats.count !== 1 ? 's' : ''}
            </StatHelpText>
          </Stat>
        </Box>

        {/* A Vencer Card */}
        <Box
          bg={cardBg}
          p={4}
          borderRadius="lg"
          boxShadow={activeFilter === 'upcoming' ? 'lg' : 'sm'}
          borderWidth="2px"
          borderColor={activeFilter === 'upcoming' ? 'blue.500' : (alerts.upcomingCount > 0 ? 'blue.300' : 'transparent')}
          cursor="pointer"
          onClick={handleFilterUpcoming}
          transition="all 0.2s"
          _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
        >
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">
              A Vencer
              {activeFilter === 'upcoming' && <Badge ml={2} colorScheme="blue" fontSize="xs">Filtrado</Badge>}
            </StatLabel>
            <StatNumber fontSize={{ base: "md", "2xl": "lg" }} color="blue.500">
              {formatCurrency(alerts.upcomingTotal)}
            </StatNumber>
            <StatHelpText fontSize="xs" color="gray.600" mt={1}>
              {alerts.upcomingCount} vencimento{alerts.upcomingCount !== 1 ? 's' : ''}
            </StatHelpText>
          </Stat>
        </Box>

        {/* Vencidos Card */}
        <Box
          bg={cardBg}
          p={4}
          borderRadius="lg"
          boxShadow={activeFilter === 'overdue' ? 'lg' : 'sm'}
          borderWidth="2px"
          borderColor={activeFilter === 'overdue' ? 'red.500' : (alerts.overdueCount > 0 ? 'red.300' : 'transparent')}
          cursor="pointer"
          onClick={handleFilterOverdue}
          transition="all 0.2s"
          _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
        >
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">
              Vencidos
              {activeFilter === 'overdue' && <Badge ml={2} colorScheme="red" fontSize="xs">Filtrado</Badge>}
            </StatLabel>
            <StatNumber fontSize={{ base: "md", "2xl": "lg" }} color="red.500">
              {formatCurrency(alerts.overdueTotal)}
            </StatNumber>
            <StatHelpText fontSize="xs" color="gray.600" mt={1}>
              {alerts.overdueCount} vencimento{alerts.overdueCount !== 1 ? 's' : ''}
            </StatHelpText>
          </Stat>
        </Box>
      </SimpleGrid>

      {/* Chart */}
      {chartData.length > 0 && (
        <Box bg={cardBg} p={4} borderRadius="lg" boxShadow="sm" borderWidth="1px" mb={6}>
          <Flex align="center" justify="space-between" mb={3} wrap="wrap" gap={2}>
            <Text fontSize="sm" fontWeight="bold">
              {chartType === "rd" ? "Receitas × Despesas (acumulado)" : "Evolução do saldo"}
            </Text>
            <HStack spacing={3}>
              {!isMobile && (
                <Text fontSize="xs" color="gray.400">Clique em um dia ou arraste para filtrar um período</Text>
              )}
              <Select size="xs" w="170px" value={chartType} onChange={handleChartTypeChange}>
                <option value="saldo">Saldo</option>
                <option value="rd">Receitas e Despesas</option>
              </Select>
            </HStack>
          </Flex>
          {chartType === "rd" && (
            <HStack spacing={4} mb={2}>
              <HStack spacing={1.5}>
                <Box w="14px" h="3px" borderRadius="full" bg="green.500" />
                <Text fontSize="xs" color="gray.500">Receitas acumuladas</Text>
              </HStack>
              <HStack spacing={1.5}>
                <Box w="14px" h="3px" borderRadius="full" bg="red.500" />
                <Text fontSize="xs" color="gray.500">Despesas acumuladas</Text>
              </HStack>
            </HStack>
          )}
          <Box style={{ userSelect: "none" }} cursor="crosshair">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart
                data={chartType === "rd" ? cumChartData : chartData}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
                onMouseLeave={handleChartMouseUp}
              >
                <defs>
                  <linearGradient id="saldoSplitBox" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={saldoSplit} stopColor="#3182CE" />
                    <stop offset={saldoSplit} stopColor="#E53E3E" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" height={34} tick={<DayTick weekdayFor={weekdayFor} />} />
                <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <RechartsTooltip
                  formatter={chartType === "rd" ? rdTooltipFormatter : chartTooltipFormatter}
                  labelFormatter={chartLabelFormatter}
                />
                {dragSel && (
                  <ReferenceArea
                    x1={parseInt(dragSel.start) <= parseInt(dragSel.end) ? dragSel.start : dragSel.end}
                    x2={parseInt(dragSel.start) <= parseInt(dragSel.end) ? dragSel.end : dragSel.start}
                    fill="#3182CE"
                    fillOpacity={0.15}
                  />
                )}
                {!dragSel && dayRange && (
                  <ReferenceArea
                    x1={String(dayRange.start).padStart(2, "0")}
                    x2={String(dayRange.end).padStart(2, "0")}
                    fill="#3182CE"
                    fillOpacity={0.12}
                    stroke="#3182CE"
                    strokeOpacity={0.4}
                  />
                )}
                {chartType === "rd" ? (
                  <>
                    <Line type="monotone" dataKey="receitas" stroke="#38A169" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="despesas" stroke="#E53E3E" strokeWidth={2} dot={false} />
                  </>
                ) : (
                  <Line type="monotone" dataKey="saldo" stroke={saldoSplit < 1 ? "url(#saldoSplitBox)" : "#3182CE"} strokeWidth={2} dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </Box>

          {/* Resumo do período selecionado */}
          {daySelectionStats && (
            <Flex
              mt={3}
              px={4}
              py={3}
              bg={selPanelBg}
              borderWidth="1px"
              borderColor={selPanelBorder}
              borderRadius="lg"
              align="center"
              gap={{ base: 3, md: 6 }}
              wrap="wrap"
            >
              <Box minW="110px">
                <Text fontSize="xs" color="gray.500">Período</Text>
                <Text fontSize="md" fontWeight="bold" color="blue.500">{dayRangeLabel}</Text>
                <Text fontSize="2xs" color="gray.500">
                  {daySelectionStats.count} lançamento{daySelectionStats.count === 1 ? "" : "s"}
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Entradas ({daySelectionStats.incomeCount})</Text>
                <Text fontSize="md" fontWeight="bold" color="green.500">
                  {formatCurrency(daySelectionStats.totalIncome)}
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Saídas ({daySelectionStats.expenseCount})</Text>
                <Text fontSize="md" fontWeight="bold" color="red.500">
                  {formatCurrency(daySelectionStats.totalExpense)}
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Resultado do período</Text>
                <Text fontSize="md" fontWeight="bold" color={daySelectionStats.net >= 0 ? "green.500" : "red.500"}>
                  {daySelectionStats.net >= 0 ? "+" : ""}{formatCurrency(daySelectionStats.net)}
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">
                  Saldo no dia {String(dayRange.end).padStart(2, "0")}
                </Text>
                <Text fontSize="md" fontWeight="bold" color={daySelectionStats.endBalance >= 0 ? "blue.500" : "red.500"}>
                  {formatCurrency(daySelectionStats.endBalance)}
                </Text>
              </Box>
              <IconButton
                icon={<CloseIcon boxSize={2.5} />}
                size="sm"
                variant="ghost"
                aria-label="Limpar seleção de dias"
                title="Limpar seleção"
                ml="auto"
                onClick={() => setDayRange(null)}
              />
            </Flex>
          )}
        </Box>
      )}

      {/* Entries */}
      {isMobile ? (
        <>
          <Flex justify="space-between" align="center" mb={2}>
            <HStack>
              <Text fontWeight="bold" fontSize="sm">Lançamentos</Text>
              {(activeFilter || dayRange) && (
                <Button size="xs" colorScheme="gray" variant="outline" onClick={clearFilter}>
                  Limpar filtro
                </Button>
              )}
            </HStack>
          </Flex>
          <Box mb={3}>
            <InputGroup size="sm">
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Buscar lançamento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                borderRadius="md"
              />
              {searchTerm && (
                <InputRightElement>
                  <IconButton
                    icon={<CloseIcon />}
                    size="xs"
                    variant="ghost"
                    aria-label="Limpar busca"
                    onClick={() => setSearchTerm("")}
                  />
                </InputRightElement>
              )}
            </InputGroup>
          </Box>

          {entriesWithBalance.length === 0 ? (
            <Box bg={tableBg} borderRadius="lg" borderWidth="1px" py={8} textAlign="center">
              <Text color="gray.500" fontSize="sm">Nenhum lançamento neste mês.</Text>
            </Box>
          ) : (
            <VStack align="stretch" spacing={2} mb="80px">
              {entriesWithBalance.map((entry) => (
                <Box
                  key={entry.id}
                  bg={tableBg}
                  borderRadius="lg"
                  borderWidth="1px"
                  borderColor={cardBorder}
                  p={3}
                  opacity={entry.status === "pending" ? pendingOpacity : 1}
                  cursor="pointer"
                  onClick={() => openEditEntry(entry)}
                  _active={{ bg: headerBg }}
                >
                  {/* Row 1: Checkbox + Description + Amount */}
                  <Flex align="center" gap={2}>
                    <Box onClick={(e) => e.stopPropagation()} flexShrink={0}>
                      <Checkbox
                        isChecked={entry.status === "ok"}
                        onChange={() => handleToggleStatus(entry)}
                        colorScheme="green"
                        size="lg"
                      />
                    </Box>
                    <Text fontSize="sm" fontWeight="medium" flex={1} noOfLines={1}>
                      {entry.description}
                    </Text>
                    {entry.attachmentCount > 0 && (
                      <Box
                        flexShrink={0}
                        p={1.5}
                        m={-1.5}
                        cursor="pointer"
                        title="Ver comprovante"
                        onClick={(e) => handleClipClick(e, entry)}
                      >
                        <AttachmentIcon boxSize={3} color="gray.400" display="block" />
                      </Box>
                    )}
                    <Text
                      fontSize="sm"
                      fontWeight="bold"
                      flexShrink={0}
                      color={entry.type === "income" ? "green.500" : "red.500"}
                    >
                      {entry.type === "expense" ? "-" : "+"}{formatCurrency(entry.amount)}
                    </Text>
                  </Flex>

                  {/* Row 2: Date + Category + Balance + Delete */}
                  <Flex align="center" mt={1} ml="32px" gap={2}>
                    <Text fontSize="xs" color="gray.500">{formatDateBR(entry.date)}</Text>
                    <Badge
                      fontSize="2xs"
                      colorScheme={entry.type === "income" ? "green" : "red"}
                      variant="subtle"
                    >
                      {entry.categoryName}
                    </Badge>
                    <Text
                      fontSize="xs"
                      fontWeight="semibold"
                      color={entry.runningBalance >= 0 ? "blue.500" : "red.500"}
                      ml="auto"
                    >
                      Sld: {formatCurrency(entry.runningBalance)}
                    </Text>
                    <IconButton
                      icon={<DeleteIcon />}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      aria-label="Excluir"
                      onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }}
                    />
                  </Flex>
                </Box>
              ))}
            </VStack>
          )}

          {/* FAB - Novo lançamento */}
          <IconButton
            icon={<AddIcon />}
            aria-label="Novo lançamento"
            colorScheme="blue"
            borderRadius="full"
            size="lg"
            boxShadow="lg"
            position="fixed"
            bottom={6}
            right={6}
            zIndex="sticky"
            onClick={openNewEntry}
          />
        </>
      ) : (
        <Box bg={tableBg} borderRadius="lg" boxShadow="sm" borderWidth="1px" overflow="hidden">
          <Flex justify="space-between" align="center" px={4} py={3}>
            <HStack spacing={3}>
              <Text fontWeight="bold" fontSize="sm">Lançamentos</Text>
              {(activeFilter || dayRange) && (
                <Button size="xs" colorScheme="gray" variant="outline" onClick={clearFilter}>
                  Limpar filtro
                </Button>
              )}
              <InputGroup size="sm" w="280px">
                <InputLeftElement pointerEvents="none">
                  <SearchIcon color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="Buscar por descrição, categoria, valor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  borderRadius="md"
                />
                {searchTerm && (
                  <InputRightElement>
                    <IconButton
                      icon={<CloseIcon />}
                      size="xs"
                      variant="ghost"
                      aria-label="Limpar busca"
                      onClick={() => setSearchTerm("")}
                    />
                  </InputRightElement>
                )}
              </InputGroup>
            </HStack>
            <HStack spacing={2}>
              <Button
                leftIcon={<DownloadIcon />}
                colorScheme="green"
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
              >
                Exportar Excel
              </Button>
              <Button
                leftIcon={<DownloadIcon />}
                colorScheme="red"
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
              >
                Exportar PDF
              </Button>
              <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm" onClick={openNewEntry}>
                Novo lançamento
              </Button>
            </HStack>
          </Flex>

          <TableContainer>
            <Table size="sm">
              <Thead>
                <Tr bg={headerBg}>
                  <Th w="50px" textAlign="center">Status</Th>
                  <Th w="80px">Data</Th>
                  <Th w="130px">Tipo</Th>
                  <Th>Histórico</Th>
                  <Th isNumeric w="110px">Despesa</Th>
                  <Th isNumeric w="110px">Receita</Th>
                  <Th isNumeric w="110px">Saldo</Th>
                  <Th w="80px" textAlign="right">Ações</Th>
                </Tr>
              </Thead>
              <Tbody>
                {entriesWithBalance.length === 0 && (
                  <Tr>
                    <Td colSpan={8} textAlign="center" py={8} color="gray.500">
                      Nenhum lançamento neste mês.
                    </Td>
                  </Tr>
                )}
                {entriesWithBalance.map((entry) => (
                  <Tr
                    key={entry.id}
                    opacity={entry.status === "pending" ? pendingOpacity : 1}
                    _hover={{ bg: headerBg }}
                    cursor="pointer"
                    onClick={() => openEditEntry(entry)}
                  >
                    <Td textAlign="center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        isChecked={entry.status === "ok"}
                        onChange={() => handleToggleStatus(entry)}
                        colorScheme="green"
                      />
                    </Td>
                    <Td fontSize="sm">{formatDateBR(entry.date)}</Td>
                    <Td>
                      <Badge
                        fontSize="xs"
                        colorScheme={entry.type === "income" ? "green" : "red"}
                        variant="subtle"
                      >
                        {entry.categoryName}
                      </Badge>
                    </Td>
                    <Td fontSize="sm">
                      {entry.description}
                      {entry.attachmentCount > 0 && (
                        <Tooltip label={entry.attachmentCount === 1 ? "Ver comprovante" : "Ver comprovantes"} hasArrow>
                          <AttachmentIcon
                            boxSize={3}
                            color="gray.400"
                            ml={2}
                            cursor="pointer"
                            onClick={(e) => handleClipClick(e, entry)}
                          />
                        </Tooltip>
                      )}
                    </Td>
                    <Td isNumeric fontSize="sm" color="red.500" fontWeight="medium">
                      {entry.type === "expense" ? formatCurrency(entry.amount) : ""}
                    </Td>
                    <Td isNumeric fontSize="sm" color="green.500" fontWeight="medium">
                      {entry.type === "income" ? formatCurrency(entry.amount) : ""}
                    </Td>
                    <Td isNumeric fontSize="sm" fontWeight="bold" color={entry.runningBalance >= 0 ? "blue.500" : "red.500"}>
                      {formatCurrency(entry.runningBalance)}
                    </Td>
                    <Td textAlign="right" onClick={(e) => e.stopPropagation()}>
                      <HStack justify="flex-end" spacing={1}>
                        <IconButton
                          icon={<DeleteIcon />}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          aria-label="Excluir"
                          onClick={() => handleDeleteEntry(entry.id)}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Modals */}
      <CashFlowEntryModal
        isOpen={entryModal.isOpen}
        onClose={entryModal.onClose}
        entry={editingEntry}
        categories={categories}
        boxes={boxes}
        currentBoxId={selectedBoxId}
        onSave={handleSaveEntry}
        onAttachmentsChange={loadData}
      />
      <AttachmentViewerModal
        attachment={viewerAttachment}
        isOpen={!!viewerAttachment}
        onClose={() => setViewerAttachment(null)}
      />
      <CashFlowReceiptModal
        isOpen={receiptModal.isOpen}
        onClose={() => { receiptModal.onClose(); setReceiptEntry(null); }}
        entry={receiptEntry}
        onChanged={loadData}
      />
      <CashFlowCategoriesModal
        isOpen={categoriesModal.isOpen}
        onClose={categoriesModal.onClose}
        onCategoriesChange={loadData}
      />
      <CashFlowRecurrencesModal
        isOpen={recurrencesModal.isOpen}
        onClose={() => { recurrencesModal.onClose(); loadData(); }}
        categories={categories}
        boxId={selectedBoxId}
      />
      <CashFlowBoxesModal
        isOpen={boxesModal.isOpen}
        onClose={boxesModal.onClose}
        onBoxesChange={loadBoxes}
      />
      <CashFlowImportModal
        isOpen={importModal.isOpen}
        onClose={importModal.onClose}
        boxes={boxes}
        selectedBoxId={selectedBoxId}
        onImport={handleImportSubmit}
      />
    </Box>
  );
};

export default CashFlow;
