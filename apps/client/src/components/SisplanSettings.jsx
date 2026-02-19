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
  Select,
  SimpleGrid,
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
import {
  fetchSisplanSettings,
  updateSisplanSettings,
  testSisplanConnection,
  testSisplanQuery,
  triggerSisplanSync
} from "../api";

const SYSTEM_FIELDS = [
  { key: "order_id", label: "order_id", description: "Numero do pedido", required: true },
  { key: "date", label: "date", description: "Data da venda", required: true },
  { key: "total", label: "total", description: "Valor total", required: true },
  { key: "product", label: "product", description: "Nome do produto", required: false },
  { key: "quantity", label: "quantity", description: "Quantidade", required: false },
  { key: "unit_price", label: "unit_price", description: "Preco unitario", required: false },
  { key: "sku", label: "sku", description: "SKU do produto", required: false },
  { key: "variation", label: "variation", description: "Variacao do produto", required: false },
  { key: "state", label: "state", description: "Estado (UF)", required: false },
  { key: "status", label: "status", description: "Status do pedido", required: false },
  { key: "ad_name", label: "ad_name", description: "Nome do anuncio", required: false },
  { key: "image", label: "image", description: "Link da imagem", required: false }
];

const SisplanSettings = () => {
  const [form, setForm] = useState({
    active: false,
    host: "",
    port: 3050,
    databasePath: "",
    fbUser: "",
    fbPassword: "",
    sqlQuery: "",
    columnMapping: {},
    syncIntervalMinutes: 5
  });
  const [syncStatus, setSyncStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingQuery, setTestingQuery] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queryColumns, setQueryColumns] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const toast = useToast();

  const panelBg = useColorModeValue("white", "gray.800");
  const refBg = useColorModeValue("gray.50", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await fetchSisplanSettings();
      setForm({
        active: data.active || false,
        host: data.host || "",
        port: data.port || 3050,
        databasePath: data.databasePath || "",
        fbUser: data.fbUser || "",
        fbPassword: data.fbPassword || "",
        sqlQuery: data.sqlQuery || "",
        columnMapping: data.columnMapping || {},
        syncIntervalMinutes: data.syncIntervalMinutes || 5
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
      await updateSisplanSettings(form);
      toast({ title: "Configuracoes salvas com sucesso!", status: "success", duration: 3000 });
      await loadSettings();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const result = await testSisplanConnection({
        host: form.host,
        port: form.port,
        databasePath: form.databasePath,
        fbUser: form.fbUser,
        fbPassword: form.fbPassword
      });
      toast({ title: result.message, status: "success", duration: 3000 });
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTestQuery = async () => {
    setTestingQuery(true);
    try {
      const result = await testSisplanQuery({
        host: form.host,
        port: form.port,
        databasePath: form.databasePath,
        fbUser: form.fbUser,
        fbPassword: form.fbPassword,
        sqlQuery: form.sqlQuery
      });
      setQueryColumns(result.columns || []);
      setPreviewRows(result.rows || []);
      toast({
        title: `Query executada: ${result.totalPreview} registros retornados`,
        status: "success",
        duration: 3000
      });
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setTestingQuery(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerSisplanSync();
      toast({ title: result.message, status: "success", duration: 4000 });
      await loadSettings();
    } catch (err) {
      toast({ title: err.message, status: "error", duration: 5000 });
    } finally {
      setSyncing(false);
    }
  };

  const updateMapping = (systemField, sourceColumn) => {
    setForm(prev => ({
      ...prev,
      columnMapping: {
        ...prev.columnMapping,
        [systemField]: sourceColumn || undefined
      }
    }));
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
        <Text fontSize="lg" fontWeight="bold">Conexao Sisplan ERP</Text>
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
        {/* Conexao */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Dados de Conexao</Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Host</FormLabel>
              <Input
                size="sm"
                value={form.host}
                onChange={(e) => setForm(prev => ({ ...prev, host: e.target.value }))}
                placeholder="192.168.1.100"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Porta</FormLabel>
              <Input
                size="sm"
                type="number"
                value={form.port}
                onChange={(e) => setForm(prev => ({ ...prev, port: parseInt(e.target.value) || 3050 }))}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Caminho do Banco</FormLabel>
              <Input
                size="sm"
                value={form.databasePath}
                onChange={(e) => setForm(prev => ({ ...prev, databasePath: e.target.value }))}
                placeholder="C:/sisplan/dados/BANCO.FDB"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Usuario</FormLabel>
              <Input
                size="sm"
                value={form.fbUser}
                onChange={(e) => setForm(prev => ({ ...prev, fbUser: e.target.value }))}
                placeholder="SYSDBA"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Senha</FormLabel>
              <Input
                size="sm"
                type="password"
                value={form.fbPassword}
                onChange={(e) => setForm(prev => ({ ...prev, fbPassword: e.target.value }))}
              />
            </FormControl>
          </SimpleGrid>
          <Button
            mt={3}
            size="sm"
            colorScheme="blue"
            variant="outline"
            isLoading={testingConnection}
            loadingText="Testando..."
            onClick={handleTestConnection}
          >
            Testar Conexao
          </Button>
        </Box>

        <Divider />

        {/* SQL Query */}
        <Box>
          <Text fontWeight="semibold" mb={3}>Query SQL</Text>

          <Box bg={refBg} p={4} borderRadius="md" mb={4} border="1px solid" borderColor={borderColor}>
            <Text fontSize="sm" fontWeight="semibold" mb={2}>Colunas disponiveis para mapeamento:</Text>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={1}>
              {SYSTEM_FIELDS.map(f => (
                <Text key={f.key} fontSize="xs" fontFamily="mono">
                  <Text as="span" fontWeight="bold" color={f.required ? "red.400" : "inherit"}>
                    {f.label}
                  </Text>
                  {f.required && <Text as="span" color="red.400">*</Text>}
                  {" - "}{f.description}
                </Text>
              ))}
            </SimpleGrid>
            <Text fontSize="xs" color="gray.500" mt={2}>* Campos obrigatorios</Text>
          </Box>

          <FormControl>
            <FormLabel fontSize="sm">SQL para buscar vendas do Sisplan</FormLabel>
            <Textarea
              size="sm"
              rows={6}
              fontFamily="mono"
              fontSize="sm"
              value={form.sqlQuery}
              onChange={(e) => setForm(prev => ({ ...prev, sqlQuery: e.target.value }))}
              placeholder="SELECT NR_PEDIDO, DT_VENDA, VL_TOTAL, DS_PRODUTO, QT_ITEM FROM PEDIDOS WHERE DT_VENDA >= '2024-01-01'"
            />
          </FormControl>
          <Button
            mt={3}
            size="sm"
            colorScheme="blue"
            variant="outline"
            isLoading={testingQuery}
            loadingText="Executando..."
            onClick={handleTestQuery}
          >
            Testar Query
          </Button>
        </Box>

        {/* Preview */}
        {previewRows.length > 0 && (
          <Box>
            <Text fontWeight="semibold" mb={2} fontSize="sm">
              Preview ({previewRows.length} registros)
            </Text>
            <TableContainer maxH="300px" overflowY="auto">
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    {queryColumns.map(col => (
                      <Th key={col} fontSize="xs">{col}</Th>
                    ))}
                  </Tr>
                </Thead>
                <Tbody>
                  {previewRows.map((row, i) => (
                    <Tr key={i}>
                      {queryColumns.map(col => (
                        <Td key={col} fontSize="xs" maxW="200px" isTruncated>
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : ""}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Mapeamento de Colunas */}
        {queryColumns.length > 0 && (
          <>
            <Divider />
            <Box>
              <Text fontWeight="semibold" mb={3}>Mapeamento de Colunas</Text>
              <Text fontSize="sm" color="gray.500" mb={3}>
                Associe cada campo do sistema a uma coluna retornada pela query.
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                {SYSTEM_FIELDS.map(f => (
                  <FormControl key={f.key}>
                    <FormLabel fontSize="xs">
                      {f.label}
                      {f.required && <Text as="span" color="red.400" ml={1}>*</Text>}
                      <Text as="span" color="gray.400" ml={1}>({f.description})</Text>
                    </FormLabel>
                    <Select
                      size="sm"
                      value={form.columnMapping[f.key] || ""}
                      onChange={(e) => updateMapping(f.key, e.target.value)}
                      placeholder="-- Nenhum --"
                    >
                      {queryColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </Select>
                  </FormControl>
                ))}
              </SimpleGrid>
            </Box>
          </>
        )}

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
                min={1}
                max={1440}
                value={form.syncIntervalMinutes}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  syncIntervalMinutes: parseInt(e.target.value) || 5
                }))}
              />
            </FormControl>
            <Box>
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
          </SimpleGrid>
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
            As vendas importadas do Sisplan serao categorizadas automaticamente como
            <strong> Atacado</strong>, com plataforma <strong>Sisplan</strong> e loja <strong>Fabrica</strong>.
          </Text>
        </Alert>
      </VStack>
    </Box>
  );
};

export default SisplanSettings;
