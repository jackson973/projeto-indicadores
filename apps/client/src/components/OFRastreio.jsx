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

export default function OFRastreio() {
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const inputRef = useRef(null);
  const detailRef = useRef(null);

  const handleSearch = async () => {
    const ofNum = searchInput.trim();
    if (!ofNum) return;
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedIdx(null);
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

  const handleCardClick = (idx) => {
    const next = selectedIdx === idx ? null : idx;
    setSelectedIdx(next);
    if (next !== null) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  const selectedEtapa = selectedIdx !== null && data ? data.etapas[selectedIdx] : null;

  return (
    <Box p={{ base: 3, md: 6 }} maxW="1400px" mx="auto">
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
          <Box mb={5} bg="white" p={{ base: 3, md: 4 }} borderRadius="lg" border="1px solid" borderColor="gray.200" boxShadow="sm">
            <Flex align="center" justify="space-between" gap={2} mb={{ base: 3, md: 0 }} flexWrap="wrap">
              <Flex align="center" gap={{ base: 3, md: 5 }} flexWrap="wrap" flex="1" minW={0}>
                <Badge colorScheme="blue" fontSize="md" px={3} py={1} borderRadius="md">
                  OF {data.fac_numero}
                </Badge>
              </Flex>
              <Text fontSize="xs" color="gray.400" flexShrink={0}>
                {data.etapas.length} etapa{data.etapas.length !== 1 ? "s" : ""}
              </Text>
            </Flex>

            <Flex
              mt={{ base: 2, md: 3 }}
              gap={{ base: 1, md: 3 }}
              direction={{ base: "column", md: "row" }}
              align={{ base: "stretch", md: "center" }}
              flexWrap="wrap"
            >
              <HStack spacing={1} fontSize="sm">
                <Text color="gray.500">Abertura:</Text>
                <Text fontWeight="medium" color="gray.700">{formatDate(data.dt_abertura)}</Text>
              </HStack>
              <Text color="gray.300" display={{ base: "none", md: "block" }}>·</Text>
              <HStack spacing={1} fontSize="sm">
                <Text color="gray.500">Último lançto:</Text>
                <Text fontWeight="medium" color="gray.700">{formatDate(data.dt_ultimo_lancto)}</Text>
              </HStack>
              <Text color="gray.300" display={{ base: "none", md: "block" }}>·</Text>
              <HStack spacing={1} fontSize="sm" minW={0}>
                <Text color="gray.500" flexShrink={0}>Última movimentação:</Text>
                <Text fontWeight="medium" color="blue.600" isTruncated>{data.ultima_etapa || "—"}</Text>
              </HStack>
            </Flex>
          </Box>

          {/* Horizontal Timeline */}
          <Box overflowX="auto" pb={4}>
            <Box minW={`${data.etapas.length * 220}px`}>

              {/* Rail + Circles row */}
              <Box position="relative" mb={4} px={`${100 / (data.etapas.length * 2)}%`}>
                {/* Horizontal line */}
                <Box
                  position="absolute"
                  top="16px"
                  left={`${100 / (data.etapas.length * 2)}%`}
                  right={`${100 / (data.etapas.length * 2)}%`}
                  height="2px"
                  bg="blue.300"
                  zIndex={0}
                />
                {/* Circles */}
                <Flex justify="space-between" position="relative" zIndex={1}>
                  {data.etapas.map((etapa, idx) => (
                    <Tooltip key={idx} label={etapa.descsetor} placement="top" hasArrow>
                      <Flex
                        w="32px"
                        h="32px"
                        borderRadius="full"
                        bg={selectedIdx === idx ? "blue.700" : "blue.500"}
                        color="white"
                        align="center"
                        justify="center"
                        fontWeight="bold"
                        fontSize="sm"
                        flexShrink={0}
                        cursor="pointer"
                        onClick={() => handleCardClick(idx)}
                        boxShadow={selectedIdx === idx ? "0 0 0 3px #BEE3F8" : "none"}
                        transition="all 0.15s"
                      >
                        {idx + 1}
                      </Flex>
                    </Tooltip>
                  ))}
                </Flex>
              </Box>

              {/* Cards row */}
              <Flex align="flex-start" gap={3}>
                {data.etapas.map((etapa, idx) => {
                  const isSelected = selectedIdx === idx;
                  const hasDivergence = etapa.produtos.some(p => p.qt_final !== p.qt_orig);
                  return (
                    <Box
                      key={idx}
                      flex="1"
                      bg={isSelected ? "blue.50" : "white"}
                      border="1px solid"
                      borderColor={isSelected ? "blue.400" : hasDivergence ? "orange.200" : "gray.200"}
                      borderRadius="lg"
                      p={3}
                      boxShadow={isSelected ? "md" : "sm"}
                      minW="200px"
                      cursor="pointer"
                      onClick={() => handleCardClick(idx)}
                      transition="all 0.15s"
                      _hover={{ borderColor: "blue.300", boxShadow: "md" }}
                    >
                      {/* Etapa name */}
                      <Text
                        fontWeight="bold"
                        fontSize="xs"
                        color={isSelected ? "blue.700" : "gray.700"}
                        mb={1}
                        textAlign="center"
                        textTransform="uppercase"
                        letterSpacing="wide"
                      >
                        {etapa.descsetor}
                      </Text>

                      {/* Responsável (terceirizado) */}
                      <Tooltip label={etapa.terceirizado_nome || "Sem responsável"} placement="top" hasArrow>
                        <Text
                          fontSize="10px"
                          color={etapa.terceirizado_nome ? "gray.600" : "gray.400"}
                          textAlign="center"
                          mb={2}
                          isTruncated
                          fontStyle={etapa.terceirizado_nome ? "normal" : "italic"}
                        >
                          {etapa.terceirizado_nome || "—"}
                        </Text>
                      </Tooltip>

                      <Divider mb={2} />

                      {/* Dates */}
                      <VStack align="stretch" spacing={0} mb={3}>
                        <HStack justify="space-between" fontSize="xs" py="2px">
                          <Text color="gray.500">Entrada:</Text>
                          <Text color="gray.700">{formatDate(etapa.dt_entrada)}</Text>
                        </HStack>
                        <HStack justify="space-between" fontSize="xs" py="2px">
                          <Text color="gray.500">Lancto:</Text>
                          <Text color="gray.700">{formatDate(etapa.dt_lancto)}</Text>
                        </HStack>
                        <HStack justify="space-between" fontSize="xs" py="2px">
                          <Text color="gray.500">Prev. Retorno:</Text>
                          <Text color="gray.700">{formatDate(etapa.dt_prev_ret)}</Text>
                        </HStack>
                      </VStack>

                      {/* Totals summary only on card */}
                      {etapa.produtos.length > 0 && (
                        <Box pt={2} borderTop="1px solid" borderColor="gray.100">
                          <HStack justify="space-between" fontSize="xs">
                            <Text color="gray.500">Qt. Orig:</Text>
                            <Text color="gray.700">
                              {formatQty(etapa.produtos.reduce((s, p) => s + p.qt_orig, 0))}
                            </Text>
                          </HStack>
                          <HStack justify="space-between" fontSize="xs">
                            <Text color="gray.500">Qt. Final:</Text>
                            <Text
                              color={hasDivergence ? "orange.600" : "gray.700"}
                              fontWeight={hasDivergence ? "bold" : "normal"}
                            >
                              {formatQty(etapa.produtos.reduce((s, p) => s + p.qt_final, 0))}
                            </Text>
                          </HStack>
                        </Box>
                      )}

                      {/* Click hint */}
                      <Text fontSize="9px" color="gray.400" textAlign="center" mt={2}>
                        {isSelected ? "▲ fechar detalhes" : "▼ ver detalhes"}
                      </Text>
                    </Box>
                  );
                })}
              </Flex>
            </Box>
          </Box>

          {/* Detail panel */}
          {selectedEtapa && (
            <Box
              ref={detailRef}
              mt={4}
              bg="white"
              border="1px solid"
              borderColor="blue.200"
              borderRadius="lg"
              p={{ base: 3, md: 5 }}
              boxShadow="md"
            >
              <Flex
                align={{ base: "flex-start", md: "center" }}
                justify="space-between"
                mb={4}
                direction={{ base: "column", md: "row" }}
                gap={3}
              >
                <Flex align="center" gap={3} flexWrap="wrap">
                  <Badge colorScheme="blue" px={2} py={1} borderRadius="md">
                    Etapa {selectedIdx + 1}
                  </Badge>
                  <Heading size="sm" color="blue.700">
                    {selectedEtapa.descsetor}
                  </Heading>
                  {selectedEtapa.terceirizado_nome && (
                    <HStack spacing={1} fontSize="sm">
                      <Text color="gray.500">Responsável:</Text>
                      <Text fontWeight="medium" color="gray.700">{selectedEtapa.terceirizado_nome}</Text>
                    </HStack>
                  )}
                </Flex>
                <Flex
                  gap={{ base: 2, md: 6 }}
                  fontSize="sm"
                  direction={{ base: "column", md: "row" }}
                  w={{ base: "100%", md: "auto" }}
                >
                  <HStack spacing={1}>
                    <Text color="gray.500">Entrada:</Text>
                    <Text fontWeight="medium">{formatDate(selectedEtapa.dt_entrada)}</Text>
                  </HStack>
                  <HStack spacing={1}>
                    <Text color="gray.500">Lançto:</Text>
                    <Text fontWeight="medium">{formatDate(selectedEtapa.dt_lancto)}</Text>
                  </HStack>
                  <HStack spacing={1}>
                    <Text color="gray.500">Prev. Retorno:</Text>
                    <Text fontWeight="medium">{formatDate(selectedEtapa.dt_prev_ret)}</Text>
                  </HStack>
                </Flex>
              </Flex>

              <Box overflowX="auto" mx={{ base: -3, md: 0 }}>
              <Table size="sm" variant="simple">
                <Thead bg="gray.50">
                  <Tr>
                    <Th color="gray.500">Produto</Th>
                    <Th color="gray.500">Parte</Th>
                    <Th color="gray.500" isNumeric>Qt. Original</Th>
                    <Th color="gray.500" isNumeric>Qt. Final</Th>
                    <Th color="gray.500" isNumeric>Diferença</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {selectedEtapa.produtos.map((p, pi) => {
                    const diff = p.qt_final - p.qt_orig;
                    const hasDiff = diff !== 0;
                    return (
                      <Tr
                        key={pi}
                        bg={hasDiff ? "orange.50" : undefined}
                        borderLeft={hasDiff ? "3px solid" : undefined}
                        borderLeftColor={hasDiff ? "orange.400" : undefined}
                      >
                        <Td>
                          <Text fontSize="sm" color="gray.800">{p.descricao || p.codigo || "—"}</Text>
                          {p.codigo && p.descricao && (
                            <Text fontSize="xs" color="gray.400">{p.codigo}</Text>
                          )}
                        </Td>
                        <Td>
                          <Text fontSize="sm" color="gray.700">{p.desc_parte || p.parte || "—"}</Text>
                        </Td>
                        <Td isNumeric fontSize="sm" color="gray.700">{formatQty(p.qt_orig)}</Td>
                        <Td isNumeric fontSize="sm">
                          <Text color={hasDiff ? "orange.600" : "gray.700"} fontWeight={hasDiff ? "bold" : "normal"}>
                            {formatQty(p.qt_final)}
                          </Text>
                        </Td>
                        <Td isNumeric fontSize="sm">
                          {hasDiff ? (
                            <Text color={diff < 0 ? "red.500" : "green.600"} fontWeight="bold">
                              {diff > 0 ? "+" : ""}{formatQty(diff)}
                            </Text>
                          ) : (
                            <Text color="gray.400">—</Text>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
              </Box>

              {/* Detail totals */}
              <Box className="css-zgubbz" mt={3} pt={3} borderTop="1px solid" borderColor="gray.100" display="flex" justifyContent="flex-end" gap={6} fontSize="sm">
                <HStack className="css-926vde" spacing={1}>
                  <Text className="css-q9k0mw" color="gray.500">Qt. Orig:</Text>
                  <Text className="css-2catvg" fontWeight="bold" color="gray.700">
                    {formatQty(selectedEtapa.produtos.reduce((s, p) => s + p.qt_orig, 0))}
                  </Text>
                </HStack>
                <HStack className="css-926vde" spacing={1}>
                  <Text className="css-q9k0mw" color="gray.500">Qt. Final:</Text>
                  <Text className="css-164rdht" fontWeight="bold" color="gray.700">
                    {formatQty(selectedEtapa.produtos.reduce((s, p) => s + p.qt_final, 0))}
                  </Text>
                </HStack>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
