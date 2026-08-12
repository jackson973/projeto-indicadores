import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Text,
  Tooltip,
  VStack,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, EditIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import {
  fetchStoresManagement,
  createStoreMgmt,
  updateStoreMgmt,
  deleteStoreMgmt,
  testStoreConnection,
  getStoreOAuthUrl,
  exchangeStoreOAuthCode,
} from "../api";
import useAppToast from "../hooks/useAppToast";

// ── Platform metadata ─────────────────────────────────────────────────────────

const PLATFORMS = {
  mercadolivre: {
    label: "Mercado Livre",
    color: "yellow",
    bg: "#FFE600",
    textColor: "#333",
    // Only credentials needed to start — tokens come via OAuth
    fields: ["client_id", "client_secret"],
    fieldLabels: { client_id: "Client ID", client_secret: "Client Secret" },
    hasOAuth: true,
  },
  shopee: {
    label: "Shopee",
    color: "orange",
    bg: "#EE4D2D",
    textColor: "#fff",
    fields: ["client_id", "client_secret"],
    fieldLabels: { client_id: "Partner ID", client_secret: "Partner Key" },
    hasOAuth: false,
  },
  tiktok: {
    label: "TikTok Shop",
    color: "gray",
    bg: "#010101",
    textColor: "#fff",
    fields: ["client_id", "client_secret"],
    fieldLabels: { client_id: "App Key", client_secret: "App Secret" },
    hasOAuth: false,
  },
  shein: {
    label: "Shein",
    color: "pink",
    bg: "#E53E3E",
    textColor: "#fff",
    fields: ["client_id", "client_secret"],
    fieldLabels: { client_id: "Client ID", client_secret: "Client Secret" },
    hasOAuth: false,
  },
};

const PLATFORM_OPTIONS = Object.entries(PLATFORMS).map(([value, { label }]) => ({ value, label }));

const EMPTY_FORM = {
  name: "",
  platform: "mercadolivre",
  client_id: "",
  client_secret: "",
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    connected: { label: "Conectada", color: "green" },
    disconnected: { label: "Desconectada", color: "gray" },
    error: { label: "Erro", color: "red" },
  };
  const { label, color } = map[status] || map.disconnected;
  return <Badge colorScheme={color} fontSize="xs">{label}</Badge>;
}

// ── Platform badge ────────────────────────────────────────────────────────────

function PlatformBadge({ platform }) {
  const p = PLATFORMS[platform];
  if (!p) return null;
  return (
    <Badge
      px={2}
      py={0.5}
      borderRadius="md"
      fontSize="xs"
      fontWeight="bold"
      bg={p.bg}
      color={p.textColor}
      letterSpacing="0.02em"
    >
      {p.label}
    </Badge>
  );
}

// ── Secret input (show/hide) ──────────────────────────────────────────────────

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup size="sm">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder || ""}
        fontFamily="mono"
        fontSize="xs"
        pr="2.5rem"
        autoComplete="new-password"
      />
      <InputRightElement width="2.5rem">
        <IconButton
          h="1.5rem"
          size="xs"
          variant="ghost"
          icon={show ? <ViewOffIcon /> : <ViewIcon />}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar" : "Mostrar"}
        />
      </InputRightElement>
    </InputGroup>
  );
}

// ── Store card ────────────────────────────────────────────────────────────────

function StoreCard({ store, onEdit, onDelete, onTest, testing, onAuthorize }) {
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const mutedColor = useColorModeValue("gray.500", "gray.400");

  const lastSync = store.last_sync_at
    ? new Date(store.last_sync_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Nunca";

  return (
    <Box
      bg={cardBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="lg"
      p={5}
      boxShadow="sm"
      transition="box-shadow 0.15s"
      _hover={{ boxShadow: "md" }}
    >
      <Flex justify="space-between" align="flex-start" mb={3}>
        <VStack align="flex-start" spacing={1}>
          <Text fontWeight="semibold" fontSize="md" lineHeight="short">{store.name}</Text>
          <HStack spacing={2}>
            <PlatformBadge platform={store.platform} />
            <StatusBadge status={store.status} />
          </HStack>
        </VStack>
        <HStack spacing={1}>
          {store.has_credentials && store.status !== 'disconnected' && (
            <Tooltip label="Testar conexão">
              <Button
                size="xs"
                variant="outline"
                colorScheme="blue"
                isLoading={testing}
                loadingText=""
                onClick={() => onTest(store.id)}
              >
                Testar
              </Button>
            </Tooltip>
          )}
          <Tooltip label="Editar">
            <IconButton size="xs" variant="ghost" icon={<EditIcon />} onClick={() => onEdit(store)} aria-label="Editar" />
          </Tooltip>
          <Tooltip label="Excluir">
            <IconButton size="xs" variant="ghost" colorScheme="red" icon={<DeleteIcon />} onClick={() => onDelete(store)} aria-label="Excluir" />
          </Tooltip>
        </HStack>
      </Flex>

      <Divider mb={3} />

      <Grid templateColumns="1fr 1fr" gap={2}>
        <Box>
          <Text fontSize="xs" color={mutedColor}>Anúncios ativos</Text>
          <Text fontSize="sm" fontWeight="medium">{store.total_listings ?? "—"}</Text>
        </Box>
        <Box>
          <Text fontSize="xs" color={mutedColor}>Última sincronização</Text>
          <Text fontSize="sm">{lastSync}</Text>
        </Box>
        {store.platform_seller_name && (
          <Box gridColumn="1 / -1">
            <Text fontSize="xs" color={mutedColor}>Nome na plataforma</Text>
            <Text fontSize="sm">{store.platform_seller_name}</Text>
          </Box>
        )}
      </Grid>

      {!store.has_credentials && (
        <Box mt={3} p={2} bg="orange.50" borderRadius="md" _dark={{ bg: "orange.900" }}>
          <Text fontSize="xs" color="orange.600" _dark={{ color: "orange.200" }}>
            Credenciais não configuradas. Edite a loja para adicionar.
          </Text>
        </Box>
      )}

      {store.has_credentials && store.status === 'disconnected' && PLATFORMS[store.platform]?.hasOAuth && (
        <Box mt={3}>
          <Button
            size="xs"
            colorScheme="yellow"
            color="gray.800"
            width="full"
            onClick={() => onAuthorize(store)}
          >
            Autorizar com Mercado Livre
          </Button>
        </Box>
      )}

      {store.has_credentials && (store.status === 'connected' || store.status === 'error') && (
        <Box mt={3} display="flex" flexDirection="column" gap={2}>
          {store.status === 'error' && (
            <Box p={2} bg="red.50" borderRadius="md" _dark={{ bg: "red.900" }}>
              <Text fontSize="xs" color="red.600" _dark={{ color: "red.200" }}>
                Falha na conexão. Reconecte a loja para renovar a autorização.
              </Text>
            </Box>
          )}
          <Button
            size="xs"
            variant="outline"
            colorScheme="blue"
            width="full"
            isLoading={testing}
            onClick={() => onTest(store.id)}
          >
            Sincronizar agora
          </Button>
          {PLATFORMS[store.platform]?.hasOAuth && (
            <Button
              size="xs"
              variant="outline"
              colorScheme="yellow"
              color="gray.700"
              width="full"
              onClick={() => onAuthorize(store)}
            >
              Reconectar / Atualizar permissões
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StoresManagement() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [editing, setEditing] = useState(null); // null = create, store = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [oauthStore, setOauthStore] = useState(null);   // store being authorized
  const [oauthCode, setOauthCode] = useState("");
  const [exchanging, setExchanging] = useState(false);

  const modal = useDisclosure();
  const deleteModal = useDisclosure();
  const oauthModal = useDisclosure();
  const toast = useAppToast();

  const panelBg = useColorModeValue("gray.50", "gray.800");
  const mutedColor = useColorModeValue("gray.500", "gray.400");

  // Load stores
  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
    setLoading(true);
    try {
      const data = await fetchStoresManagement();
      setStores(data);
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 4000 });
    } finally {
      setLoading(false);
    }
  }

  // Field change helper
  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Open modal for create
  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    modal.onOpen();
  }

  // Open modal for edit
  function openEdit(store) {
    setEditing(store);
    setForm({
      name: store.name,
      platform: store.platform,
      client_id: "",
      client_secret: "",
    });
    modal.onOpen();
  }

  // Save (create or update)
  async function handleSave() {
    if (!form.name.trim()) {
      toast({  title: "Nome da loja é obrigatório.", status: "warning" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        platform: form.platform,
      };

      // Only include credential fields if user typed something
      if (form.client_id) payload.client_id = form.client_id;
      if (form.client_secret) payload.client_secret = form.client_secret;

      if (editing) {
        const updated = await updateStoreMgmt(editing.id, payload);
        setStores((s) => s.map((st) => (st.id === updated.id ? updated : st)));
        toast({  title: "Loja atualizada!", status: "success" });
      } else {
        const created = await createStoreMgmt({ ...payload, platform: form.platform });
        setStores((s) => [...s, created]);
        toast({  title: "Loja criada!", status: "success" });
      }

      modal.onClose();
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 4000 });
    } finally {
      setSaving(false);
    }
  }

  // Test connection
  async function handleTest(id) {
    setTestingId(id);
    try {
      const result = await testStoreConnection(id);
      if (result.store) {
        setStores((s) => s.map((st) => (st.id === result.store.id ? result.store : st)));
      }
      toast({  title: result.message, status: "success", duration: 5000 });
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
      // Reload to reflect error status
      loadStores();
    } finally {
      setTestingId(null);
    }
  }

  // Delete
  function openDelete(store) {
    setDeleteTarget(store);
    deleteModal.onOpen();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteStoreMgmt(deleteTarget.id);
      setStores((s) => s.filter((st) => st.id !== deleteTarget.id));
      toast({  title: "Loja removida.", status: "info" });
      deleteModal.onClose();
    } catch (err) {
      toast({  title: err.message, status: "error" });
    } finally {
      setSaving(false);
    }
  }

  // OAuth: open authorize flow
  async function openAuthorize(store) {
    setOauthStore(store);
    setOauthCode("");
    try {
      const { url } = await getStoreOAuthUrl(store.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({  title: err.message, status: "error" });
      return;
    }
    oauthModal.onOpen();
  }

  // OAuth: exchange code for tokens
  async function handleExchangeCode() {
    if (!oauthCode.trim()) {
      toast({  title: "Cole o código de autorização.", status: "warning" });
      return;
    }
    setExchanging(true);
    try {
      const result = await exchangeStoreOAuthCode(oauthStore.id, oauthCode.trim());
      setStores((s) => s.map((st) => (st.id === result.store.id ? result.store : st)));
      toast({  title: result.message, status: result.warning ? "warning" : "success", duration: result.warning ? 12000 : 6000 });
      oauthModal.onClose();
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 6000 });
    } finally {
      setExchanging(false);
    }
  }

  // Platforms represented in current stores (for grouping)
  const platformGroups = Object.entries(PLATFORMS).map(([key, meta]) => ({
    key,
    meta,
    stores: stores.filter((s) => s.platform === key),
  }));

  const currentPlatform = PLATFORMS[form.platform];

  return (
    <Box p={6} maxW="1100px" mx="auto">
      {/* Header */}
      <Flex justify="space-between" align="center" mb={6}>
        <Box>
          <Text fontSize="2xl" fontWeight="bold">Gerenciamento de Lojas</Text>
          <Text fontSize="sm" color={mutedColor} mt={1}>
            Conecte suas contas nos marketplaces para monitorar anúncios e performance.
          </Text>
        </Box>
        <Button leftIcon={<AddIcon />} colorScheme="blue" size="sm" onClick={openCreate}>
          Nova Loja
        </Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner size="lg" color="blue.500" />
        </Flex>
      ) : stores.length === 0 ? (
        <Box bg={panelBg} borderRadius="xl" p={12} textAlign="center">
          <Text fontSize="lg" fontWeight="medium" mb={2}>Nenhuma loja conectada</Text>
          <Text color={mutedColor} fontSize="sm" mb={6}>
            Adicione sua primeira loja para começar a monitorar seus anúncios.
          </Text>
          <Button leftIcon={<AddIcon />} colorScheme="blue" onClick={openCreate}>
            Adicionar Loja
          </Button>
        </Box>
      ) : (
        <VStack spacing={8} align="stretch">
          {platformGroups
            .filter((g) => g.stores.length > 0)
            .map(({ key, meta, stores: groupStores }) => (
              <Box key={key}>
                <HStack mb={3} spacing={3}>
                  <Box w={3} h={3} borderRadius="full" bg={meta.bg} flexShrink={0} />
                  <Text fontWeight="semibold" fontSize="md">{meta.label}</Text>
                  <Badge colorScheme="gray" fontSize="xs">{groupStores.length}</Badge>
                </HStack>
                <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" }} gap={4}>
                  {groupStores.map((store) => (
                    <StoreCard
                      key={store.id}
                      store={store}
                      onEdit={openEdit}
                      onDelete={openDelete}
                      onTest={handleTest}
                      testing={testingId === store.id}
                      onAuthorize={openAuthorize}
                    />
                  ))}
                </Grid>
              </Box>
            ))}
        </VStack>
      )}

      {/* Add / Edit Modal */}
      <Modal isOpen={modal.isOpen} onClose={modal.onClose} size="lg">
        <ModalOverlay />
        <ModalContent as="form" autoComplete="off">
          <ModalHeader>{editing ? "Editar Loja" : "Nova Loja"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {/* Prevent browser from autofilling / prompting to save credentials */}
            <input type="text" name="fake_user" style={{ display: "none" }} autoComplete="username" readOnly />
            <input type="password" name="fake_pass" style={{ display: "none" }} autoComplete="new-password" readOnly />
            <VStack spacing={4} align="stretch">

              <FormControl isRequired>
                <FormLabel fontSize="sm">Nome da loja</FormLabel>
                <Input
                  size="sm"
                  placeholder="Ex: Tuck Kids - Mercado Livre"
                  value={form.name}
                  onChange={setField("name")}
                />
              </FormControl>

              <FormControl isRequired isDisabled={!!editing}>
                <FormLabel fontSize="sm">Plataforma</FormLabel>
                <Select size="sm" value={form.platform} onChange={setField("platform")}>
                  {PLATFORM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
                {editing && (
                  <Text fontSize="xs" color="gray.500" mt={1}>A plataforma não pode ser alterada após a criação.</Text>
                )}
              </FormControl>

              <Divider />

              <Text fontSize="sm" fontWeight="semibold" color="gray.600">
                Credenciais — {currentPlatform?.label}
              </Text>

              {editing && (
                <Box p={3} bg="blue.50" borderRadius="md" _dark={{ bg: "blue.900" }}>
                  <Text fontSize="xs" color="blue.600" _dark={{ color: "blue.200" }}>
                    Deixe um campo em branco para manter a credencial existente.
                  </Text>
                </Box>
              )}

              {currentPlatform?.fields.includes("client_id") && (
                <FormControl>
                  <FormLabel fontSize="sm">{currentPlatform.fieldLabels.client_id}</FormLabel>
                  <SecretInput
                    value={form.client_id}
                    onChange={setField("client_id")}
                    placeholder={editing ? "••••••••• (manter atual)" : ""}
                  />
                </FormControl>
              )}

              {currentPlatform?.fields.includes("client_secret") && (
                <FormControl>
                  <FormLabel fontSize="sm">{currentPlatform.fieldLabels.client_secret}</FormLabel>
                  <SecretInput
                    value={form.client_secret}
                    onChange={setField("client_secret")}
                    placeholder={editing ? "••••••••• (manter atual)" : ""}
                  />
                </FormControl>
              )}

            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button size="sm" variant="ghost" onClick={modal.onClose}>Cancelar</Button>
            <Button
              size="sm"
              colorScheme="blue"
              isLoading={saving}
              loadingText="Salvando..."
              onClick={handleSave}
            >
              {editing ? "Salvar" : "Criar Loja"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal isOpen={deleteModal.isOpen} onClose={deleteModal.onClose} size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Remover Loja</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm">
              Tem certeza que deseja remover <strong>{deleteTarget?.name}</strong>?
              Todas as credenciais serão apagadas permanentemente.
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button size="sm" variant="ghost" onClick={deleteModal.onClose}>Cancelar</Button>
            <Button size="sm" colorScheme="red" isLoading={saving} onClick={handleDelete}>
              Remover
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* OAuth authorization modal */}
      <Modal isOpen={oauthModal.isOpen} onClose={oauthModal.onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Autorizar — {oauthStore?.name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Box p={3} bg="blue.50" borderRadius="md" _dark={{ bg: "blue.900" }}>
                <Text fontSize="sm" fontWeight="semibold" color="blue.700" _dark={{ color: "blue.200" }} mb={1}>
                  Passo 1 — Já abrimos a tela de autorização do Mercado Livre
                </Text>
                <Text fontSize="sm" color="blue.600" _dark={{ color: "blue.300" }}>
                  Faça login e clique em <strong>Permitir acesso</strong>. Você será redirecionado para uma página httpbin.org.
                </Text>
              </Box>

              <Box p={3} bg="gray.50" borderRadius="md" _dark={{ bg: "gray.700" }}>
                <Text fontSize="sm" fontWeight="semibold" mb={1}>Passo 2 — Copie o código</Text>
                <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.300" }}>
                  Na página do httpbin.org, procure o campo <code style={{ background: "#e2e8f0", padding: "1px 4px", borderRadius: "3px" }}>"code"</code> no JSON e copie o valor.
                </Text>
              </Box>

              <FormControl>
                <FormLabel fontSize="sm">Passo 3 — Cole o código aqui</FormLabel>
                <Input
                  size="sm"
                  placeholder="TG-abc123..."
                  value={oauthCode}
                  onChange={(e) => setOauthCode(e.target.value)}
                  fontFamily="mono"
                  fontSize="xs"
                  autoComplete="off"
                />
              </FormControl>

              <Text fontSize="xs" color="gray.500">
                Não fechou a janela? <Button variant="link" size="xs" colorScheme="blue" onClick={() => openAuthorize(oauthStore)}>Abrir novamente</Button>
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button size="sm" variant="ghost" onClick={oauthModal.onClose}>Cancelar</Button>
            <Button
              size="sm"
              colorScheme="green"
              isLoading={exchanging}
              loadingText="Autorizando..."
              onClick={handleExchangeCode}
            >
              Autorizar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
