import { useEffect, useState, useCallback } from "react";
import {
  Badge, Box, Button, Flex, FormControl, FormLabel, Input, Spinner, Table, Tbody,
  Td, Th, Thead, Tr, Text, useColorModeValue, useDisclosure, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, Textarea,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import { fetchSuppliers, createSupplier, updateSupplier, deleteSupplier } from "../api";

const EMPTY = { name: "", document: "", contact: "", note: "" };

export default function SuppliersManagement() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useAppToast();

  const subtle = useColorModeValue("gray.500", "gray.400");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchSuppliers({ search }));
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar fornecedores", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setEditing(null); setDraft(EMPTY); onOpen(); };
  const openEdit = (s) => { setEditing(s); setDraft({ name: s.name, document: s.document || "", contact: s.contact || "", note: s.note || "" }); onOpen(); };

  const save = async () => {
    try {
      if (editing) await updateSupplier(editing.id, draft);
      else await createSupplier(draft);
      onClose();
      toast({ status: "success", title: editing ? "Fornecedor atualizado" : "Fornecedor criado" });
      load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao salvar", description: e.message });
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Inativar o fornecedor "${s.name}"?`)) return;
    try {
      await deleteSupplier(s.id);
      load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao inativar", description: e.message });
    }
  };

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Fornecedores</Text>
      <Text fontSize="sm" color={subtle} mb={4}>Cadastro próprio de fornecedores, usado para associar o custo por produto.</Text>

      <Flex gap={3} align="end" wrap="wrap" mb={4}>
        <FormControl maxW="280px">
          <FormLabel fontSize="sm">Buscar</FormLabel>
          <Input placeholder="nome ou documento" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} />
        </FormControl>
        <Button onClick={load}>Buscar</Button>
        <Button colorScheme="blue" ml="auto" onClick={openNew}>+ Novo fornecedor</Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={10}><Spinner /></Flex>
      ) : !items.length ? (
        <Text fontSize="sm" color={subtle}>Nenhum fornecedor cadastrado.</Text>
      ) : (
        <Box overflowX="auto">
          <Table size="sm">
            <Thead><Tr><Th>Fornecedor</Th><Th>Documento</Th><Th>Contato</Th><Th>Status</Th><Th isNumeric>Ações</Th></Tr></Thead>
            <Tbody>
              {items.map(s => (
                <Tr key={s.id}>
                  <Td>{s.name}</Td>
                  <Td>{s.document || "—"}</Td>
                  <Td color={subtle}>{s.contact || "—"}</Td>
                  <Td><Badge colorScheme={s.active ? "green" : "gray"}>{s.active ? "Ativo" : "Inativo"}</Badge></Td>
                  <Td isNumeric>
                    <Button size="xs" variant="outline" mr={2} onClick={() => openEdit(s)}>Editar</Button>
                    <Button size="xs" variant="outline" colorScheme="red" onClick={() => remove(s)}>Inativar</Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? "Editar fornecedor" : "Novo fornecedor"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb={3} isRequired>
              <FormLabel fontSize="sm">Nome</FormLabel>
              <Input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </FormControl>
            <FormControl mb={3}>
              <FormLabel fontSize="sm">Documento (CNPJ/CPF)</FormLabel>
              <Input value={draft.document} onChange={e => setDraft(d => ({ ...d, document: e.target.value }))} />
            </FormControl>
            <FormControl mb={3}>
              <FormLabel fontSize="sm">Contato</FormLabel>
              <Input value={draft.contact} onChange={e => setDraft(d => ({ ...d, contact: e.target.value }))} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Observação</FormLabel>
              <Textarea value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>Cancelar</Button>
            <Button colorScheme="blue" onClick={save} isDisabled={!draft.name.trim()}>Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
