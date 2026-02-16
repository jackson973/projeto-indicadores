import { useState, useEffect } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputLeftAddon,
  Select,
  Button,
  IconButton,
  HStack,
  VStack,
  Badge,
  Box,
  ButtonGroup,
  Checkbox,
  Divider,
  Text,
  useToast,
  useColorModeValue
} from "@chakra-ui/react";
import { AddIcon, EditIcon, DeleteIcon } from "@chakra-ui/icons";
import {
  fetchCashflowRecurrences,
  createCashflowRecurrence,
  updateCashflowRecurrence,
  deleteCashflowRecurrence
} from "../api";

const formatBRL = (value) =>
  (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyForm = {
  categoryId: "",
  description: "",
  type: "expense",
  amount: 0,
  frequency: "monthly",
  dayOfMonth: "",
  startDate: "",
  endDate: "",
  installment: false
};

const CashFlowRecurrencesModal = ({ isOpen, onClose, categories, boxId }) => {
  const [recurrences, setRecurrences] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const headerBg = useColorModeValue("gray.50", "gray.700");

  const load = async () => {
    try {
      const data = await fetchCashflowRecurrences(boxId);
      setRecurrences(data);
    } catch (err) {
      toast({ title: "Erro ao carregar recorrências.", status: "error", duration: 3000 });
    }
  };

  useEffect(() => {
    if (isOpen) {
      load();
      setShowForm(false);
      setEditingId(null);
    }
  }, [isOpen]);

  const openForm = (rec = null) => {
    if (rec) {
      setEditingId(rec.id);
      setForm({
        categoryId: String(rec.categoryId),
        description: rec.description,
        type: rec.type,
        amount: rec.amount,
        frequency: rec.frequency,
        dayOfMonth: rec.dayOfMonth ? String(rec.dayOfMonth) : "",
        startDate: rec.startDate ? String(rec.startDate).slice(0, 10) : "",
        endDate: rec.endDate ? String(rec.endDate).slice(0, 10) : "",
        installment: rec.installment || false
      });
    } else {
      setEditingId(null);
      setForm({
        ...emptyForm,
        categoryId: categories.length > 0 ? String(categories[0].id) : "",
        startDate: new Date().toISOString().slice(0, 10)
      });
    }
    setShowForm(true);
  };

  const handleCurrencyChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    const cents = parseInt(digits || "0", 10);
    setForm({ ...form, amount: cents / 100 });
  };

  const handleSave = async () => {
    const errors = [];
    if (!form.categoryId) errors.push("categoria");
    if (!form.description.trim()) errors.push("descrição");
    if (!form.amount) errors.push("valor");
    if (!form.startDate) errors.push("data início");
    if (form.installment && !form.endDate) errors.push("data fim (obrigatória para parcelamento)");

    if (errors.length > 0) {
      toast({
        title: `Preencha: ${errors.join(", ")}.`,
        status: "warning",
        duration: 4000
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        categoryId: parseInt(form.categoryId),
        description: form.description.trim(),
        type: form.type,
        amount: form.amount,
        frequency: form.frequency,
        dayOfMonth: form.dayOfMonth ? parseInt(form.dayOfMonth) : null,
        startDate: form.startDate,
        endDate: form.endDate || null,
        installment: form.installment,
        boxId
      };
      if (editingId) {
        await updateCashflowRecurrence(editingId, payload);
      } else {
        await createCashflowRecurrence(payload);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      toast({ title: err.message || "Erro ao salvar.", status: "error", duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteCashflowRecurrence(id);
      await load();
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir.", status: "error", duration: 3000 });
    }
  };

  const formatDate = (d) => {
    if (!d) return "-";
    const s = String(d).slice(0, 10);
    const [y, m, day] = s.split("-");
    return `${day}/${m}/${y}`;
  };

  // Calculate installment count for display
  const getInstallmentCount = () => {
    if (!form.startDate || !form.endDate) return null;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (form.frequency === "monthly") {
      return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    }
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.floor((end - start) / msPerWeek) + 1;
  };

  const installmentCount = form.installment ? getInstallmentCount() : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Recorrências</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <HStack mb={4}>
            <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm" onClick={() => openForm()}>
              Nova recorrência
            </Button>
          </HStack>

          {showForm && (
            <Box borderWidth="1px" borderRadius="md" p={4} mb={4}>
              <Text fontWeight="bold" mb={3}>{editingId ? "Editar recorrência" : "Nova recorrência"}</Text>
              <VStack spacing={3} align="stretch">
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Tipo</FormLabel>
                  <ButtonGroup isAttached size="sm" w="full">
                    <Button
                      flex={1}
                      colorScheme={form.type === "income" ? "green" : "gray"}
                      variant={form.type === "income" ? "solid" : "outline"}
                      onClick={() => setForm({ ...form, type: "income" })}
                    >
                      Receita
                    </Button>
                    <Button
                      flex={1}
                      colorScheme={form.type === "expense" ? "red" : "gray"}
                      variant={form.type === "expense" ? "solid" : "outline"}
                      onClick={() => setForm({ ...form, type: "expense" })}
                    >
                      Despesa
                    </Button>
                  </ButtonGroup>
                </FormControl>

                <HStack>
                  <FormControl isRequired>
                    <FormLabel fontSize="sm">Categoria</FormLabel>
                    <Select size="sm" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel fontSize="sm">Valor</FormLabel>
                    <InputGroup size="sm">
                      <InputLeftAddon>R$</InputLeftAddon>
                      <Input
                        value={formatBRL(form.amount)}
                        onChange={handleCurrencyChange}
                        inputMode="numeric"
                      />
                    </InputGroup>
                  </FormControl>
                </HStack>

                <FormControl isRequired>
                  <FormLabel fontSize="sm">Descrição</FormLabel>
                  <Input size="sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Aluguel, Internet..." />
                </FormControl>

                <HStack>
                  <FormControl>
                    <FormLabel fontSize="sm">Frequência</FormLabel>
                    <Select size="sm" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                      <option value="monthly">Mensal</option>
                      <option value="weekly">Semanal</option>
                    </Select>
                  </FormControl>
                  {form.frequency === "monthly" && (
                    <FormControl>
                      <FormLabel fontSize="sm">Dia do mês</FormLabel>
                      <Input size="sm" type="number" min="1" max="31" value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} placeholder="Ex: 15" />
                    </FormControl>
                  )}
                </HStack>

                <HStack>
                  <FormControl isRequired>
                    <FormLabel fontSize="sm">Data início</FormLabel>
                    <Input size="sm" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                  </FormControl>
                  <FormControl isRequired={form.installment}>
                    <FormLabel fontSize="sm">Data fim</FormLabel>
                    <Input size="sm" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                  </FormControl>
                </HStack>

                <HStack>
                  <Checkbox
                    isChecked={form.installment}
                    onChange={(e) => setForm({ ...form, installment: e.target.checked })}
                    size="sm"
                  >
                    Parcelado (adicionar 1/N na descrição)
                  </Checkbox>
                  {installmentCount && installmentCount > 0 && (
                    <Badge colorScheme="blue" fontSize="xs">{installmentCount}x parcelas</Badge>
                  )}
                </HStack>

                <HStack justify="flex-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button size="sm" colorScheme="blue" onClick={handleSave} isLoading={saving}>
                    {editingId ? "Salvar" : "Criar"}
                  </Button>
                </HStack>
              </VStack>
            </Box>
          )}

          <Divider mb={4} />

          <TableContainer>
            <Table size="sm">
              <Thead>
                <Tr bg={headerBg}>
                  <Th>Descrição</Th>
                  <Th>Categoria</Th>
                  <Th>Tipo</Th>
                  <Th isNumeric>Valor</Th>
                  <Th>Freq.</Th>
                  <Th>Vigência</Th>
                  <Th w="80px" textAlign="right">Ações</Th>
                </Tr>
              </Thead>
              <Tbody>
                {recurrences.map((rec) => (
                  <Tr key={rec.id}>
                    <Td fontSize="sm">
                      {rec.description}
                      {rec.installment && <Badge ml={1} colorScheme="blue" fontSize="2xs">Parc.</Badge>}
                    </Td>
                    <Td fontSize="sm">{rec.categoryName}</Td>
                    <Td>
                      <Badge colorScheme={rec.type === "income" ? "green" : "red"} fontSize="xs">
                        {rec.type === "income" ? "Receita" : "Despesa"}
                      </Badge>
                    </Td>
                    <Td isNumeric fontSize="sm">
                      {rec.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </Td>
                    <Td fontSize="sm">{rec.frequency === "monthly" ? "Mensal" : "Semanal"}</Td>
                    <Td fontSize="sm">{formatDate(rec.startDate)}{rec.endDate ? ` - ${formatDate(rec.endDate)}` : ""}</Td>
                    <Td textAlign="right">
                      <HStack justify="flex-end" spacing={1}>
                        <IconButton icon={<EditIcon />} size="xs" variant="ghost" aria-label="Editar" onClick={() => openForm(rec)} />
                        <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(rec.id)} />
                      </HStack>
                    </Td>
                  </Tr>
                ))}
                {recurrences.length === 0 && (
                  <Tr><Td colSpan={7} textAlign="center" color="gray.500" py={4}>Nenhuma recorrência cadastrada.</Td></Tr>
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>Fechar</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CashFlowRecurrencesModal;
