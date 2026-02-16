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
  Select,
  Spinner,
  Center,
  useDisclosure,
  useToast,
  useColorModeValue
} from "@chakra-ui/react";
import { AddIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, DeleteIcon } from "@chakra-ui/icons";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import CashFlowEntryModal from "./CashFlowEntryModal";
import CashFlowCategoriesModal from "./CashFlowCategoriesModal";
import CashFlowRecurrencesModal from "./CashFlowRecurrencesModal";
import CashFlowBoxesModal from "./CashFlowBoxesModal";
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
  fetchCashflowAlerts
} from "../api";

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
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
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
    dueTodayCount: 0,
    overdueItems: [],
    dueTodayItems: [],
    isWeekend: false
  });
  const [activeFilter, setActiveFilter] = useState(null); // null, 'overdue', 'dueToday'
  const fileInputRef = useRef(null);

  const entryModal = useDisclosure();
  const categoriesModal = useDisclosure();
  const recurrencesModal = useDisclosure();
  const boxesModal = useDisclosure();
  const toast = useToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const tableBg = useColorModeValue("white", "gray.800");
  const headerBg = useColorModeValue("gray.50", "gray.700");
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
        fetchCashflowAlerts(selectedBoxId)
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
        toast({ title: "Erro ao carregar alguns dados. Verifique o console.", status: "warning", duration: 4000 });
      }
    } catch (err) {
      console.error("loadData error:", err);
      toast({ title: "Erro ao carregar dados.", status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
    } else {
      await createCashflowEntry({ ...data, boxId: selectedBoxId });
    }
    await loadData();
  };

  const handleToggleStatus = async (id) => {
    try {
      await toggleCashflowEntryStatus(id);
      await loadData();
    } catch (err) {
      toast({ title: "Erro ao alterar status.", status: "error", duration: 3000 });
    }
  };

  const handleDeleteEntry = async (id) => {
    try {
      await deleteCashflowEntry(id);
      await loadData();
    } catch (err) {
      toast({ title: "Erro ao excluir.", status: "error", duration: 3000 });
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
      toast({ title: "Erro ao salvar saldo.", status: "error", duration: 3000 });
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importCashflow(file, selectedBoxId);
      toast({
        title: result.message || "Importação concluída.",
        description: result.sheets?.join(", "),
        status: "success",
        duration: 6000,
        isClosable: true
      });
      await loadData();
    } catch (err) {
      toast({ title: err.message || "Erro na importação.", status: "error", duration: 4000 });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFilterOverdue = () => {
    setActiveFilter(activeFilter === 'overdue' ? null : 'overdue');
  };

  const handleFilterDueToday = () => {
    setActiveFilter(activeFilter === 'dueToday' ? null : 'dueToday');
  };

  const clearFilter = () => {
    setActiveFilter(null);
  };

  const openNewEntry = () => {
    setEditingEntry(null);
    entryModal.onOpen();
  };

  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    entryModal.onOpen();
  };

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
    if (activeFilter === 'overdue') {
      const overdueIds = new Set(alerts.overdueItems.map(item => item.id));
      result = result.filter(e => overdueIds.has(e.id));
    } else if (activeFilter === 'dueToday') {
      const dueTodayIds = new Set(alerts.dueTodayItems.map(item => item.id));
      result = result.filter(e => dueTodayIds.has(e.id));
    }

    return result;
  }, [entries, summary, activeFilter, alerts]);

  // Chart data
  const chartData = useMemo(() => {
    if (!summary?.dailyBalance) return [];
    return summary.dailyBalance.map(d => ({
      date: d.date.slice(8, 10),
      saldo: d.balance
    }));
  }, [summary]);

  const chartTooltipFormatter = (value) => [formatCurrency(value), "Saldo"];

  if (loading && !summary) {
    return <Center py={20}><Spinner size="xl" color="blue.500" /></Center>;
  }

  return (
    <Box>
      {/* Header: Month selector + box selector + action buttons */}
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
            onClick={() => fileInputRef.current?.click()}
            isLoading={importing}
            loadingText="Importando..."
          >
            Importar planilha
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleImport}
          />
          <Button size="sm" variant="outline" onClick={recurrencesModal.onOpen}>Recorrências</Button>
          <Button size="sm" variant="outline" onClick={categoriesModal.onOpen}>Categorias</Button>
          <Button size="sm" variant="outline" onClick={boxesModal.onOpen}>Caixas</Button>
        </HStack>
      </Flex>

      {/* Summary cards */}
      <SimpleGrid columns={{ base: 2, md: 6 }} spacing={4} mb={6}>
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
            <StatNumber fontSize="lg" color="green.500">{formatCurrency(summary?.totalIncome)}</StatNumber>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="lg" boxShadow="sm" borderWidth="1px">
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">Total Despesas</StatLabel>
            <StatNumber fontSize="lg" color="red.500">{formatCurrency(summary?.totalExpense)}</StatNumber>
          </Stat>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="lg" boxShadow="sm" borderWidth="1px">
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">Saldo Final</StatLabel>
            <StatNumber fontSize="lg" color={(summary?.closingBalance ?? 0) >= 0 ? "blue.500" : "red.500"}>
              {formatCurrency(summary?.closingBalance)}
            </StatNumber>
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
            <StatNumber fontSize="lg" color="red.500">
              {alerts.overdueCount}
            </StatNumber>
          </Stat>
        </Box>

        {/* Vencendo Hoje Card */}
        <Box
          bg={cardBg}
          p={4}
          borderRadius="lg"
          boxShadow={activeFilter === 'dueToday' ? 'lg' : 'sm'}
          borderWidth="2px"
          borderColor={activeFilter === 'dueToday' ? 'orange.500' : (alerts.dueTodayCount > 0 ? 'orange.300' : 'transparent')}
          cursor="pointer"
          onClick={handleFilterDueToday}
          transition="all 0.2s"
          _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
        >
          <Stat>
            <StatLabel fontSize="xs" color="gray.500">
              {alerts.isWeekend ? 'Vencendo 2ª' : 'Vencendo Hoje'}
              {activeFilter === 'dueToday' && <Badge ml={2} colorScheme="orange" fontSize="xs">Filtrado</Badge>}
            </StatLabel>
            <StatNumber fontSize="lg" color="orange.500">
              {alerts.dueTodayCount}
            </StatNumber>
          </Stat>
        </Box>
      </SimpleGrid>

      {/* Chart */}
      {chartData.length > 0 && (
        <Box bg={cardBg} p={4} borderRadius="lg" boxShadow="sm" borderWidth="1px" mb={6}>
          <Text fontSize="sm" fontWeight="bold" mb={3}>Evolução do saldo</Text>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <RechartsTooltip formatter={chartTooltipFormatter} labelFormatter={(l) => `Dia ${l}`} />
              <Line type="monotone" dataKey="saldo" stroke="#3182CE" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}

      {/* Entries table */}
      <Box bg={tableBg} borderRadius="lg" boxShadow="sm" borderWidth="1px" overflow="hidden">
        <Flex justify="space-between" align="center" px={4} py={3}>
          <HStack>
            <Text fontWeight="bold" fontSize="sm">Lançamentos</Text>
            {activeFilter && (
              <Button size="xs" colorScheme="gray" variant="outline" onClick={clearFilter}>
                Limpar filtro
              </Button>
            )}
          </HStack>
          <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm" onClick={openNewEntry}>
            Novo lançamento
          </Button>
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
                      onChange={() => handleToggleStatus(entry.id)}
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
                  <Td fontSize="sm">{entry.description}</Td>
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
                        icon={<EditIcon />}
                        size="xs"
                        variant="ghost"
                        aria-label="Editar"
                        onClick={() => openEditEntry(entry)}
                      />
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

      {/* Modals */}
      <CashFlowEntryModal
        isOpen={entryModal.isOpen}
        onClose={entryModal.onClose}
        entry={editingEntry}
        categories={categories}
        onSave={handleSaveEntry}
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
    </Box>
  );
};

export default CashFlow;
