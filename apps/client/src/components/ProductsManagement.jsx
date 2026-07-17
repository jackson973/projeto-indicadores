import React, { useState, useEffect, useCallback } from "react";
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
  Select,
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
  useBreakpointValue,
} from "@chakra-ui/react";
import { SearchIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, SmallCloseIcon } from "@chakra-ui/icons";
import {
  fetchProducts,
  fetchProductStores,
  updateProductKitQty,
  fetchProductVariations,
  fetchStockProducts,
  updateProductStockLink,
} from "../api";
import useAppToast from "../hooks/useAppToast";

/**
 * Detecta se o nome do anúncio sugere kit com quantidades variáveis.
 * Ex: "Kit 3 a 15 peças", "Kit 2 ou 3 Blusa", "Kit com 3, 4 ou 5 Bermuda"
 */
const isVariableKit = (nome) => {
  if (!nome) return false;
  const n = nome.toLowerCase();
  // "kit X a Y" (Kit 3 a 15 peças)
  if (/kit\s+\d+\s+a\s+\d+/i.test(n)) return true;
  // "kit X ou Y" (Kit 2 ou 3)
  if (/kit\s+\d+\s+ou\s+\d+/i.test(n)) return true;
  // "kit com X, Y" ou "kit com X, Y ou Z" (Kit com 3, 4 ou 5)
  if (/kit\s+(com\s+)?\d+\s*,\s*\d+/i.test(n)) return true;
  return false;
};

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

  // vínculo com produto do estoque
  const [stockProducts, setStockProducts] = useState([]);
  const [savingLinkKey, setSavingLinkKey] = useState(null);

  // accordion / variations state
  const [expandedKey, setExpandedKey] = useState(null);
  const [variations, setVariations] = useState([]);
  const [loadingVariations, setLoadingVariations] = useState(false);
  const [editingVarPrefix, setEditingVarPrefix] = useState(null);
  const [editVarKitQty, setEditVarKitQty] = useState(1);
  const [savingVarKit, setSavingVarKit] = useState(false);

  const toast = useAppToast();
  const panelBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const hoverBg = useColorModeValue("gray.50", "gray.700");
  const menuBg = useColorModeValue("white", "gray.800");
  const varRowBg = useColorModeValue("gray.50", "gray.750");
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
      toast({  title: "Erro ao carregar produtos", description: err.message, status: "error", duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [filterNome, filterLojas, toast]);

  useEffect(() => { loadProducts(1); }, [loadProducts]);

  useEffect(() => {
    fetchProductStores().then(setStoresList).catch(() => {});
    fetchStockProducts().then(setStockProducts).catch(() => {});
  }, []);

  // Vínculo do anúncio com o produto do estoque (1 produto por anúncio)
  const saveStockLink = async (product, stockProductId) => {
    const idNum = stockProductId ? parseInt(stockProductId) : null;
    setSavingLinkKey(product.store_variation_key);
    try {
      await updateProductStockLink(product.store_variation_key, idNum, product.nome);
      const sp = stockProducts.find((s) => s.id === idNum);
      setProducts((prev) =>
        prev.map((p) => (p.store_variation_key === product.store_variation_key
          ? { ...p, stock_product_id: idNum, stock_codigo: sp?.codigo || null, stock_descricao: sp?.descricao || null }
          : p))
      );
      toast({ title: idNum ? "Produto vinculado ao anúncio" : "Vínculo removido", status: "success", duration: 2000 });
    } catch (err) {
      toast({ title: "Erro ao vincular", description: err.message, status: "error", duration: 3000 });
    } finally {
      setSavingLinkKey(null);
    }
  };

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
      toast({  title: "Qtd Kit atualizada", status: "success", duration: 2000 });
    } catch (err) {
      toast({  title: "Erro ao salvar", description: err.message, status: "error", duration: 3000 });
    } finally {
      setSavingKit(false);
    }
  };

  const toggleAccordion = async (product) => {
    const key = product.store_variation_key;
    if (expandedKey === key) {
      setExpandedKey(null);
      setVariations([]);
      return;
    }
    setExpandedKey(key);
    setLoadingVariations(true);
    setEditingVarPrefix(null);
    try {
      const storeKey = key.split("|||")[0];
      const adName = key.split("|||").slice(1).join("|||");
      const data = await fetchProductVariations(storeKey, adName);
      setVariations(data);
    } catch {
      setVariations([]);
    } finally {
      setLoadingVariations(false);
    }
  };

  const startEditVarKit = (prefix, currentKitQty) => {
    setEditingVarPrefix(prefix);
    setEditVarKitQty(currentKitQty || 1);
  };

  const saveVarKitQty = async (product, prefix) => {
    setSavingVarKit(true);
    try {
      const varKey = `${product.store_variation_key}|||${prefix}`;
      await updateProductKitQty(varKey, editVarKitQty, prefix);
      setVariations((prev) =>
        prev.map((v) => (v.prefix === prefix ? { ...v, kit_qty: editVarKitQty } : v))
      );
      setEditingVarPrefix(null);
      toast({  title: "Qtd Kit variação atualizada", status: "success", duration: 2000 });
    } catch (err) {
      toast({  title: "Erro ao salvar", description: err.message, status: "error", duration: 3000 });
    } finally {
      setSavingVarKit(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <Box p={{ base: 3, md: 6 }} maxW="1400px" mx="auto">
      <VStack spacing={4} align="stretch">
        <Text fontSize="xl" fontWeight="bold">Gerenciar Anúncios</Text>

        {/* Filters */}
        <Box bg={panelBg} p={4} borderRadius="md" borderWidth="1px" borderColor={borderColor}>
          <Flex gap={3} wrap="wrap" align="flex-end">
            <FormControl maxW="300px">
              <FormLabel fontSize="xs" mb={1}>Nome do Anúncio</FormLabel>
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
          {total} anúncio{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
        </Text>

        {/* Table */}
        {loading ? (
          <Flex justify="center" py={10}><Spinner size="lg" /></Flex>
        ) : products.length === 0 ? (
          <Box textAlign="center" py={10}>
            <Text color="gray.500">Nenhum anúncio encontrado.</Text>
          </Box>
        ) : isMobile ? (
          <VStack spacing={3} align="stretch">
            {products.map((p) => {
              const isExpanded = expandedKey === p.store_variation_key;
              const hasVariations = isExpanded && variations.length > 0;
              return (
                <Box key={p.store_variation_key} bg={panelBg} p={3} borderRadius="md" borderWidth="1px" borderColor={borderColor}
                  cursor="pointer" onClick={() => toggleAccordion(p)}>
                  <Flex gap={3}>
                    {p.thumbnail && (
                      <Image src={p.thumbnail} alt="" boxSize="50px" borderRadius="md" objectFit="cover" flexShrink={0} />
                    )}
                    <Box flex={1} minW={0}>
                      <Flex align="center" gap={1}>
                        <Box as="span" flexShrink={0} color="gray.400">
                          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        </Box>
                        <Text fontSize="sm" fontWeight="bold" noOfLines={2}>{p.nome}</Text>
                        {p.unconfigured_variations > 0 ? (
                          <Badge colorScheme="orange" fontSize="9px" ml={1} flexShrink={0} title={`${p.unconfigured_variations} variação(ões) sem kit configurado`}>
                            {p.unconfigured_variations} nova{p.unconfigured_variations > 1 ? "s" : ""}
                          </Badge>
                        ) : isVariableKit(p.nome) && p.kit_qty <= 1 && p.variation_configured === 0 ? (
                          <Badge colorScheme="yellow" fontSize="9px" ml={1} flexShrink={0} title="Nome sugere kit com quantidades variáveis — verifique o Qtd Kit">
                            Kit variável
                          </Badge>
                        ) : null}
                      </Flex>
                      {p.loja && (
                        <Tag size="sm" fontSize="10px" variant="subtle" mt={1}>{p.loja}</Tag>
                      )}
                      <Box mt={2} onClick={(e) => e.stopPropagation()}>
                        <Text fontSize="10px" color="gray.500" mb={0.5}>Produto do estoque</Text>
                        <Select
                          size="xs"
                          value={p.stock_product_id || ""}
                          onChange={(e) => saveStockLink(p, e.target.value)}
                          isDisabled={savingLinkKey === p.store_variation_key}
                          placeholder="— vincular produto —"
                          borderColor={p.stock_product_id ? "green.400" : undefined}
                        >
                          {stockProducts.map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.codigo} · {sp.descricao}</option>
                          ))}
                        </Select>
                      </Box>
                      {(!isExpanded || !hasVariations) && (
                        <Flex mt={2} align="center" gap={2} onClick={(e) => e.stopPropagation()}>
                          <Text fontSize="xs" fontWeight="medium">Qtd Kit:</Text>
                          {p.variation_total > 0 && p.variation_configured > 0 ? (
                            <Badge colorScheme="green" fontSize="xs" title={`${p.variation_configured} de ${p.variation_total} variações configuradas`}>
                              <CheckIcon boxSize={2} mr={1} />Var
                            </Badge>
                          ) : p.variation_total > 0 && p.variation_configured === 0 ? (
                            <Badge colorScheme="yellow" fontSize="xs" title={`${p.variation_total} variações sem kit configurado`}>
                              Var
                            </Badge>
                          ) : editingKey === p.store_variation_key ? (
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
                      )}
                    </Box>
                  </Flex>
                  {isExpanded && (
                    <Box mt={2} ml={8} onClick={(e) => e.stopPropagation()}>
                      {loadingVariations ? (
                        <Flex justify="center" py={2}><Spinner size="sm" /></Flex>
                      ) : hasVariations ? (
                        <VStack spacing={2} align="stretch">
                          {variations.map((v) => (
                            <Flex key={v.prefix} align="center" justify="space-between" py={1} px={2} bg={varRowBg} borderRadius="md">
                              <Text fontSize="xs" color="gray.600">
                                {v.prefix} <Text as="span" color="gray.400">({v.count})</Text>
                                {!v.configured && !variations.some((x) => x.configured) && <Badge colorScheme="orange" fontSize="8px" ml={1}>Novo</Badge>}
                              </Text>
                              {editingVarPrefix === v.prefix ? (
                                <HStack spacing={1}>
                                  <NumberInput size="xs" min={1} max={999} w="65px" value={editVarKitQty}
                                    onChange={(_, val) => setEditVarKitQty(val || 1)}>
                                    <NumberInputField textAlign="center" />
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                  </NumberInput>
                                  <IconButton size="xs" icon={<CheckIcon />} colorScheme="green"
                                    isLoading={savingVarKit} onClick={() => saveVarKitQty(p, v.prefix)} aria-label="Salvar" />
                                </HStack>
                              ) : (
                                <Badge colorScheme={v.kit_qty > 1 ? "purple" : "gray"} cursor="pointer"
                                  onClick={() => startEditVarKit(v.prefix, v.kit_qty)} fontSize="xs">
                                  {v.kit_qty || 1}
                                </Badge>
                              )}
                            </Flex>
                          ))}
                        </VStack>
                      ) : (
                        <Text fontSize="xs" color="gray.400" textAlign="center">Sem sub-variações</Text>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </VStack>
        ) : (
          <Box bg={panelBg} borderRadius="md" borderWidth="1px" borderColor={borderColor} overflowX="auto">
            <Table size="sm" variant="simple" sx={{ tableLayout: "fixed", width: "100%" }}>
              <Thead>
                <Tr>
                  <Th w="44px" p={1}></Th>
                  <Th>Anúncio</Th>
                  <Th w="130px">Loja</Th>
                  <Th w="230px">Produto do estoque</Th>
                  <Th textAlign="center" w="90px">Qtd Kit</Th>
                </Tr>
              </Thead>
              <Tbody>
                {products.map((p) => {
                  const isExpanded = expandedKey === p.store_variation_key;
                  const hasVariations = isExpanded && variations.length > 0;
                  return (
                    <React.Fragment key={p.store_variation_key}>
                      <Tr _hover={{ bg: hoverBg }} cursor="pointer" onClick={() => toggleAccordion(p)}>
                        <Td p={1}>
                          {p.thumbnail ? (
                            <Image src={p.thumbnail} alt="" boxSize="32px" borderRadius="4px" objectFit="contain" />
                          ) : (
                            <Box boxSize="32px" borderRadius="4px" bg="gray.100" />
                          )}
                        </Td>
                        <Td fontSize="sm" isTruncated title={p.nome}>
                          <Flex align="center" gap={1}>
                            <Box as="span" flexShrink={0} color="gray.400">
                              {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                            </Box>
                            {p.nome}
                            {p.unconfigured_variations > 0 ? (
                              <Badge colorScheme="orange" fontSize="9px" ml={1} flexShrink={0} title={`${p.unconfigured_variations} variação(ões) sem kit configurado`}>
                                {p.unconfigured_variations} nova{p.unconfigured_variations > 1 ? "s" : ""}
                              </Badge>
                            ) : isVariableKit(p.nome) && p.kit_qty <= 1 && p.variation_configured === 0 ? (
                              <Badge colorScheme="yellow" fontSize="9px" ml={1} flexShrink={0} title="Nome sugere kit com quantidades variáveis — verifique o Qtd Kit">
                                Kit variável
                              </Badge>
                            ) : null}
                          </Flex>
                        </Td>
                        <Td>
                          {p.loja && <Tag size="sm" fontSize="10px" variant="subtle" colorScheme="blue" maxW="100%" overflow="hidden" whiteSpace="nowrap" textOverflow="ellipsis" display="inline-block">{p.loja}</Tag>}
                        </Td>
                        <Td onClick={(e) => e.stopPropagation()}>
                          <Select
                            size="xs"
                            value={p.stock_product_id || ""}
                            onChange={(e) => saveStockLink(p, e.target.value)}
                            isDisabled={savingLinkKey === p.store_variation_key}
                            placeholder="— vincular produto —"
                            borderColor={p.stock_product_id ? "green.400" : undefined}
                            title={p.stock_product_id ? `${p.stock_codigo} · ${p.stock_descricao}` : "Vincular ao cadastro de produtos do estoque"}
                          >
                            {stockProducts.map((sp) => (
                              <option key={sp.id} value={sp.id}>{sp.codigo} · {sp.descricao}</option>
                            ))}
                          </Select>
                        </Td>
                        <Td textAlign="center" onClick={(e) => e.stopPropagation()}>
                          {(!isExpanded || !hasVariations) && (
                            p.variation_total > 0 && p.variation_configured > 0 ? (
                              <Badge colorScheme="green" px={3} py={1} fontSize="sm"
                                title={`${p.variation_configured} de ${p.variation_total} variações configuradas`}>
                                <CheckIcon boxSize={2.5} mr={1} />Var
                              </Badge>
                            ) : p.variation_total > 0 && p.variation_configured === 0 ? (
                              <Badge colorScheme="yellow" px={3} py={1} fontSize="sm"
                                title={`${p.variation_total} variações sem kit configurado`}>
                                Var
                              </Badge>
                            ) : editingKey === p.store_variation_key ? (
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
                            )
                          )}
                        </Td>
                      </Tr>
                      {isExpanded && (
                        loadingVariations ? (
                          <Tr><Td colSpan={5} textAlign="center" py={3}><Spinner size="sm" /></Td></Tr>
                        ) : hasVariations ? (
                          variations.map((v) => (
                            <Tr key={v.prefix} bg={varRowBg}>
                              <Td p={1} />
                              <Td fontSize="xs" pl={12} color="gray.600">
                                {v.prefix} <Text as="span" color="gray.400">({v.count} vendas)</Text>
                                {!v.configured && !variations.some((x) => x.configured) && <Badge colorScheme="orange" fontSize="8px" ml={1}>Novo</Badge>}
                              </Td>
                              <Td />
                              <Td />
                              <Td textAlign="center">
                                {editingVarPrefix === v.prefix ? (
                                  <HStack spacing={1} justify="center">
                                    <NumberInput size="xs" min={1} max={999} w="70px" value={editVarKitQty}
                                      onChange={(_, val) => setEditVarKitQty(val || 1)}>
                                      <NumberInputField textAlign="center" />
                                      <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                    </NumberInput>
                                    <IconButton size="xs" icon={<CheckIcon />} colorScheme="green"
                                      isLoading={savingVarKit} onClick={() => saveVarKitQty(p, v.prefix)} aria-label="Salvar" />
                                  </HStack>
                                ) : (
                                  <Badge colorScheme={v.kit_qty > 1 ? "purple" : "gray"} cursor="pointer"
                                    onClick={() => startEditVarKit(v.prefix, v.kit_qty)} px={3} py={1} fontSize="sm">
                                    {v.kit_qty || 1}
                                  </Badge>
                                )}
                              </Td>
                            </Tr>
                          ))
                        ) : (
                          <Tr><Td colSpan={5} textAlign="center" py={2}><Text fontSize="xs" color="gray.400">Sem sub-variações</Text></Td></Tr>
                        )
                      )}
                    </React.Fragment>
                  );
                })}
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
