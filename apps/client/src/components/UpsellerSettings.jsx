import { useState, useEffect } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Switch,
  Text,
  VStack,
  useColorModeValue,
  useToast
} from "@chakra-ui/react";
import {
  fetchUpsellerSettings,
  updateUpsellerSettings,
  triggerUpsellerSync
} from "../api";

const UpsellerSettings = () => {
  const [form, setForm] = useState({
    active: false,
    upsellerEmail: "",
    upsellerPassword: "",
    upsellerUrl: "https://app.upseller.com/pt/login",
    anticaptchaKey: "",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapUser: "",
    imapPass: "",
    syncIntervalMinutes: 60,
    defaultDays: 90
  });
  const [syncStatus, setSyncStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();

  const panelBg = useColorModeValue("white", "gray.800");
  const sectionBg = useColorModeValue("gray.50", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await fetchUpsellerSettings();
      setForm({
        active: data.active || false,
        upsellerEmail: data.upsellerEmail || "",
        upsellerPassword: data.upsellerPassword || "",
        upsellerUrl: data.upsellerUrl || "https://app.upseller.com/pt/login",
        anticaptchaKey: data.anticaptchaKey || "",
        imapHost: data.imapHost || "imap.gmail.com",
        imapPort: data.imapPort || 993,
        imapUser: data.imapUser || "",
        imapPass: data.imapPass || "",
        syncIntervalMinutes: data.syncIntervalMinutes || 60,
        defaultDays: data.defaultDays || 90
      });
      setSyncStatus({
        lastSyncAt: data.lastSyncAt,
        lastSyncStatus: data.lastSyncStatus,
        lastSyncMessage: data.lastSyncMessage,
        lastSyncRows: data.lastSyncRows
      });
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUpsellerSettings(form);
      toast({ title: "Configuracoes salvas com sucesso!", status: "success", duration: 3000 });
      await loadSettings();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerUpsellerSync();
      toast({ title: result.message, status: "success", duration: 4000 });
      await loadSettings();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setSyncing(false);
    }
  };

  const formatSyncDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo"
    });
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
        <Text fontSize="lg" fontWeight="bold">Integracao UpSeller</Text>
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
        {/* Credenciais UpSeller */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Credenciais UpSeller</Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Email</FormLabel>
              <Input
                size="sm"
                value={form.upsellerEmail}
                onChange={(e) => setForm(prev => ({ ...prev, upsellerEmail: e.target.value }))}
                placeholder="usuario@email.com"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Senha</FormLabel>
              <Input
                size="sm"
                type="password"
                value={form.upsellerPassword}
                onChange={(e) => setForm(prev => ({ ...prev, upsellerPassword: e.target.value }))}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">URL de Login</FormLabel>
              <Input
                size="sm"
                value={form.upsellerUrl}
                onChange={(e) => setForm(prev => ({ ...prev, upsellerUrl: e.target.value }))}
                placeholder="https://app.upseller.com/pt/login"
              />
            </FormControl>
          </SimpleGrid>
        </Box>

        <Divider />

        {/* CAPTCHA */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Resolucao de CAPTCHA</Text>
          <FormControl isRequired>
            <FormLabel fontSize="sm">Chave API AntiCaptcha</FormLabel>
            <Input
              size="sm"
              type="password"
              value={form.anticaptchaKey}
              onChange={(e) => setForm(prev => ({ ...prev, anticaptchaKey: e.target.value }))}
              placeholder="Chave da API anti-captcha.com"
            />
          </FormControl>
          <Box bg={sectionBg} p={3} borderRadius="md" mt={2} border="1px solid" borderColor={borderColor}>
            <Text fontSize="xs" color="gray.500">
              O UpSeller exige resolucao de CAPTCHA por imagem no login.
              Cadastre-se em anti-captcha.com para obter uma chave de API.
            </Text>
          </Box>
        </Box>

        <Divider />

        {/* IMAP */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Email IMAP (Verificacao 2FA)</Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel fontSize="sm">Servidor IMAP</FormLabel>
              <Input
                size="sm"
                value={form.imapHost}
                onChange={(e) => setForm(prev => ({ ...prev, imapHost: e.target.value }))}
                placeholder="imap.gmail.com"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Porta</FormLabel>
              <Input
                size="sm"
                type="number"
                value={form.imapPort}
                onChange={(e) => setForm(prev => ({ ...prev, imapPort: parseInt(e.target.value) || 993 }))}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Usuario IMAP</FormLabel>
              <Input
                size="sm"
                value={form.imapUser}
                onChange={(e) => setForm(prev => ({ ...prev, imapUser: e.target.value }))}
                placeholder="usuario@gmail.com"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Senha de App IMAP</FormLabel>
              <Input
                size="sm"
                type="password"
                value={form.imapPass}
                onChange={(e) => setForm(prev => ({ ...prev, imapPass: e.target.value }))}
                placeholder="Senha de app do Gmail"
              />
            </FormControl>
          </SimpleGrid>
          <Box bg={sectionBg} p={3} borderRadius="md" mt={2} border="1px solid" borderColor={borderColor}>
            <Text fontSize="xs" color="gray.500">
              O UpSeller envia um codigo de verificacao por email apos o login.
              Configure uma senha de app do Gmail (Configuracoes {'>'} Seguranca {'>'} Senhas de app).
            </Text>
          </Box>
        </Box>

        <Divider />

        {/* Sync Config */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Sincronizacao</Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel fontSize="sm">Intervalo de sync (minutos)</FormLabel>
              <Input
                size="sm"
                type="number"
                min={30}
                max={1440}
                value={form.syncIntervalMinutes}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  syncIntervalMinutes: parseInt(e.target.value) || 60
                }))}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Periodo padrao (dias)</FormLabel>
              <Input
                size="sm"
                type="number"
                min={1}
                max={365}
                value={form.defaultDays}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  defaultDays: parseInt(e.target.value) || 90
                }))}
              />
            </FormControl>
          </SimpleGrid>

          <Box mt={4}>
            <Text fontSize="sm" fontWeight="medium" mb={1}>Status do ultimo sync</Text>
            <HStack spacing={2}>
              {syncStatus.lastSyncStatus && (
                <Badge colorScheme={syncStatus.lastSyncStatus === "success" ? "green" : "red"}>
                  {syncStatus.lastSyncStatus === "success" ? "Sucesso" : "Erro"}
                </Badge>
              )}
              <Text fontSize="xs" color="gray.500">
                {formatSyncDate(syncStatus.lastSyncAt)}
              </Text>
            </HStack>
            {syncStatus.lastSyncMessage && (
              <Text fontSize="xs" color="gray.500" mt={1}>{syncStatus.lastSyncMessage}</Text>
            )}
            {syncStatus.lastSyncRows > 0 && (
              <Text fontSize="xs" color="gray.500">{syncStatus.lastSyncRows} registros</Text>
            )}
          </Box>

          <Button
            mt={3}
            size="sm"
            colorScheme="teal"
            variant="outline"
            isLoading={syncing}
            loadingText="Sincronizando..."
            onClick={handleSync}
          >
            Sincronizar Agora
          </Button>
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
            Salvar Configuracoes
          </Button>
        </Flex>

        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Text fontSize="sm">
            As vendas importadas do UpSeller serao categorizadas automaticamente
            por plataforma (<strong>Mercado Livre</strong>, <strong>Shopee</strong>, <strong>Shein</strong>)
            conforme a origem de cada pedido.
          </Text>
        </Alert>
      </VStack>
    </Box>
  );
};

export default UpsellerSettings;
