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
  Tooltip,
  Tr,
  Text,
  VStack,
  useBreakpointValue,
  useColorModeValue
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon, StarIcon } from "@chakra-ui/icons";
import { formatCurrency, formatNumber } from "../utils/format";
import { getPlatformMeta } from "../utils/platforms";
import { fetchAbcDetails } from "../api";

const PAGE_SIZE = 8;

const classColor = (c) =>
  c === "A" ? "green" : c === "B" ? "yellow" : "gray";

const AbcTable = ({ data, filters }) => {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState("");
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState({});
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageItems = data.slice(startIndex, startIndex + PAGE_SIZE);
  const isMobile = useBreakpointValue({ base: true, md: false });

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
  const cardBorder = useColorModeValue("gray.200", "gray.600");

  const toggleItem = async (item) => {
    const adName = item.adName || item.product;
    const itemKey = item.store ? `${adName}|||${item.store}` : adName;
    const isOpen = expanded === itemKey;
    const next = isOpen ? "" : itemKey;
    setExpanded(next);
    if (!details[itemKey] && !loading[itemKey] && next) {
      setLoading((current) => ({ ...current, [itemKey]: true }));
      const params = new URLSearchParams(paramsBase);
      params.set("adName", adName);
      if (item.store) params.set("store", item.store);
      try {
        const payload = await fetchAbcDetails(params.toString());
        setDetails((current) => ({ ...current, [itemKey]: payload }));
      } finally {
        setLoading((current) => ({ ...current, [itemKey]: false }));
      }
    }
  };

  const renderExpandedDetails = (adName) => {
    const detail = details[adName];
    const isLoading = loading[adName];

    if (isLoading) {
      return (
        <Flex align="center" gap={2} color="gray.500" p={3}>
          <Spinner size="sm" />
          <Text fontSize="sm">Carregando detalhes...</Text>
        </Flex>
      );
    }

    if (!detail) return null;

    if (isMobile) {
      return (
        <VStack align="stretch" spacing={3} p={3}>
          {detail.variations.length > 0 && (
            <Box>
              <Text fontWeight="semibold" fontSize="xs" mb={2} color={mutedText}>
                Variações
              </Text>
              <VStack align="stretch" spacing={2}>
                {detail.variations.map((row) => (
                  <Flex key={row.variation} align="center" gap={2} fontSize="xs">
                    {row.image ? (
                      <Image src={row.image} boxSize="28px" borderRadius="md" flexShrink={0} />
                    ) : (
                      <Box boxSize="28px" flexShrink={0} />
                    )}
                    <Text flex={1} noOfLines={1}>{row.variation}</Text>
                    <Text flexShrink={0} fontWeight="medium">{formatNumber(row.quantity)}</Text>
                    <Text flexShrink={0} fontWeight="medium">{formatCurrency(row.total)}</Text>
                  </Flex>
                ))}
              </VStack>
            </Box>
          )}
          {detail.sizes.length > 0 && (
            <Box>
              <Text fontWeight="semibold" fontSize="xs" mb={2} color={mutedText}>
                Totais por tamanho
              </Text>
              <VStack align="stretch" spacing={1}>
                {detail.sizes.map((row) => (
                  <Flex key={row.size} justify="space-between" fontSize="xs">
                    <Text fontWeight="medium">{row.size}</Text>
                    <HStack spacing={3}>
                      <Text>{formatNumber(row.quantity)}</Text>
                      <Text>{formatCurrency(row.total)}</Text>
                    </HStack>
                  </Flex>
                ))}
              </VStack>
            </Box>
          )}
        </VStack>
      );
    }

    return (
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
        <Box>
          <Text fontWeight="semibold" mb={2}>Variações</Text>
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
          <Text fontWeight="semibold" mb={2}>Totais por tamanho</Text>
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
    );
  };

  const renderMobileCards = () => (
    <VStack align="stretch" spacing={3}>
      {pageItems.map((item) => {
        const adName = item.adName || item.product;
        const itemKey = item.store ? `${adName}|||${item.store}` : adName;
        const isOpen = expanded === itemKey;
        const platformMeta = getPlatformMeta(item.platformLabel || "");

        return (
          <Box
            key={itemKey}
            borderWidth="1px"
            borderColor={isOpen ? "blue.400" : cardBorder}
            borderRadius="lg"
            overflow="hidden"
            transition="border-color 0.2s"
          >
            <Box
              p={3}
              onClick={() => toggleItem(item)}
              cursor="pointer"
              _active={{ bg: rowHover }}
            >
              {/* Row 1: Image + Name + Badge */}
              <Flex align="center" gap={2} mb={2}>
                {item.image ? (
                  <Image src={item.image} boxSize="36px" borderRadius="md" flexShrink={0} />
                ) : (
                  <Box boxSize="36px" borderRadius="md" bg="gray.100" flexShrink={0} />
                )}
                <Tooltip label={adName} placement="top" openDelay={300}>
                  <Text fontSize="sm" fontWeight="medium" flex={1} noOfLines={1}>
                    {adName}
                  </Text>
                </Tooltip>
                <Badge colorScheme={classColor(item.classification)} flexShrink={0}>
                  {item.classification}
                </Badge>
                <Box flexShrink={0} color={mutedText} fontSize="xs">
                  {isOpen ? <ChevronUpIcon boxSize={4} /> : <ChevronDownIcon boxSize={4} />}
                </Box>
              </Flex>

              {/* Row 2: Store + Platform */}
              <Flex align="center" gap={1} ml="44px" mb={1}>
                <Text fontSize="xs" color={mutedText}>{item.store || "Todas"}</Text>
                <Text fontSize="xs" color={mutedText}>·</Text>
                {platformMeta.logo ? (
                  <Image src={platformMeta.logo} boxSize="16px" borderRadius="full" />
                ) : null}
                <Text fontSize="xs" color={mutedText}>
                  {platformMeta.label}
                </Text>
              </Flex>

              {/* Row 3: Quantity + Revenue */}
              <Flex ml="44px" gap={4} fontSize="xs">
                <Text>
                  <Text as="span" color={mutedText}>Qtd: </Text>
                  <Text as="span" fontWeight="semibold">{formatNumber(item.quantity)}</Text>
                </Text>
                <Text>
                  <Text as="span" color={mutedText}>Fat: </Text>
                  <Text as="span" fontWeight="semibold">{formatCurrency(item.total)}</Text>
                </Text>
              </Flex>
            </Box>

            {/* Expanded details */}
            <Collapse in={isOpen} animateOpacity>
              <Box bg={expandedBg} borderTop="1px solid" borderColor={cardBorder}>
                {renderExpandedDetails(itemKey)}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </VStack>
  );

  const renderDesktopTable = () => (
    <TableContainer>
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>Imagem</Th>
            <Th>Nome do anúncio</Th>
            <Th>Loja</Th>
            <Th>Plataforma</Th>
            <Th isNumeric>Quantidade vendida</Th>
            <Th isNumeric>Faturamento</Th>
            <Th>Classe</Th>
          </Tr>
        </Thead>
        <Tbody>
          {pageItems.map((item) => {
            const adName = item.adName || item.product;
            const itemKey = item.store ? `${adName}|||${item.store}` : adName;
            const isOpen = expanded === itemKey;
            const platformMeta = getPlatformMeta(item.platformLabel || "");

            return (
              <Fragment key={itemKey}>
                <Tr
                  onClick={() => toggleItem(item)}
                  _hover={{ bg: rowHover, cursor: "pointer" }}
                >
                  <Td>{item.image ? <Image src={item.image} boxSize="40px" borderRadius="md" /> : "-"}</Td>
                  <Td>{adName}</Td>
                  <Td>{item.store || "Todas"}</Td>
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
                    <Badge colorScheme={classColor(item.classification)}>
                      {item.classification}
                    </Badge>
                  </Td>
                </Tr>
                <Tr>
                  <Td colSpan={7} p={0} border="none">
                    <Collapse in={isOpen} animateOpacity>
                      <Box bg={expandedBg} p={4} borderBottomRadius="md">
                        {renderExpandedDetails(itemKey)}
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
  );

  return (
    <Box className="panel" bg={panelBg} p={{ base: 3, md: 6 }} borderRadius="lg" boxShadow="sm">
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize={{ base: "md", md: "lg" }} fontWeight="bold">
          <HStack spacing={2}>
            <StarIcon color="blue.500" />
            <span>Curva ABC de anúncios</span>
          </HStack>
        </Text>
        <Text fontSize="sm" color={mutedText}>
          {page}/{totalPages}
        </Text>
      </Flex>

      {isMobile ? renderMobileCards() : renderDesktopTable()}

      {/* Pagination */}
      {isMobile ? (
        <Flex mt={4} gap={2} align="center">
          <Button
            size="sm"
            variant="outline"
            flex={1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            isDisabled={page === 1}
          >
            Anterior
          </Button>
          <Text fontSize="sm" color={mutedText} flexShrink={0} px={2}>
            {page}/{totalPages}
          </Text>
          <Button
            size="sm"
            variant="outline"
            flex={1}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            isDisabled={page === totalPages}
          >
            Próxima
          </Button>
        </Flex>
      ) : (
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
      )}
    </Box>
  );
};

export default AbcTable;
