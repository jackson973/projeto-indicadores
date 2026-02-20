import { useEffect, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Select,
  Switch,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useColorModeValue,
  useDisclosure,
  useToast
} from "@chakra-ui/react";
import { AddIcon, EditIcon, DeleteIcon } from "@chakra-ui/icons";
import { fetchUsers, createUser, updateUser, updateUserPassword, deleteUser } from "../api";

const formatPhoneDisplay = (value) => {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 12) {
    // +55 (XX) XXXXX-XXXX or +55 (XX) XXXX-XXXX
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length >= 9) {
      return `+${digits.slice(0, 2)} (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
    }
    return `+${digits.slice(0, 2)} (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return value;
};

const applyPhoneMask = (value) => {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 13) digits = digits.slice(0, 13);

  // Build mask: +55 (XX) XXXXX-XXXX
  if (digits.length <= 2) return digits;
  let result = `+${digits.slice(0, 2)}`;
  if (digits.length > 2) result += ` (${digits.slice(2, 4)}`;
  if (digits.length >= 4) result += `)`;
  if (digits.length > 4) result += ` ${digits.slice(4, 9)}`;
  if (digits.length > 9) result += `-${digits.slice(9, 13)}`;
  return result;
};

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user", active: true, whatsapp: "" });
  const [saving, setSaving] = useState(false);
  const modal = useDisclosure();
  const toast = useToast();

  const panelBg = useColorModeValue("white", "gray.800");
  const headerBg = useColorModeValue("gray.50", "gray.700");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message || "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ name: "", email: "", password: "", role: "user", active: true, whatsapp: "" });
    modal.onOpen();
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, password: "", role: user.role, active: user.active, whatsapp: user.whatsapp || "" });
    modal.onOpen();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: form.name,
          email: form.email,
          role: form.role,
          active: form.active,
          whatsapp: form.whatsapp
        });
        if (form.password) {
          await updateUserPassword(editingUser.id, form.password);
        }
        toast({ title: "Usuário atualizado.", status: "success", duration: 3000 });
      } else {
        await createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          whatsapp: form.whatsapp
        });
        toast({ title: "Usuário criado.", status: "success", duration: 3000 });
      }
      modal.onClose();
      await loadUsers();
    } catch (err) {
      toast({ title: err.message || "Erro ao salvar.", status: "error", duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Excluir o usuário "${user.name}"?`)) return;
    try {
      await deleteUser(user.id);
      toast({ title: "Usuário excluído.", status: "success", duration: 3000 });
      await loadUsers();
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir.", status: "error", duration: 5000 });
    }
  };

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("pt-BR");
  };

  return (
    <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm" maxW="960px" mx="auto" mt={8}>
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="bold">Gerenciar usuários</Text>
        <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm" onClick={openCreate}>
          Novo usuário
        </Button>
      </Flex>

      {error && (
        <Alert status="error" borderRadius="md" mb={4}>
          <AlertIcon />
          {error}
        </Alert>
      )}

      <TableContainer>
        <Table size="sm">
          <Thead bg={headerBg}>
            <Tr>
              <Th>Nome</Th>
              <Th>E-mail</Th>
              <Th>WhatsApp</Th>
              <Th>Perfil</Th>
              <Th>Status</Th>
              <Th>Criado em</Th>
              <Th>Ações</Th>
            </Tr>
          </Thead>
          <Tbody>
            {users.map((user) => (
              <Tr key={user.id}>
                <Td>{user.name}</Td>
                <Td>{user.email}</Td>
                <Td>{formatPhoneDisplay(user.whatsapp)}</Td>
                <Td>
                  <Badge colorScheme={user.role === "admin" ? "purple" : "gray"}>
                    {user.role === "admin" ? "Admin" : "Usuário"}
                  </Badge>
                </Td>
                <Td>
                  <Badge colorScheme={user.active ? "green" : "red"}>
                    {user.active ? "Ativo" : "Inativo"}
                  </Badge>
                </Td>
                <Td>{formatDate(user.createdAt)}</Td>
                <Td>
                  <HStack spacing={1}>
                    <IconButton
                      icon={<EditIcon />}
                      size="xs"
                      variant="ghost"
                      aria-label="Editar"
                      onClick={() => openEdit(user)}
                    />
                    <IconButton
                      icon={<DeleteIcon />}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      aria-label="Excluir"
                      onClick={() => handleDelete(user)}
                    />
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      <Modal isOpen={modal.isOpen} onClose={modal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editingUser ? "Editar usuário" : "Novo usuário"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Nome</FormLabel>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>E-mail</FormLabel>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </FormControl>
              <FormControl isRequired={!editingUser}>
                <FormLabel>{editingUser ? "Nova senha (deixe vazio para manter)" : "Senha"}</FormLabel>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingUser ? "Deixe vazio para não alterar" : "Mínimo 6 caracteres"}
                />
              </FormControl>
              <FormControl>
                <FormLabel>WhatsApp</FormLabel>
                <Input
                  value={applyPhoneMask(form.whatsapp)}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, "") })}
                  placeholder="+55 (11) 99999-9999"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Perfil</FormLabel>
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </Select>
              </FormControl>
              {editingUser && (
                <FormControl display="flex" alignItems="center">
                  <FormLabel mb={0}>Ativo</FormLabel>
                  <Switch
                    isChecked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                </FormControl>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={modal.onClose}>Cancelar</Button>
            <Button colorScheme="blue" onClick={handleSave} isLoading={saving}>
              {editingUser ? "Salvar" : "Criar"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default UsersManagement;
