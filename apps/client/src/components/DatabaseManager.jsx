import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Textarea,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Spinner,
  Alert,
  AlertIcon,
  useColorModeValue,
  useBreakpointValue,
  IconButton,
  Badge,
  Tooltip,
  Heading,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerHeader,
  DrawerBody,
  useDisclosure,
} from "@chakra-ui/react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  HamburgerIcon,
  RepeatIcon,
  DeleteIcon,
} from "@chakra-ui/icons";
import { fetchDatabaseSchema, executeDatabaseQuery } from "../api";

export default function DatabaseManager() {
  const [tables, setTables] = useState([]);
  const [expandedTable, setExpandedTable] = useState(null);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [loadingSchema, setLoadingSchema] = useState(true);
  const textareaRef = useRef(null);
  const schemaDrawer = useDisclosure();
  const isMobile = useBreakpointValue({ base: true, lg: false });

  const panelBg = useColorModeValue("white", "gray.800");
  const schemaBg = useColorModeValue("gray.50", "gray.900");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const hoverBg = useColorModeValue("blue.50", "whiteAlpha.100");
  const tableLabelColor = useColorModeValue("blue.700", "blue.200");
  const colLabelColor = useColorModeValue("gray.600", "gray.400");
  const colTypeBg = useColorModeValue("gray.100", "gray.700");
  const nnColor = useColorModeValue("orange.500", "orange.300");
  const resultHeaderBg = useColorModeValue("gray.50", "gray.700");
  const editorBg = useColorModeValue("gray.900", "gray.950");

  useEffect(() => {
    loadSchema();
  }, []);

  const loadSchema = async () => {
    try {
      setLoadingSchema(true);
      const data = await fetchDatabaseSchema();
      setTables(data.tables || []);
    } catch (err) {
      console.error("Failed to load schema:", err);
    } finally {
      setLoadingSchema(false);
    }
  };

  const toggleTable = (tableName) => {
    setExpandedTable(expandedTable === tableName ? null : tableName);
  };

  const handleTableDoubleClick = (tableName) => {
    setSql(`SELECT * FROM ${tableName} LIMIT 100;`);
    if (isMobile) schemaDrawer.onClose();
    textareaRef.current?.focus();
  };

  const executeQuery = useCallback(async () => {
    if (!sql.trim() || executing) return;

    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const data = await executeDatabaseQuery(sql.trim());
      setResult(data);
      const upper = sql.trim().toUpperCase();
      if (
        upper.startsWith("CREATE") ||
        upper.startsWith("ALTER") ||
        upper.startsWith("DROP")
      ) {
        loadSchema();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  }, [sql, executing]);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      executeQuery();
    }
  };

  const formatType = (type) => {
    return type
      .replace("character varying", "varchar")
      .replace("timestamp without time zone", "timestamp")
      .replace("timestamp with time zone", "timestamptz")
      .replace("double precision", "double");
  };

  const schemaContent = (
    <>
      <Box px={3} py={3} borderBottom="1px solid" borderColor={borderColor}>
        <HStack justify="space-between">
          <Heading size="xs" textTransform="uppercase" letterSpacing="wide">
            Tabelas
          </Heading>
          <Tooltip label="Recarregar">
            <IconButton
              icon={<RepeatIcon />}
              size="xs"
              variant="ghost"
              onClick={loadSchema}
              isLoading={loadingSchema}
              aria-label="Recarregar"
            />
          </Tooltip>
        </HStack>
      </Box>

      {loadingSchema ? (
        <Flex justify="center" py={8}>
          <Spinner size="sm" />
        </Flex>
      ) : (
        <VStack spacing={0} align="stretch" pb={4}>
          {tables.map((table) => (
            <Box key={table.name}>
              <HStack
                px={3}
                py={1.5}
                cursor="pointer"
                _hover={{ bg: hoverBg }}
                onClick={() => toggleTable(table.name)}
                onDoubleClick={() => handleTableDoubleClick(table.name)}
                bg={expandedTable === table.name ? hoverBg : "transparent"}
                spacing={1}
              >
                {expandedTable === table.name ? (
                  <ChevronDownIcon boxSize={4} color={tableLabelColor} />
                ) : (
                  <ChevronRightIcon boxSize={4} color={tableLabelColor} />
                )}
                <Text fontSize="sm" fontWeight="500" color={tableLabelColor} noOfLines={1}>
                  {table.name}
                </Text>
                <Badge ml="auto" fontSize="10px" colorScheme="gray" variant="subtle">
                  {table.columns.length}
                </Badge>
              </HStack>

              {expandedTable === table.name && (
                <VStack spacing={0} align="stretch" pl={7} pr={2}>
                  {table.columns.map((col) => (
                    <HStack
                      key={col.name}
                      py={0.5}
                      px={2}
                      spacing={1.5}
                      _hover={{ bg: hoverBg }}
                      borderRadius="sm"
                    >
                      {!col.nullable && (
                        <Box w="6px" h="6px" borderRadius="full" bg={nnColor} flexShrink={0} title="NOT NULL" />
                      )}
                      {col.nullable && <Box w="6px" flexShrink={0} />}
                      <Text fontSize="xs" color={colLabelColor} flex={1} noOfLines={1}>
                        {col.name}
                      </Text>
                      <Text
                        fontSize="10px"
                        color={colLabelColor}
                        bg={colTypeBg}
                        px={1.5}
                        py={0.5}
                        borderRadius="sm"
                        fontFamily="mono"
                        whiteSpace="nowrap"
                        flexShrink={0}
                      >
                        {formatType(col.type)}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              )}
            </Box>
          ))}
        </VStack>
      )}
    </>
  );

  return (
    <Flex h="calc(100vh - 80px)" gap={0} overflow="hidden">
      {/* Desktop Schema Sidebar */}
      {!isMobile && (
        <Box
          w="250px"
          minW="250px"
          bg={schemaBg}
          borderRight="1px solid"
          borderColor={borderColor}
          overflowY="auto"
          flexShrink={0}
        >
          {schemaContent}
        </Box>
      )}

      {/* Mobile Schema Drawer */}
      {isMobile && (
        <Drawer isOpen={schemaDrawer.isOpen} placement="left" onClose={schemaDrawer.onClose} size="xs">
          <DrawerOverlay />
          <DrawerContent bg={schemaBg}>
            <DrawerCloseButton />
            <DrawerHeader px={3} py={3} fontSize="sm">
              Tabelas
            </DrawerHeader>
            <DrawerBody p={0} overflowY="auto">
              <VStack spacing={0} align="stretch" pb={4}>
                {loadingSchema ? (
                  <Flex justify="center" py={8}><Spinner size="sm" /></Flex>
                ) : tables.map((table) => (
                  <Box key={table.name}>
                    <HStack
                      px={3}
                      py={1.5}
                      cursor="pointer"
                      _hover={{ bg: hoverBg }}
                      onClick={() => toggleTable(table.name)}
                      onDoubleClick={() => handleTableDoubleClick(table.name)}
                      bg={expandedTable === table.name ? hoverBg : "transparent"}
                      spacing={1}
                    >
                      {expandedTable === table.name ? (
                        <ChevronDownIcon boxSize={4} color={tableLabelColor} />
                      ) : (
                        <ChevronRightIcon boxSize={4} color={tableLabelColor} />
                      )}
                      <Text fontSize="sm" fontWeight="500" color={tableLabelColor} noOfLines={1}>
                        {table.name}
                      </Text>
                      <Badge ml="auto" fontSize="10px" colorScheme="gray" variant="subtle">
                        {table.columns.length}
                      </Badge>
                    </HStack>

                    {expandedTable === table.name && (
                      <VStack spacing={0} align="stretch" pl={7} pr={2}>
                        {table.columns.map((col) => (
                          <HStack key={col.name} py={0.5} px={2} spacing={1.5} borderRadius="sm">
                            {!col.nullable && (
                              <Box w="6px" h="6px" borderRadius="full" bg={nnColor} flexShrink={0} />
                            )}
                            {col.nullable && <Box w="6px" flexShrink={0} />}
                            <Text fontSize="xs" color={colLabelColor} flex={1} noOfLines={1}>
                              {col.name}
                            </Text>
                            <Text fontSize="10px" color={colLabelColor} bg={colTypeBg} px={1.5} py={0.5} borderRadius="sm" fontFamily="mono" whiteSpace="nowrap" flexShrink={0}>
                              {formatType(col.type)}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    )}
                  </Box>
                ))}
              </VStack>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      )}

      {/* Right Panel - Editor + Results */}
      <Flex flex={1} direction="column" overflow="hidden" minW={0}>
        {/* SQL Editor Toolbar */}
        <HStack
          px={3}
          py={2}
          bg={panelBg}
          borderBottom="1px solid"
          borderColor={borderColor}
          flexShrink={0}
          flexWrap="wrap"
          spacing={2}
        >
          {isMobile && (
            <Tooltip label="Tabelas">
              <IconButton
                icon={<HamburgerIcon />}
                size="sm"
                variant="outline"
                onClick={schemaDrawer.onOpen}
                aria-label="Abrir tabelas"
              />
            </Tooltip>
          )}
          <Tooltip label="Executar (Ctrl+Enter)">
            <Button
              size="sm"
              colorScheme="green"
              onClick={executeQuery}
              isLoading={executing}
              leftIcon={<Text fontSize="lg">&#9654;</Text>}
            >
              Executar
            </Button>
          </Tooltip>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSql("");
              setResult(null);
              setError(null);
            }}
            leftIcon={<DeleteIcon />}
          >
            Limpar
          </Button>
          {result && (
            <Text fontSize="xs" color="gray.500" ml="auto" whiteSpace="nowrap">
              {result.rowCount != null ? `${result.rowCount} linha(s)` : ""}{" "}
              {result.duration != null ? `em ${result.duration}ms` : ""}
            </Text>
          )}
        </HStack>

        {/* SQL Editor Textarea */}
        <Textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={"-- Digite sua query SQL aqui...\n-- Ctrl+Enter para executar\n-- Duplo-clique em uma tabela para gerar SELECT"}
          fontFamily="'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace"
          fontSize="sm"
          bg={editorBg}
          color="green.300"
          _placeholder={{ color: "gray.500" }}
          border="none"
          borderRadius={0}
          rows={isMobile ? 5 : 8}
          resize="vertical"
          spellCheck={false}
          flexShrink={0}
          _focus={{ boxShadow: "none", border: "none" }}
        />

        {/* Results Panel */}
        <Box flex={1} overflow="auto" bg={panelBg}>
          {executing && (
            <Flex justify="center" align="center" py={12}>
              <Spinner size="lg" color="blue.400" />
              <Text ml={3} color="gray.500">
                Executando query...
              </Text>
            </Flex>
          )}

          {error && !executing && (
            <Alert status="error" variant="left-accent" m={3} borderRadius="md">
              <AlertIcon />
              <Box>
                <Text fontWeight="bold" fontSize="sm">
                  Erro na execucao
                </Text>
                <Text fontSize="sm" fontFamily="mono" whiteSpace="pre-wrap">
                  {error}
                </Text>
              </Box>
            </Alert>
          )}

          {result && !executing && (
            <>
              {result.rows && result.rows.length > 0 ? (
                <Box>
                  <HStack
                    px={3}
                    py={2}
                    bg={resultHeaderBg}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    flexWrap="wrap"
                    spacing={2}
                  >
                    <Text fontSize="xs" fontWeight="bold" textTransform="uppercase">
                      Resultados
                    </Text>
                    <Badge colorScheme="blue" fontSize="10px">
                      {result.rows.length} linha(s)
                    </Badge>
                    <Text fontSize="xs" color="gray.500">
                      {result.duration}ms
                    </Text>
                    <Button
                      size="xs"
                      variant="ghost"
                      ml="auto"
                      onClick={() => {
                        if (!result.rows.length) return;
                        const headers = Object.keys(result.rows[0]);
                        const csv = [
                          headers.join(","),
                          ...result.rows.map((row) =>
                            headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
                          ),
                        ].join("\n");
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = "query-result.csv";
                        link.click();
                        URL.revokeObjectURL(link.href);
                      }}
                    >
                      Exportar CSV
                    </Button>
                  </HStack>
                  <TableContainer overflowX="auto" overflowY="auto" maxH="calc(100vh - 380px)">
                    <Table size="sm" variant="simple">
                      <Thead position="sticky" top={0} bg={resultHeaderBg} zIndex={1}>
                        <Tr>
                          <Th fontSize="10px" px={2} py={2} borderColor={borderColor} isNumeric w="40px">
                            #
                          </Th>
                          {result.fields.map((field) => (
                            <Th key={field.name} fontSize="10px" px={2} py={2} borderColor={borderColor} whiteSpace="nowrap">
                              {field.name}
                            </Th>
                          ))}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {result.rows.map((row, i) => (
                          <Tr key={i} _hover={{ bg: hoverBg }}>
                            <Td fontSize="xs" px={2} py={1} borderColor={borderColor} isNumeric color="gray.400">
                              {i + 1}
                            </Td>
                            {result.fields.map((field) => (
                              <Td
                                key={field.name}
                                fontSize="xs"
                                px={2}
                                py={1}
                                borderColor={borderColor}
                                maxW="300px"
                                overflow="hidden"
                                textOverflow="ellipsis"
                                whiteSpace="nowrap"
                                title={String(row[field.name] ?? "")}
                              >
                                {row[field.name] === null ? (
                                  <Text as="span" color="gray.400" fontStyle="italic">
                                    NULL
                                  </Text>
                                ) : typeof row[field.name] === "object" ? (
                                  JSON.stringify(row[field.name])
                                ) : (
                                  String(row[field.name])
                                )}
                              </Td>
                            ))}
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                </Box>
              ) : (
                <Alert status="success" variant="left-accent" m={3} borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="bold" fontSize="sm">
                      Query executada com sucesso
                    </Text>
                    <Text fontSize="sm">
                      {result.rowCount != null
                        ? `${result.rowCount} linha(s) afetada(s)`
                        : "Nenhum resultado retornado"}{" "}
                      em {result.duration}ms
                    </Text>
                  </Box>
                </Alert>
              )}
            </>
          )}

          {!result && !error && !executing && (
            <Flex justify="center" align="center" h="100%" color="gray.400" direction="column" py={12}>
              <Text fontSize="4xl" mb={2}>&#128451;</Text>
              <Text fontSize="sm">Execute uma query para ver os resultados</Text>
              <Text fontSize="xs" color="gray.500" mt={1}>
                Ctrl+Enter para executar | Duplo-clique na tabela para gerar SELECT
              </Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
