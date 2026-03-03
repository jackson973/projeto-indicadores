import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Select,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
  useColorModeValue,
  useToast,
  Code
} from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { fetchWhatsappConversations, fetchWhatsappConversationUsers } from "../api";

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const formatDuration = (ms) => {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const truncate = (text, max = 120) => {
  if (!text) return "-";
  return text.length > max ? text.slice(0, max) + "..." : text;
};

const ToolCallDetail = ({ toolCalls }) => {
  const tcBg = useColorModeValue("gray.50", "gray.700");
  if (!toolCalls || toolCalls.length === 0) return <Text fontSize="xs" color="gray.500">Nenhuma</Text>;

  return (
    <VStack align="stretch" spacing={1}>
      {toolCalls.map((tc, i) => (
        <Box key={i} p={2} borderRadius="md" bg={tcBg} fontSize="xs">
          <Badge colorScheme="blue" fontSize="xs" mb={1}>{tc.name}</Badge>
          {tc.sql && (
            <Code display="block" p={1} fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all" mt={1}>
              {tc.sql}
            </Code>
          )}
          {tc.args && !tc.sql && (
            <Code display="block" p={1} fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all" mt={1}>
              {JSON.stringify(tc.args, null, 2)}
            </Code>
          )}
          {tc.rowCount !== undefined && (
            <Text mt={1} color="gray.500">{tc.rowCount} linhas retornadas</Text>
          )}
          {tc.error && (
            <Text mt={1} color="red.400">Erro: {tc.error}</Text>
          )}
        </Box>
      ))}
    </VStack>
  );
};

const ExpandableRow = ({ conv }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rowHoverBg = useColorModeValue("gray.50", "whiteAlpha.50");
  const detailBg = useColorModeValue("gray.50", "gray.800");
  const toolCalls = conv.toolCalls ? (typeof conv.toolCalls === "string" ? JSON.parse(conv.toolCalls) : conv.toolCalls) : [];

  return (
    <>
      <Tr
        cursor="pointer"
        onClick={() => setIsOpen(!isOpen)}
        _hover={{ bg: rowHoverBg }}
      >
        <Td fontSize="sm" whiteSpace="nowrap">
          <HStack spacing={1}>
            <IconButton
              icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              size="xs"
              variant="ghost"
              aria-label="Expandir"
              onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
            />
            <Text>{formatDate(conv.createdAt)}</Text>
          </HStack>
        </Td>
        <Td fontSize="sm">{conv.userName || "-"}</Td>
        <Td fontSize="sm" maxW="300px">
          <Tooltip label={conv.question} placement="top" hasArrow>
            <Text noOfLines={1}>{conv.question}</Text>
          </Tooltip>
        </Td>
        <Td fontSize="sm" maxW="300px">
          {conv.error ? (
            <Badge colorScheme="red" fontSize="xs">Erro</Badge>
          ) : (
            <Tooltip label={conv.response} placement="top" hasArrow>
              <Text noOfLines={1}>{truncate(conv.response)}</Text>
            </Tooltip>
          )}
        </Td>
        <Td fontSize="sm" isNumeric>
          {toolCalls.length > 0 && (
            <Badge colorScheme="purple" fontSize="xs">{toolCalls.length}</Badge>
          )}
        </Td>
        <Td fontSize="sm" isNumeric>{formatDuration(conv.durationMs)}</Td>
      </Tr>
      {isOpen && (
        <Tr>
          <Td colSpan={6} p={0} border="none">
            <Collapse in={isOpen} animateOpacity>
              <Box p={4} bg={detailBg} borderBottomWidth="1px">
                <VStack align="stretch" spacing={3}>
                  <Box>
                    <Text fontWeight="semibold" fontSize="sm" mb={1}>Pergunta:</Text>
                    <Text fontSize="sm" whiteSpace="pre-wrap">{conv.question}</Text>
                  </Box>
                  {conv.response && (
                    <Box>
                      <Text fontWeight="semibold" fontSize="sm" mb={1}>Resposta:</Text>
                      <Text fontSize="sm" whiteSpace="pre-wrap">{conv.response}</Text>
                    </Box>
                  )}
                  {conv.error && (
                    <Box>
                      <Text fontWeight="semibold" fontSize="sm" mb={1} color="red.400">Erro:</Text>
                      <Text fontSize="sm" color="red.400">{conv.error}</Text>
                    </Box>
                  )}
                  {toolCalls.length > 0 && (
                    <Box>
                      <Text fontWeight="semibold" fontSize="sm" mb={1}>Tool Calls:</Text>
                      <ToolCallDetail toolCalls={toolCalls} />
                    </Box>
                  )}
                  <HStack spacing={4} fontSize="xs" color="gray.500">
                    <Text>Telefone: {conv.userPhone || "-"}</Text>
                    <Text>Duração: {formatDuration(conv.durationMs)}</Text>
                  </HStack>
                </VStack>
              </Box>
            </Collapse>
          </Td>
        </Tr>
      )}
    </>
  );
};

const ConversationLogs = () => {
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    userId: "",
    search: "",
    startDate: "",
    endDate: ""
  });
  const [searchInput, setSearchInput] = useState("");
  const toast = useToast();
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  const loadConversations = useCallback(async (currentPage, currentFilters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", currentPage);
      params.set("limit", "30");
      if (currentFilters.userId) params.set("userId", currentFilters.userId);
      if (currentFilters.search) params.set("search", currentFilters.search);
      if (currentFilters.startDate) params.set("startDate", currentFilters.startDate);
      if (currentFilters.endDate) params.set("endDate", currentFilters.endDate);

      const data = await fetchWhatsappConversations(params.toString());
      setConversations(data.conversations);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      toast({ title: "Erro ao carregar conversas", description: err.message, status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchWhatsappConversationUsers();
      setUsers(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadConversations(page, filters);
  }, [page, filters, loadConversations]);

  const handleSearch = () => {
    setPage(1);
    setFilters(f => ({ ...f, search: searchInput }));
  };

  const handleFilterChange = (key, value) => {
    setPage(1);
    setFilters(f => ({ ...f, [key]: value }));
  };

  return (
    <Box>
      <Text fontSize="2xl" fontWeight="bold" mb={4}>Log de Conversas do Bot</Text>

      {/* Filters */}
      <Box bg={cardBg} p={4} borderRadius="lg" borderWidth="1px" borderColor={borderColor} mb={4}>
        <Flex gap={3} wrap="wrap" align="flex-end">
          <FormControl maxW="200px">
            <FormLabel fontSize="xs" mb={1}>Usuário</FormLabel>
            <Select size="sm" value={filters.userId} onChange={e => handleFilterChange("userId", e.target.value)}>
              <option value="">Todos</option>
              {users.map(u => (
                <option key={u.userId} value={u.userId}>{u.userName}</option>
              ))}
            </Select>
          </FormControl>
          <FormControl maxW="160px">
            <FormLabel fontSize="xs" mb={1}>De</FormLabel>
            <Input size="sm" type="date" value={filters.startDate} onChange={e => handleFilterChange("startDate", e.target.value)} />
          </FormControl>
          <FormControl maxW="160px">
            <FormLabel fontSize="xs" mb={1}>Até</FormLabel>
            <Input size="sm" type="date" value={filters.endDate} onChange={e => handleFilterChange("endDate", e.target.value)} />
          </FormControl>
          <FormControl maxW="250px">
            <FormLabel fontSize="xs" mb={1}>Buscar</FormLabel>
            <HStack>
              <Input
                size="sm"
                placeholder="Buscar em perguntas/respostas..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
              />
              <IconButton size="sm" icon={<SearchIcon />} aria-label="Buscar" onClick={handleSearch} />
            </HStack>
          </FormControl>
          {(filters.userId || filters.search || filters.startDate || filters.endDate) && (
            <Button size="sm" variant="ghost" onClick={() => {
              setSearchInput("");
              setFilters({ userId: "", search: "", startDate: "", endDate: "" });
              setPage(1);
            }}>
              Limpar filtros
            </Button>
          )}
        </Flex>
      </Box>

      {/* Results */}
      <Box bg={cardBg} borderRadius="lg" borderWidth="1px" borderColor={borderColor} overflow="hidden">
        {loading ? (
          <Flex justify="center" py={10}>
            <Spinner size="lg" color="blue.500" />
          </Flex>
        ) : conversations.length === 0 ? (
          <Flex justify="center" py={10}>
            <Text color="gray.500">Nenhuma conversa encontrada.</Text>
          </Flex>
        ) : (
          <>
            <Flex justify="space-between" align="center" px={4} py={2} borderBottomWidth="1px" borderColor={borderColor}>
              <Text fontSize="sm" color="gray.500">
                {total} conversa{total !== 1 ? "s" : ""} encontrada{total !== 1 ? "s" : ""}
              </Text>
              <HStack spacing={2}>
                <IconButton
                  icon={<ChevronLeftIcon />}
                  size="sm"
                  variant="ghost"
                  isDisabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  aria-label="Página anterior"
                />
                <Text fontSize="sm">{page} / {totalPages}</Text>
                <IconButton
                  icon={<ChevronRightIcon />}
                  size="sm"
                  variant="ghost"
                  isDisabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  aria-label="Próxima página"
                />
              </HStack>
            </Flex>

            <TableContainer>
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>Data</Th>
                    <Th>Usuário</Th>
                    <Th>Pergunta</Th>
                    <Th>Resposta</Th>
                    <Th isNumeric>Tools</Th>
                    <Th isNumeric>Tempo</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {conversations.map(conv => (
                    <ExpandableRow key={conv.id} conv={conv} />
                  ))}
                </Tbody>
              </Table>
            </TableContainer>

            {/* Bottom pagination */}
            {totalPages > 1 && (
              <Flex justify="center" align="center" py={3} borderTopWidth="1px" borderColor={borderColor}>
                <HStack spacing={2}>
                  <IconButton
                    icon={<ChevronLeftIcon />}
                    size="sm"
                    variant="ghost"
                    isDisabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    aria-label="Página anterior"
                  />
                  <Text fontSize="sm">{page} / {totalPages}</Text>
                  <IconButton
                    icon={<ChevronRightIcon />}
                    size="sm"
                    variant="ghost"
                    isDisabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    aria-label="Próxima página"
                  />
                </HStack>
              </Flex>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default ConversationLogs;
