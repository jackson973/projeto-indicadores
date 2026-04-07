import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
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
  useColorModeValue
} from "@chakra-ui/react";
import {
  fetchSisplanSettings,
  updateSisplanSettings,
  testSisplanConnection,
  testSisplanQuery,
  triggerSisplanSync,
  triggerSisplanNfSync,
  triggerOfSync,
  triggerSisplanProductSync,
  triggerSisplanOrderSync
} from "../api";
import useAppToast from "../hooks/useAppToast";

const SYSTEM_FIELDS = [
  { key: "order_id", label: "order_id", description: "Número do pedido", required: true },
  { key: "date", label: "date", description: "Data da venda", required: true },
  { key: "total", label: "total", description: "Valor total", required: true },
  { key: "product", label: "product", description: "Nome do produto", required: false },
  { key: "quantity", label: "quantity", description: "Quantidade", required: false },
  { key: "unit_price", label: "unit_price", description: "Preço unitário", required: false },
  { key: "sku", label: "sku", description: "SKU do produto", required: false },
  { key: "variation", label: "variation", description: "Variação do produto", required: false },
  { key: "state", label: "state", description: "Estado (UF)", required: false },
  { key: "status", label: "status", description: "Status do pedido", required: false },
  { key: "ad_name", label: "ad_name", description: "Nome do anúncio", required: false },
  { key: "image", label: "image", description: "Link da imagem", required: false },
  { key: "client_name", label: "client_name", description: "Nome do comprador", required: false },
  { key: "codcli", label: "codcli", description: "Código do cliente", required: false },
  { key: "nome_fantasia", label: "nome_fantasia", description: "Nome fantasia", required: false },
  { key: "cnpj_cpf", label: "cnpj_cpf", description: "CNPJ/CPF", required: false }
];

const OF_SYSTEM_FIELDS = [
  { key: "fac_numero", label: "fac_numero", description: "Numero da OF", required: true },
  { key: "fac_lancto", label: "fac_lancto", description: "Lancamento", required: false },
  { key: "fac_dt_s", label: "fac_dt_s", description: "Data de envio", required: false },
  { key: "fac_dt_lan", label: "fac_dt_lan", description: "Data de lancamento", required: false },
  { key: "fac_dt_prev_ret", label: "fac_dt_prev_ret", description: "Data prevista retorno", required: false },
  { key: "fac_codsetor", label: "fac_codsetor", description: "Codigo setor", required: false },
  { key: "fac_descsetor", label: "fac_descsetor", description: "Descricao setor", required: false },
  { key: "fac_qt_orig", label: "fac_qt_orig", description: "Quantidade original", required: false },
  { key: "fac_quant", label: "fac_quant", description: "Quantidade validada", required: true },
  { key: "fac_tam", label: "fac_tam", description: "Tamanho", required: false },
  { key: "fac_cor", label: "fac_cor", description: "Codigo cor", required: false },
  { key: "fac_desccor", label: "fac_desccor", description: "Descricao cor", required: false },
  { key: "fac_parte", label: "fac_parte", description: "Codigo parte", required: false },
  { key: "fac_descparte", label: "fac_descparte", description: "Descricao parte", required: false },
  { key: "fac_codigo_produto", label: "fac_codigo_produto", description: "Codigo produto", required: true },
  { key: "fac_desc_produto", label: "fac_desc_produto", description: "Descricao produto", required: false },
  { key: "produto_unidade", label: "produto_unidade", description: "Unidade do produto", required: false },
  { key: "fac_codcli", label: "fac_codcli", description: "Codigo fornecedor", required: true },
  { key: "cliente_nome", label: "cliente_nome", description: "Nome fornecedor", required: false },
  { key: "ddd_fone", label: "ddd_fone", description: "DDD telefone", required: false },
  { key: "cliente_fone", label: "cliente_fone", description: "Telefone", required: false },
  { key: "fone_compl", label: "fone_compl", description: "Complemento telefone", required: false },
  { key: "cliente_endereco", label: "cliente_endereco", description: "Endereco", required: false },
  { key: "num_end", label: "num_end", description: "Numero endereco", required: false },
  { key: "cliente_bairro", label: "cliente_bairro", description: "Bairro", required: false },
  { key: "cliente_cep", label: "cliente_cep", description: "CEP", required: false },
  { key: "cliente_uf", label: "cliente_uf", description: "UF", required: false },
  { key: "cliente_cidade", label: "cliente_cidade", description: "Cidade", required: false },
  { key: "cliente_complemento", label: "cliente_complemento", description: "Complemento endereco", required: false },
  { key: "cliente_cnpj", label: "cliente_cnpj", description: "CNPJ fornecedor", required: false },
  { key: "cliente_inscricao", label: "cliente_inscricao", description: "Inscricao estadual", required: false },
  { key: "cliente_fantasia", label: "cliente_fantasia", description: "Nome fantasia", required: false },
  { key: "cliente_fax", label: "cliente_fax", description: "Fax", required: false },
  { key: "fac_periodo_of", label: "fac_periodo_of", description: "Periodo da OF", required: false },
];

const NF_SYSTEM_FIELDS = [
  { key: "numero_nf", label: "numero_nf", description: "Número da NF", required: true },
  { key: "data_emissao", label: "data_emissao", description: "Data de emissão", required: true },
  { key: "serie", label: "serie", description: "Série da NF", required: false },
  { key: "ordem_id", label: "ordem_id", description: "Número do pedido", required: false },
  { key: "codcli", label: "codcli", description: "Código do cliente", required: false },
  { key: "nome_cliente", label: "nome_cliente", description: "Nome do cliente", required: false },
  { key: "nome_fantasia", label: "nome_fantasia", description: "Nome fantasia do cliente", required: false },
  { key: "valor", label: "valor", description: "Valor total da NF", required: false },
  { key: "chave_acesso", label: "chave_acesso", description: "Chave de acesso NFe", required: false },
  { key: "cnpj", label: "cnpj", description: "CNPJ do cliente", required: false }
];

const PRODUCT_SYSTEM_FIELDS = [
  { key: "codigo",    label: "codigo",    description: "Código do produto",    required: true },
  { key: "descricao", label: "descricao", description: "Descrição do produto",  required: true },
  { key: "cod_cor",   label: "cod_cor",   description: "Código da cor",         required: false },
  { key: "desc_cor",  label: "desc_cor",  description: "Descrição da cor",      required: false },
  { key: "tamanho",   label: "tamanho",   description: "Tamanho",               required: false },
  { key: "ean",       label: "ean",       description: "Código de barras (EAN)", required: false },
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
    syncIntervalMinutes: 5,
    nfActive: false,
    nfSqlQuery: "",
    nfColumnMapping: {},
    nfBasePath: "",
    nfLocalPath: "",
    ofActive: false,
    ofSqlQuery: "",
    ofColumnMapping: {},
    productActive: false,
    productSqlQuery: "",
    productColumnMapping: {}
  });
  const [syncStatus, setSyncStatus] = useState({});
  const [nfSyncStatus, setNfSyncStatus] = useState({});
  const [ofSyncStatus, setOfSyncStatus] = useState({});
  const [productSyncStatus, setProductSyncStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingQuery, setTestingQuery] = useState(false);
  const [testingNfQuery, setTestingNfQuery] = useState(false);
  const [testingOfQuery, setTestingOfQuery] = useState(false);
  const [testingProductQuery, setTestingProductQuery] = useState(false);
  const [syncingOf, setSyncingOf] = useState(false);
  const [syncingProduct, setSyncingProduct] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [ofQueryColumns, setOfQueryColumns] = useState([]);
  const [ofPreviewRows, setOfPreviewRows] = useState([]);
  const [productQueryColumns, setProductQueryColumns] = useState([]);
  const [productPreviewRows, setProductPreviewRows] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncingNf, setSyncingNf] = useState(false);
  const [queryColumns, setQueryColumns] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [nfQueryColumns, setNfQueryColumns] = useState([]);
  const [nfPreviewRows, setNfPreviewRows] = useState([]);
  const toast = useAppToast();

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
        syncIntervalMinutes: data.syncIntervalMinutes || 5,
        nfActive: data.nfActive || false,
        nfSqlQuery: data.nfSqlQuery || "",
        nfColumnMapping: data.nfColumnMapping || {},
        nfBasePath: data.nfBasePath || "",
        nfLocalPath: data.nfLocalPath || "",
        ofActive: data.ofActive || false,
        ofSqlQuery: data.ofSqlQuery || "",
        ofColumnMapping: data.ofColumnMapping || {},
        productActive: data.productActive || false,
        productSqlQuery: data.productSqlQuery || "",
        productColumnMapping: data.productColumnMapping || {}
      });
      setSyncStatus({
        lastSyncAt: data.lastSyncAt,
        lastSyncStatus: data.lastSyncStatus,
        lastSyncMessage: data.lastSyncMessage,
        lastSyncRows: data.lastSyncRows
      });
      setNfSyncStatus({
        lastSyncAt: data.nfLastSyncAt,
        lastSyncStatus: data.nfLastSyncStatus,
        lastSyncMessage: data.nfLastSyncMessage,
        lastSyncRows: data.nfLastSyncRows
      });
      setOfSyncStatus({
        lastSyncAt: data.ofLastSyncAt,
        lastSyncStatus: data.ofLastSyncStatus,
        lastSyncMessage: data.ofLastSyncMessage,
        lastSyncRows: data.ofLastSyncRows
      });
      setProductSyncStatus({
        lastSyncAt: data.productLastSyncAt,
        lastSyncStatus: data.productLastSyncStatus,
        lastSyncMessage: data.productLastSyncMessage,
        lastSyncRows: data.productLastSyncRows
      });
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSisplanSettings(form);
      toast({  title: "Configurações salvas com sucesso!", status: "success", duration: 3000 });
      await loadSettings();
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
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
      toast({  title: result.message, status: "success", duration: 3000 });
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
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
        duration: 3000 });
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setTestingQuery(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerSisplanSync();
      toast({  title: result.message, status: "success", duration: 4000 });
      await loadSettings();
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
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

  const handleTestNfQuery = async () => {
    setTestingNfQuery(true);
    try {
      const result = await testSisplanQuery({
        host: form.host,
        port: form.port,
        databasePath: form.databasePath,
        fbUser: form.fbUser,
        fbPassword: form.fbPassword,
        sqlQuery: form.nfSqlQuery
      });
      setNfQueryColumns(result.columns || []);
      setNfPreviewRows(result.rows || []);
      toast({
        title: `Query executada: ${result.totalPreview} registros retornados`,
        status: "success",
        duration: 3000 });
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setTestingNfQuery(false);
    }
  };

  const handleNfSync = async () => {
    setSyncingNf(true);
    try {
      const result = await triggerSisplanNfSync();
      toast({  title: result.message, status: "success", duration: 4000 });
      await loadSettings();
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setSyncingNf(false);
    }
  };

  const updateNfMapping = (systemField, sourceColumn) => {
    setForm(prev => ({
      ...prev,
      nfColumnMapping: {
        ...prev.nfColumnMapping,
        [systemField]: sourceColumn || undefined
      }
    }));
  };

  const handleTestOfQuery = async () => {
    setTestingOfQuery(true);
    try {
      const result = await testSisplanQuery({
        host: form.host,
        port: form.port,
        databasePath: form.databasePath,
        fbUser: form.fbUser,
        fbPassword: form.fbPassword,
        sqlQuery: form.ofSqlQuery
      });
      setOfQueryColumns(result.columns || []);
      setOfPreviewRows(result.rows || []);
      toast({
        title: `Query executada: ${result.totalPreview} registros retornados`,
        status: "success",
        duration: 3000 });
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setTestingOfQuery(false);
    }
  };

  const handleOfSync = async () => {
    setSyncingOf(true);
    try {
      const result = await triggerOfSync();
      toast({  title: result.message, status: "success", duration: 4000 });
      await loadSettings();
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setSyncingOf(false);
    }
  };

  const updateOfMapping = (systemField, sourceColumn) => {
    setForm(prev => ({
      ...prev,
      ofColumnMapping: {
        ...prev.ofColumnMapping,
        [systemField]: sourceColumn || undefined
      }
    }));
  };

  const handleTestProductQuery = async () => {
    setTestingProductQuery(true);
    try {
      const result = await testSisplanQuery({
        host: form.host,
        port: form.port,
        databasePath: form.databasePath,
        fbUser: form.fbUser,
        fbPassword: form.fbPassword,
        sqlQuery: form.productSqlQuery
      });
      setProductQueryColumns(result.columns || []);
      setProductPreviewRows(result.rows || []);
      toast({
        title: `Query executada: ${result.totalPreview} registros retornados`,
        status: "success",
        duration: 3000 });
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setTestingProductQuery(false);
    }
  };

  const handleProductSync = async () => {
    setSyncingProduct(true);
    try {
      const result = await triggerSisplanProductSync();
      toast({  title: result.message, status: "success", duration: 4000 });
      await loadSettings();
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setSyncingProduct(false);
    }
  };

  const handleOrderSync = async () => {
    setSyncingOrders(true);
    try {
      await triggerSisplanOrderSync();
      toast({  title: "Pedidos sincronizados com o ERP", status: "success", duration: 4000 });
    } catch (err) {
      toast({  title: err.message, status: "error", duration: 5000 });
    } finally {
      setSyncingOrders(false);
    }
  };

  const updateProductMapping = (systemField, sourceColumn) => {
    setForm(prev => ({
      ...prev,
      productColumnMapping: {
        ...prev.productColumnMapping,
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
        <Text fontSize="lg" fontWeight="bold">Conexão Sisplan ERP</Text>
        <HStack>
          <Text fontSize="sm">Ativo</Text>
          <Switch
            isChecked={form.active}
            onChange={(e) => setForm(prev => ({ ...prev, active: e.target.checked }))}
            colorScheme="green"
          />
        </HStack>
      </HStack>

      <Accordion allowMultiple defaultIndex={[0]}>
        {/* 1. Dados de Conexão */}
        <AccordionItem border="1px solid" borderColor={borderColor} borderRadius="md" mb={3}>
          <AccordionButton py={3} _expanded={{ bg: refBg }}>
            <Box flex="1" textAlign="left">
              <Text fontWeight="semibold">Dados de Conexão</Text>
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
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
                <FormLabel fontSize="sm">Usuário</FormLabel>
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
              Testar Conexão
            </Button>
          </AccordionPanel>
        </AccordionItem>

        {/* 2. Vendas */}
        <AccordionItem border="1px solid" borderColor={borderColor} borderRadius="md" mb={3}>
          <AccordionButton py={3} _expanded={{ bg: refBg }}>
            <Box flex="1" textAlign="left">
              <Text fontWeight="semibold">Vendas</Text>
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            <VStack spacing={4} align="stretch">
              <Box bg={refBg} p={4} borderRadius="md" border="1px solid" borderColor={borderColor}>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>Colunas disponíveis para mapeamento:</Text>
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
                <Text fontSize="xs" color="gray.500" mt={2}>* Campos obrigatórios</Text>
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
                size="sm"
                colorScheme="blue"
                variant="outline"
                isLoading={testingQuery}
                loadingText="Executando..."
                onClick={handleTestQuery}
                alignSelf="flex-start"
              >
                Testar Query
              </Button>

              {/* Preview */}
              {previewRows.length > 0 && (
                <>
                  <Divider />
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
                </>
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
            </VStack>
          </AccordionPanel>
        </AccordionItem>

        {/* 3. Notas Fiscais (NF-e) */}
        <AccordionItem border="1px solid" borderColor={borderColor} borderRadius="md" mb={3}>
          <AccordionButton py={3} _expanded={{ bg: refBg }}>
            <Box flex="1" textAlign="left">
              <Text fontWeight="semibold">Notas Fiscais (NF-e)</Text>
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            <HStack justify="space-between" mb={4}>
              <Text fontSize="sm">Habilitar Notas Fiscais</Text>
              <Switch
                isChecked={form.nfActive}
                onChange={(e) => setForm(prev => ({ ...prev, nfActive: e.target.checked }))}
                colorScheme="green"
              />
            </HStack>

            {form.nfActive && (
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel fontSize="sm">Caminho local dos PDFs no servidor</FormLabel>
                  <Input
                    size="sm"
                    value={form.nfLocalPath}
                    onChange={(e) => setForm(prev => ({ ...prev, nfLocalPath: e.target.value }))}
                    placeholder="/mnt/sisplan/NFe/LOG_001/DANFE"
                  />
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Ponto de montagem CIFS no servidor Linux (ex: /mnt/sisplan/NFe/LOG_001/DANFE).
                    Este caminho é usado para localizar e enviar os PDFs.
                  </Text>
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm">Caminho de rede (UNC) - referência</FormLabel>
                  <Input
                    size="sm"
                    value={form.nfBasePath}
                    onChange={(e) => setForm(prev => ({ ...prev, nfBasePath: e.target.value }))}
                    placeholder="\\\\192.168.7.2\\Sisplan\\NFe\\LOG_001\\DANFE"
                  />
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Caminho Windows/UNC para referência. O caminho local acima tem prioridade para acesso aos arquivos.
                  </Text>
                </FormControl>

                <Box>
                  <Box bg={refBg} p={4} borderRadius="md" mb={4} border="1px solid" borderColor={borderColor}>
                    <Text fontSize="sm" fontWeight="semibold" mb={2}>Campos disponíveis para mapeamento NF:</Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={1}>
                      {NF_SYSTEM_FIELDS.map(f => (
                        <Text key={f.key} fontSize="xs" fontFamily="mono">
                          <Text as="span" fontWeight="bold" color={f.required ? "red.400" : "inherit"}>
                            {f.label}
                          </Text>
                          {f.required && <Text as="span" color="red.400">*</Text>}
                          {" - "}{f.description}
                        </Text>
                      ))}
                    </SimpleGrid>
                    <Text fontSize="xs" color="gray.500" mt={2}>* Campos obrigatórios</Text>
                  </Box>

                  <FormControl>
                    <FormLabel fontSize="sm">SQL para buscar notas fiscais do Sisplan</FormLabel>
                    <Textarea
                      size="sm"
                      rows={5}
                      fontFamily="mono"
                      fontSize="sm"
                      value={form.nfSqlQuery}
                      onChange={(e) => setForm(prev => ({ ...prev, nfSqlQuery: e.target.value }))}
                      placeholder="SELECT NR_NF, SERIE, CODCLI, NOME, VL_TOTAL, DT_EMISSAO FROM NOTA_FISCAL WHERE DT_EMISSAO >= '2024-01-01'"
                    />
                  </FormControl>
                  <Button
                    mt={3}
                    size="sm"
                    colorScheme="blue"
                    variant="outline"
                    isLoading={testingNfQuery}
                    loadingText="Executando..."
                    onClick={handleTestNfQuery}
                  >
                    Testar Query NF
                  </Button>
                </Box>

                {/* NF Preview */}
                {nfPreviewRows.length > 0 && (
                  <Box>
                    <Text fontWeight="semibold" mb={2} fontSize="sm">
                      Preview NF ({nfPreviewRows.length} registros)
                    </Text>
                    <TableContainer maxH="300px" overflowY="auto">
                      <Table size="sm" variant="simple">
                        <Thead>
                          <Tr>
                            {nfQueryColumns.map(col => (
                              <Th key={col} fontSize="xs">{col}</Th>
                            ))}
                          </Tr>
                        </Thead>
                        <Tbody>
                          {nfPreviewRows.map((row, i) => (
                            <Tr key={i}>
                              {nfQueryColumns.map(col => (
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

                {/* NF Column Mapping */}
                {nfQueryColumns.length > 0 && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontWeight="semibold" mb={3}>Mapeamento de Colunas NF</Text>
                      <Text fontSize="sm" color="gray.500" mb={3}>
                        Associe cada campo do sistema a uma coluna retornada pela query.
                      </Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                        {NF_SYSTEM_FIELDS.map(f => (
                          <FormControl key={f.key}>
                            <FormLabel fontSize="xs">
                              {f.label}
                              {f.required && <Text as="span" color="red.400" ml={1}>*</Text>}
                              <Text as="span" color="gray.400" ml={1}>({f.description})</Text>
                            </FormLabel>
                            <Select
                              size="sm"
                              value={form.nfColumnMapping[f.key] || ""}
                              onChange={(e) => updateNfMapping(f.key, e.target.value)}
                              placeholder="-- Nenhum --"
                            >
                              {nfQueryColumns.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </Select>
                          </FormControl>
                        ))}
                      </SimpleGrid>
                    </Box>
                  </>
                )}

                {/* NF Sync Status */}
                <Divider />
                <Box>
                  <Text fontSize="sm" fontWeight="medium" mb={1}>Status do último sync NF</Text>
                  <HStack spacing={2}>
                    {nfSyncStatus.lastSyncStatus && (
                      <Badge colorScheme={nfSyncStatus.lastSyncStatus === "success" ? "green" : "red"}>
                        {nfSyncStatus.lastSyncStatus === "success" ? "Sucesso" : "Erro"}
                      </Badge>
                    )}
                    <Text fontSize="xs" color="gray.500">
                      {formatSyncDate(nfSyncStatus.lastSyncAt)}
                    </Text>
                  </HStack>
                  {nfSyncStatus.lastSyncMessage && (
                    <Text fontSize="xs" color="gray.500" mt={1}>{nfSyncStatus.lastSyncMessage}</Text>
                  )}
                  {nfSyncStatus.lastSyncRows > 0 && (
                    <Text fontSize="xs" color="gray.500">{nfSyncStatus.lastSyncRows} registros</Text>
                  )}
                  <Button
                    mt={3}
                    size="sm"
                    colorScheme="teal"
                    variant="outline"
                    isLoading={syncingNf}
                    loadingText="Sincronizando..."
                    onClick={handleNfSync}
                  >
                    Sincronizar NF Agora
                  </Button>
                </Box>
              </VStack>
            )}
          </AccordionPanel>
        </AccordionItem>

        {/* 4. Ordens de Fabricacao (OFs) */}
        <AccordionItem border="1px solid" borderColor={borderColor} borderRadius="md" mb={3}>
          <AccordionButton py={3} _expanded={{ bg: refBg }}>
            <Box flex="1" textAlign="left">
              <Text fontWeight="semibold">Ordens de Fabricacao (OFs)</Text>
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            <HStack mb={4}>
              <Text fontSize="sm">Ativo</Text>
              <Switch
                isChecked={form.ofActive}
                onChange={(e) => setForm(prev => ({ ...prev, ofActive: e.target.checked }))}
                colorScheme="green"
                size="sm"
              />
            </HStack>

            {form.ofActive && (
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel fontSize="sm">Query SQL para OFs</FormLabel>
                  <Textarea
                    size="sm"
                    rows={6}
                    fontFamily="mono"
                    fontSize="xs"
                    placeholder="SELECT ... FROM faccao3_001 ..."
                    value={form.ofSqlQuery}
                    onChange={(e) => setForm(prev => ({ ...prev, ofSqlQuery: e.target.value }))}
                  />
                </FormControl>

                <Button
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  isLoading={testingOfQuery}
                  loadingText="Testando..."
                  onClick={handleTestOfQuery}
                  isDisabled={!form.ofSqlQuery}
                >
                  Testar Query OFs
                </Button>

                {ofPreviewRows.length > 0 && (
                  <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" overflowX="auto" maxH="200px">
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          {ofQueryColumns.map((col) => (
                            <Th key={col} fontSize="xs" whiteSpace="nowrap">{col}</Th>
                          ))}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {ofPreviewRows.map((row, i) => (
                          <Tr key={i}>
                            {ofQueryColumns.map((col) => (
                              <Td key={col} fontSize="xs" whiteSpace="nowrap" maxW="200px" overflow="hidden" textOverflow="ellipsis">
                                {row[col] != null ? String(row[col]).substring(0, 50) : ''}
                              </Td>
                            ))}
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                )}

                {ofQueryColumns.length > 0 && (
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" mb={2}>Mapeamento de Colunas (OFs)</Text>
                    <Divider mb={3} />
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                      {OF_SYSTEM_FIELDS.map(field => (
                        <FormControl key={field.key}>
                          <FormLabel fontSize="xs">
                            {field.description}
                            {field.required && <Text as="span" color="red.400" ml={1}>*</Text>}
                          </FormLabel>
                          <Select
                            size="sm"
                            placeholder="-- Selecione --"
                            value={form.ofColumnMapping[field.key] || ''}
                            onChange={(e) => updateOfMapping(field.key, e.target.value)}
                          >
                            {ofQueryColumns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </Select>
                        </FormControl>
                      ))}
                    </SimpleGrid>
                  </Box>
                )}

                <Box mt={2} p={3} bg={refBg} borderRadius="md">
                  <Text fontSize="sm" fontWeight="medium" mb={1}>Status do sync de OFs</Text>
                  <HStack spacing={2}>
                    {ofSyncStatus.lastSyncStatus && (
                      <Badge colorScheme={ofSyncStatus.lastSyncStatus === "success" ? "green" : "red"}>
                        {ofSyncStatus.lastSyncStatus === "success" ? "Sucesso" : "Erro"}
                      </Badge>
                    )}
                    <Text fontSize="xs" color="gray.500">
                      {formatSyncDate(ofSyncStatus.lastSyncAt)}
                    </Text>
                  </HStack>
                  {ofSyncStatus.lastSyncMessage && (
                    <Text fontSize="xs" color="gray.500" mt={1}>{ofSyncStatus.lastSyncMessage}</Text>
                  )}
                  {ofSyncStatus.lastSyncRows > 0 && (
                    <Text fontSize="xs" color="gray.500">{ofSyncStatus.lastSyncRows} registros</Text>
                  )}
                  <Button
                    mt={3}
                    size="sm"
                    colorScheme="teal"
                    variant="outline"
                    isLoading={syncingOf}
                    loadingText="Sincronizando..."
                    onClick={handleOfSync}
                  >
                    Sincronizar OFs Agora
                  </Button>
                </Box>
              </VStack>
            )}
          </AccordionPanel>
        </AccordionItem>

        {/* 5. Catálogo de Produtos */}
        <AccordionItem border="1px solid" borderColor={borderColor} borderRadius="md" mb={3}>
          <AccordionButton py={3} _expanded={{ bg: refBg }}>
            <Box flex="1" textAlign="left">
              <Text fontWeight="semibold">Catálogo de Produtos</Text>
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            <HStack mb={4}>
              <Text fontSize="sm">Ativo</Text>
              <Switch
                isChecked={form.productActive}
                onChange={(e) => setForm(prev => ({ ...prev, productActive: e.target.checked }))}
                colorScheme="green"
                size="sm"
              />
            </HStack>

            {form.productActive && (
              <VStack spacing={4} align="stretch">
                <Text fontSize="xs" color="gray.500">
                  Importa todos os produtos cadastrados no Sisplan independentemente de pedidos.
                  Campos do SKU: <strong>codigo</strong> + <strong>cod_cor</strong> + <strong>tamanho</strong> (separados por "-").
                </Text>

                <FormControl>
                  <FormLabel fontSize="sm">Query SQL para produtos</FormLabel>
                  <Textarea
                    size="sm"
                    rows={6}
                    fontFamily="mono"
                    fontSize="xs"
                    placeholder="SELECT CODPRO, DESCPRO, CODCOR, DESCCOR, TAMANHO FROM PRODUTOS WHERE ATIVO = 'S'"
                    value={form.productSqlQuery}
                    onChange={(e) => setForm(prev => ({ ...prev, productSqlQuery: e.target.value }))}
                  />
                </FormControl>

                <Button
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  isLoading={testingProductQuery}
                  loadingText="Testando..."
                  onClick={handleTestProductQuery}
                  isDisabled={!form.productSqlQuery}
                >
                  Testar Query Produtos
                </Button>

                {productPreviewRows.length > 0 && (
                  <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" overflowX="auto" maxH="200px">
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          {productQueryColumns.map((col) => (
                            <Th key={col} fontSize="xs" whiteSpace="nowrap">{col}</Th>
                          ))}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {productPreviewRows.map((row, i) => (
                          <Tr key={i}>
                            {productQueryColumns.map((col) => (
                              <Td key={col} fontSize="xs" whiteSpace="nowrap" maxW="200px" overflow="hidden" textOverflow="ellipsis">
                                {row[col] != null ? String(row[col]).substring(0, 50) : ''}
                              </Td>
                            ))}
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                )}

                {productQueryColumns.length > 0 && (
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" mb={2}>Mapeamento de Colunas (Produtos)</Text>
                    <Divider mb={3} />
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                      {PRODUCT_SYSTEM_FIELDS.map(field => (
                        <FormControl key={field.key}>
                          <FormLabel fontSize="xs">
                            {field.description}
                            {field.required && <Text as="span" color="red.400" ml={1}>*</Text>}
                          </FormLabel>
                          <Select
                            size="sm"
                            placeholder="-- Selecione --"
                            value={form.productColumnMapping[field.key] || ''}
                            onChange={(e) => updateProductMapping(field.key, e.target.value)}
                          >
                            {productQueryColumns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </Select>
                        </FormControl>
                      ))}
                    </SimpleGrid>
                  </Box>
                )}

                <Box mt={2} p={3} bg={refBg} borderRadius="md">
                  <Text fontSize="sm" fontWeight="medium" mb={1}>Status do sync de produtos</Text>
                  <HStack spacing={2}>
                    {productSyncStatus.lastSyncStatus && (
                      <Badge colorScheme={productSyncStatus.lastSyncStatus === "success" ? "green" : "red"}>
                        {productSyncStatus.lastSyncStatus === "success" ? "Sucesso" : "Erro"}
                      </Badge>
                    )}
                    <Text fontSize="xs" color="gray.500">
                      {formatSyncDate(productSyncStatus.lastSyncAt)}
                    </Text>
                  </HStack>
                  {productSyncStatus.lastSyncMessage && (
                    <Text fontSize="xs" color="gray.500" mt={1}>{productSyncStatus.lastSyncMessage}</Text>
                  )}
                  {productSyncStatus.lastSyncRows > 0 && (
                    <Text fontSize="xs" color="gray.500">{productSyncStatus.lastSyncRows} registros</Text>
                  )}
                  <Button
                    mt={3}
                    size="sm"
                    colorScheme="teal"
                    variant="outline"
                    isLoading={syncingProduct}
                    loadingText="Sincronizando..."
                    onClick={handleProductSync}
                  >
                    Sincronizar Produtos Agora
                  </Button>
                </Box>
              </VStack>
            )}
          </AccordionPanel>
        </AccordionItem>

        {/* 6. Sync Reversa de Pedidos */}
        <AccordionItem border="1px solid" borderColor={borderColor} borderRadius="md" mb={3}>
          <AccordionButton py={3} _expanded={{ bg: refBg }}>
            <Box flex="1" textAlign="left">
              <Text fontWeight="semibold">Pedidos (Sync Reversa)</Text>
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
            <VStack spacing={3} align="stretch">
              <Text fontSize="sm" color="gray.500">
                Sincroniza os pedidos integrados com os dados atualizados do ERP (itens, quantidades, preços, cliente).
                Pedidos deletados no ERP recebem o status "Deletado no ERP".
              </Text>
              <Box>
                <Button
                  size="sm"
                  colorScheme="teal"
                  variant="outline"
                  isLoading={syncingOrders}
                  loadingText="Sincronizando..."
                  onClick={handleOrderSync}
                >
                  Sincronizar Pedidos Agora
                </Button>
              </Box>
            </VStack>
          </AccordionPanel>
        </AccordionItem>

        {/* 7. Agendamento (ultimo) */}
        <AccordionItem border="1px solid" borderColor={borderColor} borderRadius="md" mb={3}>
          <AccordionButton py={3} _expanded={{ bg: refBg }}>
            <Box flex="1" textAlign="left">
              <Text fontWeight="semibold">Agendamento</Text>
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4}>
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
                <Text fontSize="sm" fontWeight="medium" mb={1}>Status do último sync</Text>
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
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      <VStack spacing={4} align="stretch" mt={4}>
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
            As vendas importadas do Sisplan serão categorizadas automaticamente como
            <strong> Atacado</strong>, com plataforma <strong>Sisplan</strong> e loja <strong>Fábrica</strong>.
          </Text>
        </Alert>
      </VStack>
    </Box>
  );
};

export default SisplanSettings;
