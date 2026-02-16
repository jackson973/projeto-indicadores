import { useState, useEffect } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputLeftAddon,
  Select,
  Button,
  HStack,
  ButtonGroup,
  useToast
} from "@chakra-ui/react";

const formatBRL = (value) =>
  (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CashFlowEntryModal = ({ isOpen, onClose, entry, categories, onSave }) => {
  const [form, setForm] = useState({
    date: "",
    categoryId: "",
    description: "",
    type: "expense",
    amount: 0,
    status: "pending"
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (entry) {
      setForm({
        date: entry.date instanceof Date
          ? entry.date.toISOString().slice(0, 10)
          : String(entry.date).slice(0, 10),
        categoryId: String(entry.categoryId),
        description: entry.description,
        type: entry.type,
        amount: entry.amount,
        status: entry.status
      });
    } else {
      setForm({
        date: new Date().toISOString().slice(0, 10),
        categoryId: categories.length > 0 ? String(categories[0].id) : "",
        description: "",
        type: "expense",
        amount: 0,
        status: "pending"
      });
    }
  }, [entry, isOpen, categories]);

  const handleCurrencyChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    const cents = parseInt(digits || "0", 10);
    setForm({ ...form, amount: cents / 100 });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.categoryId || !form.description.trim() || !form.amount) {
      toast({ title: "Preencha todos os campos obrigatórios.", status: "warning", duration: 3000 });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        date: form.date,
        categoryId: parseInt(form.categoryId),
        description: form.description.trim(),
        type: form.type,
        amount: form.amount,
        status: form.status
      }, entry?.id);
      onClose();
    } catch (err) {
      toast({ title: err.message || "Erro ao salvar.", status: "error", duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>{entry ? "Editar lançamento" : "Novo lançamento"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody display="flex" flexDirection="column" gap={4}>
          <FormControl isRequired>
            <FormLabel>Data</FormLabel>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Tipo</FormLabel>
            <ButtonGroup isAttached w="full">
              <Button
                flex={1}
                colorScheme={form.type === "income" ? "green" : "gray"}
                variant={form.type === "income" ? "solid" : "outline"}
                onClick={() => setForm({ ...form, type: "income" })}
                type="button"
              >
                Receita
              </Button>
              <Button
                flex={1}
                colorScheme={form.type === "expense" ? "red" : "gray"}
                variant={form.type === "expense" ? "solid" : "outline"}
                onClick={() => setForm({ ...form, type: "expense" })}
                type="button"
              >
                Despesa
              </Button>
            </ButtonGroup>
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Categoria</FormLabel>
            <Select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Histórico</FormLabel>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição do lançamento"
            />
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Valor</FormLabel>
            <InputGroup>
              <InputLeftAddon>R$</InputLeftAddon>
              <Input
                value={formatBRL(form.amount)}
                onChange={handleCurrencyChange}
                inputMode="numeric"
                placeholder="0,00"
              />
            </InputGroup>
          </FormControl>

          <FormControl>
            <FormLabel>Status</FormLabel>
            <HStack>
              <Button
                size="sm"
                colorScheme={form.status === "ok" ? "green" : "gray"}
                variant={form.status === "ok" ? "solid" : "outline"}
                onClick={() => setForm({ ...form, status: "ok" })}
                type="button"
              >
                Realizado
              </Button>
              <Button
                size="sm"
                colorScheme={form.status === "pending" ? "yellow" : "gray"}
                variant={form.status === "pending" ? "solid" : "outline"}
                onClick={() => setForm({ ...form, status: "pending" })}
                type="button"
              >
                Pendente
              </Button>
            </HStack>
          </FormControl>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>Cancelar</Button>
          <Button type="submit" colorScheme="blue" isLoading={saving}>
            {entry ? "Salvar" : "Criar"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CashFlowEntryModal;
