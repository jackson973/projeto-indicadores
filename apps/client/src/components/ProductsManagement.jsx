import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Tag,
  Badge,
  VStack,
  Wrap,
  WrapItem,
  useColorModeValue,
  useToast,
  useBreakpointValue,
} from "@chakra-ui/react";
import { SearchIcon, CheckIcon, ChevronDownIcon, SmallCloseIcon } from "@chakra-ui/icons";
import {
  fetchProducts,
  fetchProductStores,
  updateProductKitQty,
} from "../api";

const ProductsManagement = () => {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [storesList, setStoresList] = useState([]);

  // filters
  const [filterNome, setFilterNome] = useState("");
  const [filterLojas, setFilterLojas] = useState([]);

  // inline edit state
  const [editingKey, setEditingKey] = useState(null);
  const [editKitQty, setEditKitQty] = useState(1);
  const [savingKit, setSavingKit] = useState(false);

  const toast = useToast();
  const panelBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const hoverBg = useColorModeValue("gray.50", "gray.700");
  const menuBg = useColorModeValue("white", "gray.800");
  const isMobile = useBreakpointValue({ base: true, md: false });
  const LIMIT = 50;

  const loadProducts = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const data = await fetchProducts({
        nome: filterNome || undefined,
        lojas: filterLojas.length > 0 ? filterLojas : undefined,
        page: pg,
        limit: LIMIT,
      });
      setProducts(data.rows || []);
      setTotal(data.total || 0);
      setPage(pg);
    } catch (err) {
      toast({ title: "Erro ao carregar produtos", description: err.message, status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [filterNome, filterLojas, toast]);

  useEffect(() => { loadProducts(1); }, [loadProducts]);

  useEffect(() => {
    fetchProductStores().then(setStoresList).catch(() => {});
  }, []);

  const toggleLoja = (lojaId) => {
    setFilterLojas((prev) =>
      prev.includes(lojaId) ? prev.filter((l) => l !== lojaId) : [...prev, lojaId]
    );
  };

  const getStoreName = (id) => {
    const s = storesList.find((st) => String(st.id) === String(id));
    return s ? s.name : id;
  };

  const startEditKit = (product) => {
    setEditingKey(product.store_variation_key);
    setEditKitQty(product.kit_qty || 1);
  };

  const saveKitQty = async (product) => {
    setSavingKit(true);
    try {
      await updateProductKitQty(product.store_variation_key, editKitQty, product.nome);
      setProducts((prev) =>
        prev.map((p) => (p.store_variation_key === product.store_variation_key ? { ...p, kit_qty: editKitQty } : p))
      );
      setEditingKey(null);
      toast({ title: "Qtd Kit atualizada", status: "success", duration: 2000 });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err.message, status: "error", duration: 3000 });
    } finally {
      setSavingKit(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <Box p={{ base: 3, md: 6 }} maxW="1400px" mx="auto">
      <VStack spacing={4} align="stretch">
        <Text fontSize="xl" fontWeight="bold">Gerenciamento de Produtos</Text>

        {/* Filters */}
        <Box bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
          <Flex gap={3} wrap="wrap" align="flex-end">
            <FormControl maxW="300px">
              <FormLabel fontSize="xs" mb={1}>Nome do Produto</FormLabel>
              <InputGroup size="sm">
                <InputLeftElement pointerEvents="none"><SearchIcon color="gray.400" boxSize={3} /></InputLeftElement>
                <Input placeholder="Buscar nome..." value={filterNome} onChange={(e) => setFilterNome(e.target.value)} />
              </InputGroup>
            </FormControl>

            <FormControl maxW="280px">
              <FormLabel fontSize="xs" mb={1}>Lojas</FormLabel>
              <Menu closeOnSelect={false}>
                <MenuButton as={Button} size="sm" variant="outline" rightIcon={<ChevronDownIcon />} fontWeight="normal" w="full" textAlign="left">
                  {filterLojas.length === 0
                    ? "Todas as lojas"
                    : `${filterLojas.length} loja${filterLojas.length > 1 ? "s" : ""}`}
                </MenuButton>
                <MenuList bg={menuBg} maxH="250px" overflowY="auto">
                  {storesList.map((s) => (
                    <MenuItem key={s.id} onClick={() => toggleLoja(String(s.id))} closeOnSelect={false}>
                      <Checkbox isChecked={filterLojas.includes(String(s.id))} pointerEvents="none" mr={2} size="sm" />
                      <Text fontSize="sm">{s.name}</Text>
                    </MenuItem>
                  ))}
                </MenuList>
              </Menu>
            </FormControl>

            <Button size="sm" colorScheme="blue" onClick={() => loadProducts(1)}>Filtrar</Button>
          </Flex>

          {filterLojas.length > 0 && (
            <Wrap mt={2} spacing={1}>
              {filterLojas.map((id) => (
                <WrapItem key={id}>
                  <Tag size="sm" colorScheme="blue" variant="subtle" cursor="pointer" onClick={() => toggleLoja(id)}>
                    {getStoreName(id)}
                    <SmallCloseIcon ml={1} />
                  </Tag>
                </WrapItem>
              ))}
              <WrapItem>
                <Tag size="sm" variant="outline" cursor="pointer" onClick={() => setFilterLojas([])}>Limpar</Tag>
              </WrapItem>
            </Wrap>
          )}
        </Box>

        {/* Summary */}
        <Text fontSize="sm" color="gray.500">
          {total} produto{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
        </Text>

        {/* Table */}
        {loading ? (
          <Flex justify="center" py={10}><Spinner size="lg" /></Flex>
        ) : products.length === 0 ? (
          <Box textAlign="center" py={10}>
            <Text color="gray.500">Nenhum produto encontrado.</Text>
          </Box>
        ) : isMobile ? (
          <VStack spacing={3} align="stretch">
            {products.map((p) => (
              <Box key={p.store_variation_key} bg={panelBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
                <Flex gap={3}>
                  {p.thumbnail && (
                    <Image src={p.thumbnail} alt="" boxSize="50px" borderRadius="md" objectFit="cover" flexShrink={0} />
                  )}
                  <Box flex={1} minW={0}>
                    <Text fontSize="sm" fontWeight="bold" noOfLines={2}>{p.nome}</Text>
                    {p.loja && (
                      <Tag size="sm" fontSize="10px" variant="subtle" mt={1}>{p.loja}</Tag>
                    )}
                    <Flex mt={2} align="center" gap={2}>
                      <Text fontSize="xs" fontWeight="medium">Qtd Kit:</Text>
                      {editingKey === p.store_variation_key ? (
                        <HStack spacing={1}>
                          <NumberInput size="xs" min={1} max={999} w="70px" value={editKitQty}
                            onChange={(_, val) => setEditKitQty(val || 1)}>
                            <NumberInputField />
                            <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                          </NumberInput>
                          <IconButton size="xs" icon={<CheckIcon />} colorScheme="green"
                            isLoading={savingKit} onClick={() => saveKitQty(p)} aria-label="Salvar" />
                        </HStack>
                      ) : (
                        <Badge colorScheme={p.kit_qty > 1 ? "purple" : "gray"} cursor="pointer" onClick={() => startEditKit(p)}>
                          {p.kit_qty || 1}
                        </Badge>
                      )}
                    </Flex>
                  </Box>
                </Flex>
              </Box>
            ))}
          </VStack>
        ) : (
          <Box bg={panelBg} borderRadius="md" borderWidth="1px" borderColor={borderColor} overflowX="auto">
            <Table size="sm" variant="simple">
              <Thead>
                <Tr>
                  <Th w="44px" p={1}></Th>
                  <Th>Nome do Produto</Th>
                  <Th w="160px">Loja</Th>
                  <Th textAlign="center" w="100px">Qtd Kit</Th>
                </Tr>
              </Thead>
              <Tbody>
                {products.map((p) => (
                  <Tr key={p.store_variation_key} _hover={{ bg: hoverBg }}>
                    <Td p={1}>
                      {p.thumbnail ? (
                        <Image src={p.thumbnail} alt="" boxSize="32px" borderRadius="4px" objectFit="contain" />
                      ) : (
                        <Box boxSize="32px" borderRadius="4px" bg="gray.100" />
                      )}
                    </Td>
                    <Td fontSize="sm" isTruncated title={p.nome}>{p.nome}</Td>
                    <Td>
                      {p.loja && <Tag size="sm" fontSize="10px" variant="subtle" colorScheme="blue">{p.loja}</Tag>}
                    </Td>
                    <Td textAlign="center">
                      {editingKey === p.store_variation_key ? (
                        <HStack spacing={1} justify="center">
                          <NumberInput size="xs" min={1} max={999} w="70px" value={editKitQty}
                            onChange={(_, val) => setEditKitQty(val || 1)}>
                            <NumberInputField textAlign="center" />
                            <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                          </NumberInput>
                          <IconButton size="xs" icon={<CheckIcon />} colorScheme="green"
                            isLoading={savingKit} onClick={() => saveKitQty(p)} aria-label="Salvar" />
                        </HStack>
                      ) : (
                        <Badge colorScheme={p.kit_qty > 1 ? "purple" : "gray"} cursor="pointer"
                          onClick={() => startEditKit(p)} px={3} py={1} fontSize="sm">
                          {p.kit_qty || 1}
                        </Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Flex justify="center" align="center" gap={3}>
            <Button size="sm" isDisabled={page <= 1} onClick={() => loadProducts(page - 1)}>Anterior</Button>
            <Text fontSize="sm" color="gray.500">Página {page} de {totalPages}</Text>
            <Button size="sm" isDisabled={page >= totalPages} onClick={() => loadProducts(page + 1)}>Próxima</Button>
          </Flex>
        )}
      </VStack>
    </Box>
  );
};

export default ProductsManagement;
