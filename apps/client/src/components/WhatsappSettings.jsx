import { useState, useEffect, useRef } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputRightElement,
  Select,
  SimpleGrid,
  Spinner,
  Switch,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  VStack,
  useColorModeValue,
  useToast
} from "@chakra-ui/react";
import { DeleteIcon, ViewIcon, ViewOffIcon, CopyIcon } from "@chakra-ui/icons";
import {
  fetchWhatsappSettings,
  updateWhatsappSettings,
  testWhatsappLlm,
  connectWhatsapp,
  disconnectWhatsapp,
  fetchWhatsappPhones,
  deleteWhatsappPhone,
  getToken
} from "../api";

const LLM_PROVIDERS = [
  { value: "groq", label: "Groq (gratuito)", needsKey: true },
  { value: "claude", label: "Claude (Anthropic)", needsKey: true },
  { value: "ollama", label: "Ollama (local)", needsKey: false }
];

const LLM_MODELS = {
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (rápido)" },
    { value: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
    { value: "qwen/qwen-3-32b", label: "Qwen 3 32B" }
  ],
  claude: [
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (econômico)" }
  ],
  ollama: [
    { value: "llama3.1", label: "Llama 3.1" },
    { value: "mistral", label: "Mistral" },
    { value: "qwen2.5", label: "Qwen 2.5" }
  ]
};

const DEFAULT_PROMPT = `Você é um assistente interno da fábrica. Ajude os usuários com informações sobre vendas, financeiro, boletos e notas fiscais. Seja objetivo e amigável.`;

const API_BASE = window.location.hostname === "localhost"
  ? `http://localhost:4000`
  : "";

const WhatsappSettings = () => {
  const [form, setForm] = useState({
    active: false,
    llmProvider: "groq",
    llmApiKey: "",
    llmModel: "llama-3.3-70b-versatile",
    llmBaseUrl: "",
    systemPrompt: DEFAULT_PROMPT,
    featureSales: true,
    featureCashflow: true,
    featureBoleto: false,
    featureNf: false,
    boletoPath: "",
    nfPath: ""
  });
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [testResponse, setTestResponse] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [liveStatus, setLiveStatus] = useState("disconnected");
  const [savedPhones, setSavedPhones] = useState([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [lastUsedLlmConfig, setLastUsedLlmConfig] = useState(null);
  const eventSourceRef = useRef(null);
  const toast = useToast();

  const panelBg = useColorModeValue("white", "gray.800");
  const refBg = useColorModeValue("gray.50", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  useEffect(() => {
    loadSettings();
    loadSavedPhones();
    try {
      const saved = localStorage.getItem("indicadores_lastUsed_llmConfig");
      if (saved) setLastUsedLlmConfig(JSON.parse(saved));
    } catch { /* ignore */ }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Setup SSE connection for real-time updates
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `${API_BASE}/api/whatsapp/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("status", (e) => {
      try {
        const data = JSON.parse(e.data);
        setLiveStatus(data.status);
        if (data.status === "connected") {
          setQrCode(null);
          setConnecting(false);
          setStatus(prev => ({ ...prev, connected: true, connectedPhone: data.phone || prev.connectedPhone }));
          loadSavedPhones();
        } else if (data.status === "disconnected") {
          setQrCode(null);
          setStatus(prev => ({ ...prev, connected: false }));
        } else if (data.status === "connecting") {
          setStatus(prev => ({ ...prev, connected: false }));
        }
      } catch { /* ignore */ }
    });

    es.addEventListener("qr", (e) => {
      try {
        const data = JSON.parse(e.data);
        setQrCode(data.qr);
        setConnecting(false);
        setLiveStatus("waiting_qr");
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => es.close();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await fetchWhatsappSettings();
      const provider = data.llmProvider || "groq";
      const validModels = (LLM_MODELS[provider] || []).map(m => m.value);
      const model = validModels.includes(data.llmModel)
        ? data.llmModel
        : validModels[0] || "";
      setForm({
        active: data.active || false,
        llmProvider: provider,
        llmApiKey: data.llmApiKey || "",
        llmModel: model,
        llmBaseUrl: data.llmBaseUrl || "",
        systemPrompt: data.systemPrompt || DEFAULT_PROMPT,
        featureSales: data.featureSales !== false,
        featureCashflow: data.featureCashflow !== false,
        featureBoleto: data.featureBoleto || false,
        featureNf: data.featureNf || false,
        boletoPath: data.boletoPath || "",
        nfPath: data.nfPath || ""
      });
      setStatus({
        connected: data.connected,
        connectedPhone: data.connectedPhone,
        lastMessageAt: data.lastMessageAt,
        totalInteractions: data.totalInteractions
      });
      if (data.connected) {
        setLiveStatus("connected");
      }
      // Persist LLM config to localStorage for history
      if (data.llmApiKey) {
        const config = {
          provider: provider,
          model: model,
          apiKey: data.llmApiKey,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem("indicadores_lastUsed_llmConfig", JSON.stringify(config));
        setLastUsedLlmConfig(config);
      }
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const loadSavedPhones = async () => {
    try {
      const phones = await fetchWhatsappPhones();
      setSavedPhones(phones);
    } catch { /* ignore */ }
  };

  const handleDeletePhone = async (id) => {
    try {
      await deleteWhatsappPhone(id);
      await loadSavedPhones();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    }
  };

  const formatPhone = (phone) => {
    if (!phone) return "-";
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 13) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 12) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    return phone;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (form.llmApiKey) {
        const config = {
          provider: form.llmProvider,
          model: form.llmModel,
          apiKey: form.llmApiKey,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem("indicadores_lastUsed_llmConfig", JSON.stringify(config));
        setLastUsedLlmConfig(config);
      }
      await updateWhatsappSettings(form);
      toast({ title: "Configurações salvas com sucesso!", status: "success", duration: 3000 });
      await loadSettings();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setTestResponse("");
    try {
      const result = await testWhatsappLlm({
        llmProvider: form.llmProvider,
        llmApiKey: form.llmApiKey,
        llmModel: form.llmModel,
        llmBaseUrl: form.llmBaseUrl
      });
      setTestResponse(result.response);
      toast({ title: result.message, status: "success", duration: 3000 });
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setTestingLlm(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setQrCode(null);
    try {
      await connectWhatsapp();
      toast({ title: "Conexão iniciada. Aguarde o QR Code.", status: "info", duration: 3000 });
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectWhatsapp();
      setQrCode(null);
      setLiveStatus("disconnected");
      toast({ title: "Desconectado com sucesso.", status: "success", duration: 3000 });
      await loadSettings();
      await loadSavedPhones();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleProviderChange = (provider) => {
    const models = LLM_MODELS[provider] || [];
    setForm(prev => ({
      ...prev,
      llmProvider: provider,
      llmModel: models[0]?.value || "",
      llmApiKey: prev.llmProvider === provider ? prev.llmApiKey : "",
      llmBaseUrl: provider === "ollama" ? (prev.llmBaseUrl || "http://localhost:11434") : ""
    }));
    setTestResponse("");
  };

  const currentProvider = LLM_PROVIDERS.find(p => p.value === form.llmProvider);
  const currentModels = LLM_MODELS[form.llmProvider] || [];

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo"
    });
  };

  const getStatusBadge = () => {
    switch (liveStatus) {
      case "connected":
        return <Badge colorScheme="green" fontSize="sm" px={2} py={1}>Conectado</Badge>;
      case "connecting":
        return <Badge colorScheme="yellow" fontSize="sm" px={2} py={1}>Conectando...</Badge>;
      case "waiting_qr":
        return <Badge colorScheme="blue" fontSize="sm" px={2} py={1}>Aguardando QR Code</Badge>;
      default:
        return <Badge colorScheme="red" fontSize="sm" px={2} py={1}>Desconectado</Badge>;
    }
  };

  if (loading) {
    return (
      <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm" maxW="960px" mx="auto" mt={8}>
        <Text>Carregando...</Text>
      </Box>
    );
  }

  return (
    <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm" maxW="960px" mx="auto" mt={8}>
      <HStack justify="space-between" mb={6}>
        <Text fontSize="lg" fontWeight="bold">Configuração WhatsApp</Text>
        <HStack>
          <Text fontSize="sm">Ativo</Text>
          <Switch
            isChecked={form.active}
            onChange={(e) => setForm(prev => ({ ...prev, active: e.target.checked }))}
            colorScheme="green"
          />
        </HStack>
      </HStack>

      <VStack spacing={6} align="stretch">
        {/* Conexão WhatsApp */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Conexão WhatsApp</Text>
          <Box bg={refBg} p={4} borderRadius="md" border="1px solid" borderColor={borderColor}>
            <HStack spacing={3} mb={3}>
              {getStatusBadge()}
              {liveStatus === "connected" && status.connectedPhone && (
                <Text fontSize="sm" color="gray.500">{formatPhone(status.connectedPhone)}</Text>
              )}
            </HStack>

            {/* QR Code display */}
            {qrCode && (
              <Center mb={4}>
                <Box bg="white" p={3} borderRadius="md">
                  <Image src={qrCode} alt="QR Code WhatsApp" boxSize="250px" />
                  <Text fontSize="xs" color="gray.500" textAlign="center" mt={2}>
                    Escaneie com seu WhatsApp
                  </Text>
                </Box>
              </Center>
            )}

            {/* Connecting spinner */}
            {connecting && !qrCode && (
              <Center py={4}>
                <VStack spacing={2}>
                  <Spinner size="md" color="blue.500" />
                  <Text fontSize="sm" color="gray.500">Iniciando conexão...</Text>
                </VStack>
              </Center>
            )}

            {/* Connect/Disconnect buttons */}
            <HStack spacing={3}>
              {liveStatus !== "connected" && (
                <Button
                  size="sm"
                  colorScheme="green"
                  isLoading={connecting}
                  loadingText="Conectando..."
                  onClick={handleConnect}
                  isDisabled={!form.active}
                >
                  Conectar
                </Button>
              )}
              {(liveStatus === "connected" || liveStatus === "connecting" || liveStatus === "waiting_qr") && (
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  isLoading={disconnecting}
                  loadingText="Desconectando..."
                  onClick={handleDisconnect}
                >
                  Desconectar
                </Button>
              )}
            </HStack>

            {!form.active && liveStatus !== "connected" && (
              <Text fontSize="xs" color="orange.500" mt={2}>
                Ative o bot acima para poder conectar.
              </Text>
            )}
          </Box>

          {/* Saved phones history - always visible */}
          <Box mt={4}>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>Aparelhos conectados anteriormente</Text>
            {savedPhones.length > 0 ? (
              <TableContainer bg={refBg} borderRadius="md" border="1px solid" borderColor={borderColor}>
                <Table size="sm" variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Telefone</Th>
                      <Th>Última conexão</Th>
                      <Th w="50px"></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {savedPhones.map((p) => (
                      <Tr key={p.id}>
                        <Td>
                          <Text fontSize="sm">{formatPhone(p.phone)}</Text>
                        </Td>
                        <Td>
                          <Text fontSize="xs" color="gray.500">
                            {formatDate(p.lastConnectedAt)}
                          </Text>
                        </Td>
                        <Td>
                          <IconButton
                            icon={<DeleteIcon />}
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            aria-label="Remover"
                            onClick={() => handleDeletePhone(p.id)}
                          />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            ) : (
              <Text fontSize="xs" color="gray.500">
                Nenhum aparelho conectado anteriormente.
              </Text>
            )}
          </Box>
        </Box>

        <Divider />

        {/* Provedor LLM */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Provedor de LLM</Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Provedor</FormLabel>
              <Select
                size="sm"
                value={form.llmProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {LLM_PROVIDERS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Modelo</FormLabel>
              <Select
                size="sm"
                value={form.llmModel}
                onChange={(e) => setForm(prev => ({ ...prev, llmModel: e.target.value }))}
              >
                {currentModels.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </Select>
            </FormControl>
            {currentProvider?.needsKey && (
              <FormControl isRequired>
                <FormLabel fontSize="sm">API Key</FormLabel>
                <InputGroup size="sm">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={form.llmApiKey}
                    onChange={(e) => setForm(prev => ({ ...prev, llmApiKey: e.target.value }))}
                    placeholder="Sua chave de API"
                    pr="4.5rem"
                  />
                  <InputRightElement width="4.5rem">
                    <IconButton
                      h="1.5rem"
                      size="xs"
                      variant="ghost"
                      icon={showApiKey ? <ViewOffIcon /> : <ViewIcon />}
                      onClick={() => setShowApiKey(!showApiKey)}
                      aria-label={showApiKey ? "Ocultar" : "Mostrar"}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
            )}
            {form.llmProvider === "ollama" && (
              <FormControl>
                <FormLabel fontSize="sm">URL do Ollama</FormLabel>
                <Input
                  size="sm"
                  value={form.llmBaseUrl}
                  onChange={(e) => setForm(prev => ({ ...prev, llmBaseUrl: e.target.value }))}
                  placeholder="http://localhost:11434"
                />
              </FormControl>
            )}
          </SimpleGrid>
          <Button
            mt={3}
            size="sm"
            colorScheme="blue"
            variant="outline"
            isLoading={testingLlm}
            loadingText="Testando..."
            onClick={handleTestLlm}
          >
            Testar LLM
          </Button>
          {testResponse && (
            <Box mt={3} bg={refBg} p={3} borderRadius="md" border="1px solid" borderColor={borderColor}>
              <Text fontSize="xs" fontWeight="semibold" mb={1}>Resposta da LLM:</Text>
              <Text fontSize="sm">{testResponse}</Text>
            </Box>
          )}

          {/* Configuração LLM anterior */}
          <Box mt={4}>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>Configuração LLM anterior</Text>
            {lastUsedLlmConfig ? (
              <TableContainer bg={refBg} borderRadius="md" border="1px solid" borderColor={borderColor}>
                <Table size="sm" variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Provedor</Th>
                      <Th>Modelo</Th>
                      <Th>Chave API</Th>
                      <Th w="80px"></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    <Tr>
                      <Td>
                        <Text fontSize="sm">
                          {LLM_PROVIDERS.find(p => p.value === lastUsedLlmConfig.provider)?.label || lastUsedLlmConfig.provider}
                        </Text>
                      </Td>
                      <Td>
                        <Text fontSize="sm">
                          {Object.values(LLM_MODELS).flat().find(m => m.value === lastUsedLlmConfig.model)?.label || lastUsedLlmConfig.model}
                        </Text>
                      </Td>
                      <Td>
                        <Text fontSize="xs" fontFamily="mono">
                          {lastUsedLlmConfig.apiKey.slice(0, 8)}...{lastUsedLlmConfig.apiKey.slice(-4)}
                        </Text>
                      </Td>
                      <Td>
                        <HStack spacing={1}>
                          <IconButton
                            icon={<CopyIcon />}
                            size="xs"
                            variant="ghost"
                            aria-label="Copiar chave"
                            onClick={() => {
                              navigator.clipboard.writeText(lastUsedLlmConfig.apiKey);
                              toast({ title: "Chave copiada!", status: "success", duration: 2000 });
                            }}
                          />
                          <Button
                            size="xs"
                            variant="ghost"
                            colorScheme="blue"
                            onClick={() => setForm(prev => ({
                              ...prev,
                              llmProvider: lastUsedLlmConfig.provider,
                              llmModel: lastUsedLlmConfig.model,
                              llmApiKey: lastUsedLlmConfig.apiKey
                            }))}
                          >
                            Usar
                          </Button>
                        </HStack>
                      </Td>
                    </Tr>
                  </Tbody>
                </Table>
              </TableContainer>
            ) : (
              <Text fontSize="xs" color="gray.500">
                Nenhuma configuração salva anteriormente.
              </Text>
            )}
          </Box>
        </Box>

        <Divider />

        {/* System Prompt */}
        <Box>
          <Text fontWeight="semibold" mb={3}>System Prompt</Text>
          <FormControl>
            <FormLabel fontSize="sm">Instruções do assistente</FormLabel>
            <Textarea
              size="sm"
              rows={5}
              value={form.systemPrompt}
              onChange={(e) => setForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
              placeholder="Descreva como o assistente deve se comportar..."
            />
            <FormHelperText fontSize="xs">
              Define a personalidade e regras do bot. Quanto mais claro, melhor as respostas.
            </FormHelperText>
          </FormControl>
          <Button
            mt={2}
            size="xs"
            variant="ghost"
            onClick={() => setForm(prev => ({ ...prev, systemPrompt: DEFAULT_PROMPT }))}
          >
            Restaurar padrão
          </Button>
        </Box>

        <Divider />

        {/* Funcionalidades */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Funcionalidades</Text>
          <VStack spacing={3} align="stretch">
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb={0} fontSize="sm">Consultar vendas</FormLabel>
                <Text fontSize="xs" color="gray.500">Permite consultar resumo e dados de vendas</Text>
              </Box>
              <Switch
                isChecked={form.featureSales}
                onChange={(e) => setForm(prev => ({ ...prev, featureSales: e.target.checked }))}
                colorScheme="green"
              />
            </FormControl>
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb={0} fontSize="sm">Consultar financeiro</FormLabel>
                <Text fontSize="xs" color="gray.500">Permite consultar dados do fluxo de caixa</Text>
              </Box>
              <Switch
                isChecked={form.featureCashflow}
                onChange={(e) => setForm(prev => ({ ...prev, featureCashflow: e.target.checked }))}
                colorScheme="green"
              />
            </FormControl>
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb={0} fontSize="sm">Enviar boleto (PDF)</FormLabel>
                <Text fontSize="xs" color="gray.500">Permite buscar e enviar 2a via de boleto</Text>
              </Box>
              <Switch
                isChecked={form.featureBoleto}
                onChange={(e) => setForm(prev => ({ ...prev, featureBoleto: e.target.checked }))}
                colorScheme="green"
              />
            </FormControl>
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb={0} fontSize="sm">Enviar nota fiscal (PDF)</FormLabel>
                <Text fontSize="xs" color="gray.500">Permite buscar e enviar 2a via de NF</Text>
              </Box>
              <Switch
                isChecked={form.featureNf}
                onChange={(e) => setForm(prev => ({ ...prev, featureNf: e.target.checked }))}
                colorScheme="green"
              />
            </FormControl>
          </VStack>
        </Box>

        {/* Caminhos dos PDFs */}
        {form.featureBoleto && (
          <>
            <Divider />
            <Box>
              <Text fontWeight="semibold" mb={3}>Caminhos dos Arquivos (Servidor Sisplan)</Text>
              <SimpleGrid columns={{ base: 1, md: 1 }} spacing={4}>
                <FormControl>
                  <FormLabel fontSize="sm">Pasta dos Boletos</FormLabel>
                  <Input
                    size="sm"
                    value={form.boletoPath}
                    onChange={(e) => setForm(prev => ({ ...prev, boletoPath: e.target.value }))}
                    placeholder="\\\\servidor\\sisplan\\boletos"
                  />
                </FormControl>
              </SimpleGrid>
            </Box>
          </>
        )}

        <Divider />

        {/* Status */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Status</Text>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <Box>
              <Text fontSize="xs" color="gray.500">Última mensagem</Text>
              <Text fontSize="sm">{formatDate(status.lastMessageAt)}</Text>
            </Box>
            <Box>
              <Text fontSize="xs" color="gray.500">Total de interações</Text>
              <Text fontSize="sm">{status.totalInteractions || 0}</Text>
            </Box>
            <Box>
              <Text fontSize="xs" color="gray.500">Conexão</Text>
              {getStatusBadge()}
            </Box>
          </SimpleGrid>
        </Box>

        <Divider />

        {/* Salvar */}
        <Flex justify="flex-end" gap={3}>
          <Button
            colorScheme="blue"
            isLoading={saving}
            loadingText="Salvando..."
            onClick={handleSave}
          >
            Salvar Configurações
          </Button>
        </Flex>

        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Text fontSize="sm">
            Apenas usuários com número de WhatsApp cadastrado na tela de
            <strong> Gerenciar usuários</strong> poderão interagir com o bot.
          </Text>
        </Alert>
      </VStack>
    </Box>
  );
};

export default WhatsappSettings;
