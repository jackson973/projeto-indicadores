import {
  Box,
  Flex,
  Heading,
  Input,
  Button,
  Text,
  Spinner,
  Badge,
  Divider,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  VStack,
  HStack,
  InputGroup,
  InputRightElement,
  IconButton,
  Tooltip,
} from "@chakra-ui/react";
import { useState, useRef } from "react";
import { fetchOFRastreio } from "../api";

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("pt-BR");
}

function formatQty(v) {
  const n = parseFloat(v) || 0;
  return n.toLocaleString("pt-BR");
}

// Timeline node circle
function TimelineNode({ index, total }) {
  return (
    <Flex direction="column" align="center" position="relative">
      {/* Connector line left */}
      {index > 0 && (
        <Box
          position="absolute"
          top="16px"
          right="50%"
          width="100%"
          height="2px"
          bg="blue.300"
          zIndex={0}
        />
      )}
      {/* Connector line right */}
      {index < total - 1 && (
        <Box
          position="absolute"
          top="16px"
          left="50%"
          width="100%"
          height="2px"
          bg="blue.300"
          zIndex={0}
        />
      )}
      {/* Circle */}
      <Flex
        w="32px"
        h="32px"
        borderRadius="full"
        bg="blue.500"
        color="white"
        align="center"
        justify="center"
        fontWeight="bold"
        fontSize="sm"
        zIndex={1}
        flexShrink={0}
      >
        {index + 1}
      </Flex>
    </Flex>
  );
}

export default function OFRastreio() {
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleSearch = async () => {
    const ofNum = searchInput.trim();
    if (!ofNum) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await fetchOFRastreio(ofNum);
      if (!result) {
        setError("OF não encontrada.");
      } else {
        setData(result);
      }
    } catch (err) {
      setError(err.message || "Erro ao buscar OF.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <Box p={6} maxW="1400px" mx="auto">
      <Heading size="md" mb={5} color="gray.700">
        Rastreio de OF
      </Heading>

      {/* Search */}
      <Flex mb={8} gap={3} maxW="420px">
        <InputGroup>
          <Input
            ref={inputRef}
            placeholder="Digite o número da OF..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            bg="white"
            borderColor="gray.300"
          />
        </InputGroup>
        <Button
          colorScheme="blue"
          onClick={handleSearch}
          isLoading={loading}
          minW="100px"
        >
          Buscar
        </Button>
      </Flex>

      {loading && (
        <Flex justify="center" mt={12}>
          <Spinner size="xl" color="blue.500" />
        </Flex>
      )}

      {error && (
        <Box p={4} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md" maxW="420px">
          <Text color="red.600">{error}</Text>
        </Box>
      )}

      {data && !loading && (
        <Box>
          {/* OF Header */}
          <Flex align="center" gap={4} mb={6} flexWrap="wrap">
            <Badge colorScheme="blue" fontSize="md" px={3} py={1} borderRadius="md">
              OF {data.fac_numero}
            </Badge>
            {data.fornecedor && (
              <Text fontSize="sm" color="gray.600">
                Fornecedor: <strong>{data.fornecedor}</strong>
              </Text>
            )}
            <Text fontSize="sm" color="gray.500">
              {data.etapas.length} etapa{data.etapas.length !== 1 ? "s" : ""}
            </Text>
          </Flex>

          {/* Horizontal Timeline */}
          <Box overflowX="auto" pb={4}>
            <Flex minW={`${data.etapas.length * 220}px`} align="flex-start" gap={0}>
              {data.etapas.map((etapa, idx) => (
                <Flex key={idx} flex="1" direction="column" align="center" px={2}>
                  {/* Node with connectors */}
                  <TimelineNode index={idx} total={data.etapas.length} />

                  {/* Card */}
                  <Box
                    mt={3}
                    w="100%"
                    bg="white"
                    border="1px solid"
                    borderColor="blue.200"
                    borderRadius="lg"
                    p={3}
                    boxShadow="sm"
                    minW="200px"
                  >
                    {/* Etapa name */}
                    <Text
                      fontWeight="bold"
                      fontSize="sm"
                      color="blue.700"
                      mb={2}
                      textAlign="center"
                    >
                      {etapa.descsetor}
                    </Text>

                    <Divider mb={2} />

                    {/* Dates */}
                    <VStack align="stretch" spacing={1} mb={3}>
                      <HStack justify="space-between" fontSize="xs">
                        <Text color="gray.500">Entrada:</Text>
                        <Text fontWeight="medium" color="gray.700">
                          {formatDate(etapa.dt_entrada)}
                        </Text>
                      </HStack>
                      <HStack justify="space-between" fontSize="xs">
                        <Text color="gray.500">Lancto:</Text>
                        <Text fontWeight="medium" color="gray.700">
                          {formatDate(etapa.dt_lancto)}
                        </Text>
                      </HStack>
                      <HStack justify="space-between" fontSize="xs">
                        <Text color="gray.500">Prev. Retorno:</Text>
                        <Text fontWeight="medium" color="gray.700">
                          {formatDate(etapa.dt_prev_ret)}
                        </Text>
                      </HStack>
                    </VStack>

                    {/* Products table */}
                    {etapa.produtos.length > 0 && (
                      <Box overflowX="auto">
                        <Table size="xs" variant="simple">
                          <Thead>
                            <Tr>
                              <Th fontSize="10px" px={1} py={1} color="gray.500">Produto / Parte</Th>
                              <Th fontSize="10px" px={1} py={1} color="gray.500" isNumeric>Qt.Orig</Th>
                              <Th fontSize="10px" px={1} py={1} color="gray.500" isNumeric>Qt.Final</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {etapa.produtos.map((p, pi) => (
                              <Tr key={pi}>
                                <Td px={1} py={1} maxW="140px">
                                  <Tooltip
                                    label={[p.descricao, p.desc_parte, p.tamanho, p.desc_cor]
                                      .filter(Boolean)
                                      .join(" | ")}
                                    placement="top"
                                    hasArrow
                                  >
                                    <Box>
                                      <Text fontSize="10px" fontWeight="medium" noOfLines={1}>
                                        {p.descricao || p.codigo || "—"}
                                      </Text>
                                      {p.desc_parte && (
                                        <Text fontSize="9px" color="gray.500" noOfLines={1}>
                                          {p.desc_parte}
                                        </Text>
                                      )}
                                      {(p.tamanho || p.desc_cor) && (
                                        <Text fontSize="9px" color="gray.400" noOfLines={1}>
                                          {[p.tamanho, p.desc_cor].filter(Boolean).join(" / ")}
                                        </Text>
                                      )}
                                    </Box>
                                  </Tooltip>
                                </Td>
                                <Td px={1} py={1} isNumeric fontSize="10px">
                                  {formatQty(p.qt_orig)}
                                </Td>
                                <Td px={1} py={1} isNumeric fontSize="10px">
                                  <Text
                                    fontWeight="medium"
                                    color={p.qt_final < p.qt_orig ? "orange.600" : "green.600"}
                                  >
                                    {formatQty(p.qt_final)}
                                  </Text>
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </Box>
                    )}

                    {/* Totals per etapa */}
                    {etapa.produtos.length > 1 && (
                      <Box mt={2} pt={2} borderTop="1px dashed" borderColor="gray.200">
                        <HStack justify="space-between" fontSize="xs">
                          <Text color="gray.500">Total Orig:</Text>
                          <Text fontWeight="bold" color="gray.700">
                            {formatQty(etapa.produtos.reduce((s, p) => s + p.qt_orig, 0))}
                          </Text>
                        </HStack>
                        <HStack justify="space-between" fontSize="xs">
                          <Text color="gray.500">Total Final:</Text>
                          <Text fontWeight="bold" color="orange.600">
                            {formatQty(etapa.produtos.reduce((s, p) => s + p.qt_final, 0))}
                          </Text>
                        </HStack>
                      </Box>
                    )}
                  </Box>
                </Flex>
              ))}
            </Flex>
          </Box>
        </Box>
      )}
    </Box>
  );
}
