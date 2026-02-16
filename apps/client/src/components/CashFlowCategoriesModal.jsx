import { useState, useEffect } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Input,
  IconButton,
  HStack,
  Badge,
  Button,
  useToast,
  useColorModeValue
} from "@chakra-ui/react";
import { AddIcon, EditIcon, DeleteIcon, CheckIcon, CloseIcon } from "@chakra-ui/icons";
import {
  fetchCashflowCategories,
  createCashflowCategory,
  updateCashflowCategory,
  deleteCashflowCategory
} from "../api";

const CashFlowCategoriesModal = ({ isOpen, onClose, onCategoriesChange }) => {
  const [categories, setCategories] = useState([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const headerBg = useColorModeValue("gray.50", "gray.700");

  const load = async () => {
    try {
      const data = await fetchCashflowCategories();
      setCategories(data);
    } catch (err) {
      toast({ title: "Erro ao carregar categorias.", status: "error", duration: 3000 });
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await createCashflowCategory(newName.trim());
      setNewName("");
      await load();
      onCategoriesChange?.();
    } catch (err) {
      toast({ title: err.message || "Erro ao criar categoria.", status: "error", duration: 3000 });
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (id) => {
    if (!editingName.trim()) return;
    try {
      await updateCashflowCategory(id, editingName.trim());
      setEditingId(null);
      await load();
      onCategoriesChange?.();
    } catch (err) {
      toast({ title: err.message || "Erro ao atualizar categoria.", status: "error", duration: 3000 });
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteCashflowCategory(id);
      await load();
      onCategoriesChange?.();
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir categoria.", status: "error", duration: 3000 });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Gerenciar categorias</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <HStack mb={4}>
            <Input
              placeholder="Nova categoria..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button
              leftIcon={<AddIcon />}
              colorScheme="blue"
              onClick={handleCreate}
              isLoading={adding}
              flexShrink={0}
            >
              Criar
            </Button>
          </HStack>

          <TableContainer>
            <Table size="sm">
              <Thead>
                <Tr bg={headerBg}>
                  <Th>Nome</Th>
                  <Th w="80px">Tipo</Th>
                  <Th w="100px" textAlign="right">Ações</Th>
                </Tr>
              </Thead>
              <Tbody>
                {categories.map((cat) => (
                  <Tr key={cat.id}>
                    <Td>
                      {editingId === cat.id ? (
                        <Input
                          size="sm"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleUpdate(cat.id)}
                          autoFocus
                        />
                      ) : (
                        cat.name
                      )}
                    </Td>
                    <Td>
                      <Badge colorScheme={cat.preset ? "purple" : "blue"} fontSize="xs">
                        {cat.preset ? "Padrão" : "Custom"}
                      </Badge>
                    </Td>
                    <Td textAlign="right">
                      {editingId === cat.id ? (
                        <HStack justify="flex-end" spacing={1}>
                          <IconButton
                            icon={<CheckIcon />}
                            size="xs"
                            colorScheme="green"
                            aria-label="Confirmar"
                            onClick={() => handleUpdate(cat.id)}
                          />
                          <IconButton
                            icon={<CloseIcon />}
                            size="xs"
                            aria-label="Cancelar"
                            onClick={() => setEditingId(null)}
                          />
                        </HStack>
                      ) : !cat.preset ? (
                        <HStack justify="flex-end" spacing={1}>
                          <IconButton
                            icon={<EditIcon />}
                            size="xs"
                            variant="ghost"
                            aria-label="Editar"
                            onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }}
                          />
                          <IconButton
                            icon={<DeleteIcon />}
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            aria-label="Excluir"
                            onClick={() => handleDelete(cat.id)}
                          />
                        </HStack>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default CashFlowCategoriesModal;
