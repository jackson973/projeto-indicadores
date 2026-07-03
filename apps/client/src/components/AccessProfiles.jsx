import { useEffect, useState, useCallback } from "react";
import {
  Badge, Box, Button, Checkbox, Flex, FormControl, FormLabel, Input, Select, SimpleGrid,
  Spinner, Table, Tbody, Td, Th, Thead, Tr, Text, useColorModeValue, useDisclosure,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import {
  fetchAccessModules, fetchAccessProfiles, createAccessProfile, updateAccessProfile,
  deleteAccessProfile, fetchUsers, assignUserProfile,
} from "../api";

export default function AccessProfiles() {
  const [modules, setModules] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ name: "", is_admin: false, modules: [] });
  const [editing, setEditing] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useAppToast();

  const subtle = useColorModeValue("gray.500", "gray.400");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p, u] = await Promise.all([fetchAccessModules(), fetchAccessProfiles(), fetchUsers()]);
      setModules(m); setProfiles(p); setUsers(u);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar", description: e.message });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setDraft({ name: "", is_admin: false, modules: [] }); onOpen(); };
  const openEdit = (p) => { setEditing(p); setDraft({ name: p.name, is_admin: p.is_admin, modules: p.modules || [] }); onOpen(); };
  const toggleModule = (k) => setDraft(d => ({ ...d, modules: d.modules.includes(k) ? d.modules.filter(x => x !== k) : [...d.modules, k] }));

  const save = async () => {
    try {
      if (editing) await updateAccessProfile(editing.id, draft);
      else await createAccessProfile(draft);
      onClose(); toast({ status: "success", title: "Perfil salvo" }); load();
    } catch (e) { toast({ status: "error", title: "Erro ao salvar", description: e.message }); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Excluir o perfil "${p.name}"? Usuários ficarão sem perfil.`)) return;
    try { await deleteAccessProfile(p.id); load(); } catch (e) { toast({ status: "error", title: "Erro", description: e.message }); }
  };
  const setUserProfile = async (userId, profileId) => {
    try { await assignUserProfile(userId, profileId ? Number(profileId) : null); toast({ status: "success", title: "Perfil atribuído" }); load(); }
    catch (e) { toast({ status: "error", title: "Erro", description: e.message }); }
  };

  if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Perfis de Acesso</Text>
      <Text fontSize="sm" color={subtle} mb={4}>Defina quais módulos cada perfil acessa e associe o perfil aos usuários. Usuários sem perfil (ou admin) veem tudo.</Text>

      <Flex mb={2}><Text fontWeight="semibold">Perfis</Text><Button size="sm" colorScheme="blue" ml="auto" onClick={openNew}>+ Novo perfil</Button></Flex>
      <Box overflowX="auto" mb={6}>
        <Table size="sm">
          <Thead><Tr><Th>Perfil</Th><Th>Módulos</Th><Th isNumeric>Usuários</Th><Th isNumeric>Ações</Th></Tr></Thead>
          <Tbody>
            {profiles.map(p => (
              <Tr key={p.id}>
                <Td fontWeight="semibold">{p.name}</Td>
                <Td>{p.is_admin ? <Badge colorScheme="purple">Acesso total</Badge> : (p.modules?.length ? p.modules.map(k => <Badge key={k} mr={1} mb={1}>{modules.find(m => m.key === k)?.label || k}</Badge>) : <Text as="span" color={subtle} fontSize="sm">nenhum</Text>)}</Td>
                <Td isNumeric>{p.user_count}</Td>
                <Td isNumeric>
                  <Button size="xs" variant="outline" mr={2} onClick={() => openEdit(p)}>Editar</Button>
                  <Button size="xs" variant="outline" colorScheme="red" onClick={() => remove(p)}>Excluir</Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      <Text fontWeight="semibold" mb={2}>Usuários</Text>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr><Th>Usuário</Th><Th>E-mail</Th><Th>Papel</Th><Th>Perfil</Th></Tr></Thead>
          <Tbody>
            {users.map(u => (
              <Tr key={u.id}>
                <Td>{u.name}</Td>
                <Td color={subtle}>{u.email}</Td>
                <Td><Badge colorScheme={u.role === "admin" ? "purple" : "gray"}>{u.role}</Badge></Td>
                <Td>
                  <Select size="sm" maxW="220px" value={u.profile_id || ""} onChange={e => setUserProfile(u.id, e.target.value)}>
                    <option value="">— sem perfil (vê tudo) —</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? "Editar perfil" : "Novo perfil"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb={3} isRequired>
              <FormLabel fontSize="sm">Nome</FormLabel>
              <Input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </FormControl>
            <Checkbox mb={3} isChecked={draft.is_admin} onChange={e => setDraft(d => ({ ...d, is_admin: e.target.checked }))}>
              Acesso total (ignora a seleção de módulos)
            </Checkbox>
            {!draft.is_admin && (
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>Módulos acessíveis</Text>
                <SimpleGrid columns={2} spacing={2}>
                  {modules.map(m => (
                    <Checkbox key={m.key} isChecked={draft.modules.includes(m.key)} onChange={() => toggleModule(m.key)}>{m.label}</Checkbox>
                  ))}
                </SimpleGrid>
              </Box>
            )}
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
