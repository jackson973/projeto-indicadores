import { useState, useEffect } from "react";
import {
  Badge, Box, Button, Flex, HStack, IconButton, Input, Modal,
  ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader,
  ModalOverlay, Spinner, Text, useColorModeValue, useDisclosure, useToast, VStack,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, EditIcon } from "@chakra-ui/icons";
import {
  fetchPaymentConditions, createPaymentCondition,
  updatePaymentCondition, deletePaymentCondition,
} from "../api";

function toErpPreview(terms) {
  const nums = String(terms || "").match(/\d+/g);
  if (!nums || nums.length === 0) return "";
  return nums.map(n => n.padEnd(3, " ")).join("");
}

const EMPTY = { name: "", terms: "" };

export default function PaymentConditionsConfig() {
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState(EMPTY);
  const [editingId, setEditingId]   = useState(null);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast      = useToast();
  const cardBg     = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const mutedColor  = useColorModeValue("gray.500", "gray.400");
  const rowBg       = useColorModeValue("gray.50", "gray.700");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setConditions(await fetchPaymentConditions()); }
    catch (err) { toast({ status: "error", description: err.message, duration: 3000 }); }
    finally { setLoading(false); }
  }

  function openNew() {
    setForm(EMPTY);
    setEditingId(null);
    onOpen();
  }

  function openEdit(c) {
    // Reconstruct terms from erp_code: parse numbers
    const nums = c.erp_code.match(/\d+/g) || [];
    setForm({ name: c.name, terms: nums.join(" ") });
    setEditingId(c.id);
    onOpen();
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ status: "warning", description: "Informe o nome.", duration: 2500 }); return;
    }
    if (!form.terms.trim()) {
      toast({ status: "warning", description: "Informe as parcelas.", duration: 2500 }); return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), terms: form.terms.trim(), sort_order: conditions.length };
      if (editingId) {
        const updated = await updatePaymentCondition(editingId, payload);
        setConditions(prev => prev.map(c => c.id === editingId ? updated : c));
      } else {
        const created = await createPaymentCondition(payload);
        setConditions(prev => [...prev, created]);
      }
      onClose();
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    try {
      await deletePaymentCondition(id);
      setConditions(prev => prev.filter(c => c.id !== id));
      toast({ status: "success", description: "Condição removida.", duration: 2000 });
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    }
  }

  return (
    <Box maxW="700px" mx="auto" px={{ base: 2, md: 4 }} py={6}>
      <Flex align="center" justify="space-between" mb={6}>
        <Box>
          <Text fontSize="xl" fontWeight="bold">Condições de Pagamento</Text>
          <Text fontSize="xs" color={mutedColor}>{conditions.length} condição{conditions.length !== 1 ? "s" : ""}</Text>
        </Box>
        <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm" borderRadius="lg" onClick={openNew}>
          Nova Condição
        </Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={16}><Spinner color="blue.500" /></Flex>
      ) : conditions.length === 0 ? (
        <Box py={12} textAlign="center" color={mutedColor}>
          <Text>Nenhuma condição cadastrada.</Text>
        </Box>
      ) : (
        <VStack spacing={2} align="stretch">
          {conditions.map(c => (
            <Box
              key={c.id}
              bg={cardBg}
              borderRadius="xl"
              border="1px solid"
              borderColor={borderColor}
              p={4}
              boxShadow="sm"
            >
              <Flex justify="space-between" align="center">
                <Box>
                  <Text fontWeight="semibold" fontSize="sm">{c.name}</Text>
                  <HStack mt={1} spacing={2}>
                    <Text fontSize="xs" color={mutedColor}>Código ERP:</Text>
                    <Badge
                      fontFamily="mono" fontSize="xs" bg={rowBg}
                      color={mutedColor} px={2} py={0.5} borderRadius="md"
                    >
                      {c.erp_code || "—"}
                    </Badge>
                  </HStack>
                </Box>
                <HStack spacing={1}>
                  <IconButton
                    icon={<EditIcon />} size="sm" variant="ghost"
                    colorScheme="blue" borderRadius="lg"
                    aria-label="Editar" onClick={() => openEdit(c)}
                  />
                  <IconButton
                    icon={<DeleteIcon />} size="sm" variant="ghost"
                    colorScheme="red" borderRadius="lg"
                    aria-label="Excluir" onClick={() => handleDelete(c.id)}
                  />
                </HStack>
              </Flex>
            </Box>
          ))}
        </VStack>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">{editingId ? "Editar Condição" : "Nova Condição"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>Nome</Text>
                <Input
                  size="sm" borderRadius="lg" placeholder="ex: À Vista, 30/60/90"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </Box>
              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>Parcelas</Text>
                <Text fontSize="xs" color={mutedColor} mb={1}>
                  Números separados por espaço. Ex: <strong>30 60 90</strong> ou <strong>0</strong> para à vista.
                </Text>
                <Input
                  size="sm" borderRadius="lg" placeholder="ex: 30 60 90"
                  value={form.terms}
                  onChange={e => setForm(f => ({ ...f, terms: e.target.value }))}
                />
              </Box>
              {form.terms.trim() && (
                <Box w="full" bg={rowBg} borderRadius="lg" p={3}>
                  <Text fontSize="xs" color={mutedColor} mb={1}>Código ERP gerado:</Text>
                  <Text fontFamily="mono" fontSize="sm" fontWeight="bold" letterSpacing="wide">
                    "{toErpPreview(form.terms)}"
                  </Text>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button size="sm" colorScheme="blue" borderRadius="lg" isLoading={saving} onClick={handleSave}>
              Salvar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
