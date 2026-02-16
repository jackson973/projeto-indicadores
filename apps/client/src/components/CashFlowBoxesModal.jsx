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
  Button,
  useToast,
  useColorModeValue
} from "@chakra-ui/react";
import { AddIcon, EditIcon, DeleteIcon, CheckIcon, CloseIcon } from "@chakra-ui/icons";
import {
  fetchCashflowBoxes,
  createCashflowBox,
  updateCashflowBox,
  deleteCashflowBox
} from "../api";

const CashFlowBoxesModal = ({ isOpen, onClose, onBoxesChange }) => {
  const [boxes, setBoxes] = useState([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const headerBg = useColorModeValue("gray.50", "gray.700");

  const load = async () => {
    try {
      const data = await fetchCashflowBoxes();
      setBoxes(data);
    } catch (err) {
      toast({ title: "Erro ao carregar caixas.", status: "error", duration: 3000 });
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await createCashflowBox(newName.trim());
      setNewName("");
      await load();
      onBoxesChange?.();
    } catch (err) {
      toast({ title: err.message || "Erro ao criar caixa.", status: "error", duration: 3000 });
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (id) => {
    if (!editingName.trim()) return;
    try {
      await updateCashflowBox(id, editingName.trim());
      setEditingId(null);
      await load();
      onBoxesChange?.();
    } catch (err) {
      toast({ title: err.message || "Erro ao atualizar caixa.", status: "error", duration: 3000 });
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteCashflowBox(id);
      await load();
      onBoxesChange?.();
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir caixa.", status: "error", duration: 3000 });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Gerenciar caixas</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <HStack mb={4}>
            <Input
              placeholder="Novo caixa..."
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
                  <Th w="100px" textAlign="right">Ações</Th>
                </Tr>
              </Thead>
              <Tbody>
                {boxes.map((box) => (
                  <Tr key={box.id}>
                    <Td>
                      {editingId === box.id ? (
                        <Input
                          size="sm"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleUpdate(box.id)}
                          autoFocus
                        />
                      ) : (
                        box.name
                      )}
                    </Td>
                    <Td textAlign="right">
                      {editingId === box.id ? (
                        <HStack justify="flex-end" spacing={1}>
                          <IconButton
                            icon={<CheckIcon />}
                            size="xs"
                            colorScheme="green"
                            aria-label="Confirmar"
                            onClick={() => handleUpdate(box.id)}
                          />
                          <IconButton
                            icon={<CloseIcon />}
                            size="xs"
                            aria-label="Cancelar"
                            onClick={() => setEditingId(null)}
                          />
                        </HStack>
                      ) : (
                        <HStack justify="flex-end" spacing={1}>
                          <IconButton
                            icon={<EditIcon />}
                            size="xs"
                            variant="ghost"
                            aria-label="Editar"
                            onClick={() => { setEditingId(box.id); setEditingName(box.name); }}
                          />
                          <IconButton
                            icon={<DeleteIcon />}
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            aria-label="Excluir"
                            onClick={() => handleDelete(box.id)}
                          />
                        </HStack>
                      )}
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

export default CashFlowBoxesModal;
