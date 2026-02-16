import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Flex,
  HStack,
  Image,
  SimpleGrid,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useColorModeValue
} from "@chakra-ui/react";
import { StarIcon } from "@chakra-ui/icons";
import { formatCurrency, formatNumber } from "../utils/format";
import { getPlatformMeta } from "../utils/platforms";
import { fetchAbcDetails } from "../api";

const PAGE_SIZE = 8;

const AbcTable = ({ data, filters }) => {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState("");
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState({});
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = data.slice(startIndex, startIndex + PAGE_SIZE);

  const paramsBase = useMemo(() => {
    const params = new URLSearchParams();
    if (filters?.start) params.set("start", filters.start);
    if (filters?.end) params.set("end", filters.end);
    if (filters?.store) params.set("store", filters.store);
    return params;
  }, [filters]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const panelBg = useColorModeValue("white", "gray.800");
  const mutedText = useColorModeValue("gray.500", "gray.300");
  const rowHover = useColorModeValue("gray.50", "gray.700");
  const expandedBg = useColorModeValue("gray.50", "gray.700");

  return (
    <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm">
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="bold">
          <HStack spacing={2}>
            <StarIcon color="blue.500" />
            <span>Curva ABC de anúncios</span>
          </HStack>
        </Text>
        <Text fontSize="sm" color={mutedText}>
          Página {page} de {totalPages}
        </Text>
      </Flex>
      <TableContainer>
        <Table size="sm">
          <Thead>
            <Tr>
              <Th>Imagem</Th>
              <Th>Nome do anúncio</Th>
              <Th>Plataforma</Th>
              <Th isNumeric>Quantidade vendida</Th>
              <Th isNumeric>Faturamento</Th>
              <Th>Classe</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pageItems.map((item) => {
              const adName = item.adName || item.product;
              const isOpen = expanded === adName;
              const detail = details[adName];
              const isLoading = loading[adName];
              const platformMeta = getPlatformMeta(item.platformLabel || "");

              return (
                <Fragment key={adName}>
                  <Tr
                    onClick={async () => {
                      const next = isOpen ? "" : adName;
                      setExpanded(next);
                      if (!detail && !isLoading && next) {
                        setLoading((current) => ({ ...current, [adName]: true }));
                        const params = new URLSearchParams(paramsBase);
                        params.set("adName", adName);
                        try {
                          const payload = await fetchAbcDetails(params.toString());
                          setDetails((current) => ({ ...current, [adName]: payload }));
                        } finally {
                          setLoading((current) => ({ ...current, [adName]: false }));
                        }
                      }
                    }}
                    _hover={{ bg: rowHover, cursor: "pointer" }}
                  >
                    <Td>{item.image ? <Image src={item.image} boxSize="40px" borderRadius="md" /> : "-"}</Td>
                    <Td>{adName}</Td>
                    <Td>
                      {platformMeta.logo ? (
                        <Image src={platformMeta.logo} boxSize="28px" borderRadius="full" alt={platformMeta.label} />
                      ) : (
                        platformMeta.label
                      )}
                    </Td>
                    <Td isNumeric>{formatNumber(item.quantity)}</Td>
                    <Td isNumeric>{formatCurrency(item.total)}</Td>
                    <Td>
                      <Badge
                        colorScheme={
                          item.classification === "A"
                            ? "green"
                            : item.classification === "B"
                              ? "yellow"
                              : "gray"
                        }
                      >
                        {item.classification}
                      </Badge>
                    </Td>
                  </Tr>
                  <Tr>
                    <Td colSpan={6} p={0} border="none">
                      <Collapse in={isOpen} animateOpacity>
                        <Box bg={expandedBg} p={4} borderBottomRadius="md">
                          {isLoading && (
                            <Flex align="center" gap={2} color="gray.500">
                              <Spinner size="sm" />
                              <Text fontSize="sm">Carregando detalhes...</Text>
                            </Flex>
                          )}
                          {!isLoading && detail && (
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                              <Box>
                                <Text fontWeight="semibold" mb={2}>
                                  Variações
                                </Text>
                                <Table size="sm">
                                  <Thead>
                                    <Tr>
                                      <Th>Imagem</Th>
                                      <Th>Variação</Th>
                                      <Th isNumeric>Quantidade</Th>
                                      <Th isNumeric>Faturamento</Th>
                                    </Tr>
                                  </Thead>
                                  <Tbody>
                                    {detail.variations.map((row) => (
                                      <Tr key={row.variation}>
                                        <Td>
                                          {row.image ? (
                                            <Image src={row.image} boxSize="32px" borderRadius="md" />
                                          ) : (
                                            "-"
                                          )}
                                        </Td>
                                        <Td>{row.variation}</Td>
                                        <Td isNumeric>{formatNumber(row.quantity)}</Td>
                                        <Td isNumeric>{formatCurrency(row.total)}</Td>
                                      </Tr>
                                    ))}
                                  </Tbody>
                                </Table>
                              </Box>
                              <Box>
                                <Text fontWeight="semibold" mb={2}>
                                  Totais por tamanho
                                </Text>
                                <Table size="sm">
                                  <Thead>
                                    <Tr>
                                      <Th>Tamanho</Th>
                                      <Th isNumeric>Quantidade</Th>
                                      <Th isNumeric>Faturamento</Th>
                                    </Tr>
                                  </Thead>
                                  <Tbody>
                                    {detail.sizes.map((row) => (
                                      <Tr key={row.size}>
                                        <Td>{row.size}</Td>
                                        <Td isNumeric>{formatNumber(row.quantity)}</Td>
                                        <Td isNumeric>{formatCurrency(row.total)}</Td>
                                      </Tr>
                                    ))}
                                  </Tbody>
                                </Table>
                              </Box>
                            </SimpleGrid>
                          )}
                        </Box>
                      </Collapse>
                    </Td>
                  </Tr>
                </Fragment>
              );
            })}
          </Tbody>
        </Table>
      </TableContainer>
      <HStack justify="flex-end" mt={4} spacing={2}>
        <Button size="sm" variant="outline" onClick={() => setPage(1)} isDisabled={page === 1}>
          Primeira
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} isDisabled={page === 1}>
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          isDisabled={page === totalPages}
        >
          Próxima
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPage(totalPages)} isDisabled={page === totalPages}>
          Última
        </Button>
      </HStack>
    </Box>
  );
};

export default AbcTable;
