import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Flex,
  Heading,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
  IconButton,
  Badge,
  Spinner,
  Center,
  Select,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Checkbox,
  useToast,
  useColorModeValue,
  useBreakpointValue,
  useDisclosure
} from "@chakra-ui/react";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  CheckIcon,
  CloseIcon,
  SearchIcon
} from "@chakra-ui/icons";
import SearchableSelect from "./SearchableSelect";
import {
  fetchTerceirosProductGroups,
  createTerceirosProductGroup,
  updateTerceirosProductGroup,
  deleteTerceirosProductGroup,
  fetchGroupProducts,
  addProductToGroup,
  removeProductFromGroup,
  addProductsToGroupBatch,
  removeProductsFromGroupBatch,
  fetchTerceirosProducts
} from "../api";

const TerceirosProductGroups = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupProducts, setGroupProducts] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  // Create modal
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const createModal = useDisclosure();

  // Product search (for adding)
  const [allProducts, setAllProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [loadingAllProducts, setLoadingAllProducts] = useState(false);
  const [addingProduct, setAddingProduct] = useState(null);
  const [batchAdding, setBatchAdding] = useState(false);

  // Filter for products already in the group
  const [groupFilter, setGroupFilter] = useState("");

  // Multi-select for group products
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [removingBatch, setRemovingBatch] = useState(false);

  // Multi-select for search results (batch add)
  const [selectedSearchResults, setSelectedSearchResults] = useState(new Set());

  // Ungrouped view
  const [showUngrouped, setShowUngrouped] = useState(false);
  const [ungroupedSearch, setUngroupedSearch] = useState("");
  const [assignTargetGroupId, setAssignTargetGroupId] = useState("");
  const [assigningProduct, setAssigningProduct] = useState(null);
  const [selectedUngrouped, setSelectedUngrouped] = useState(new Set());
  const [batchAssigning, setBatchAssigning] = useState(false);

  const toast = useToast();
  const isMobile = useBreakpointValue({ base: true, md: false });

  const cardBg = useColorModeValue("white", "gray.800");
  const headerBg = useColorModeValue("gray.50", "gray.700");
  const selectedBg = useColorModeValue("blue.50", "blue.900");
  const hoverBg = useColorModeValue("gray.50", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const searchResultBg = useColorModeValue("white", "gray.700");
  const searchResultHover = useColorModeValue("gray.100", "gray.600");

  // ── Load groups ──────────────────────────────────────────────────────────
  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const data = await fetchTerceirosProductGroups();
      setGroups(data);
    } catch (err) {
      toast({ title: "Erro ao carregar grupos.", status: "error", duration: 3000 });
    } finally {
      setLoadingGroups(false);
    }
  };

  // ── Load products for selected group ─────────────────────────────────────
  const loadGroupProducts = async (groupId) => {
    setLoadingProducts(true);
    try {
      const data = await fetchGroupProducts(groupId);
      setGroupProducts(data);
    } catch (err) {
      toast({ title: "Erro ao carregar produtos do grupo.", status: "error", duration: 3000 });
    } finally {
      setLoadingProducts(false);
    }
  };

  // ── Load all ERP products (for search) ───────────────────────────────────
  const loadAllProducts = async () => {
    setLoadingAllProducts(true);
    try {
      const data = await fetchTerceirosProducts();
      setAllProducts(data);
    } catch (err) {
      toast({ title: "Erro ao carregar produtos do ERP.", status: "error", duration: 3000 });
    } finally {
      setLoadingAllProducts(false);
    }
  };

  useEffect(() => {
    loadGroups();
    loadAllProducts();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      loadGroupProducts(selectedGroupId);
      setSelectedProducts(new Set());
      setGroupFilter("");
    } else {
      setGroupProducts([]);
    }
  }, [selectedGroupId]);

  // ── Set of product codes already in the selected group ───────────────────
  const groupProductCodes = useMemo(() => {
    return new Set(groupProducts.map((p) => p.productCode));
  }, [groupProducts]);

  // ── Filtered group products (search within group) ────────────────────────
  const filteredGroupProducts = useMemo(() => {
    if (!groupFilter.trim()) return groupProducts;
    const term = groupFilter.toLowerCase();
    return groupProducts.filter(
      (p) =>
        (p.productCode || "").toLowerCase().includes(term) ||
        (p.productName || "").toLowerCase().includes(term)
    );
  }, [groupProducts, groupFilter]);

  // ── Products not assigned to any group ────────────────────────────────────
  const ungroupedProducts = useMemo(() => {
    const term = ungroupedSearch.toLowerCase().trim();
    return allProducts.filter((p) => {
      if (p.groupName) return false;
      if (!term) return true;
      return (p.code || "").toLowerCase().includes(term) || (p.name || "").toLowerCase().includes(term);
    });
  }, [allProducts, ungroupedSearch]);

  // ── Assign ungrouped product to a group ───────────────────────────────────
  const handleAssignToGroup = async (product) => {
    if (!assignTargetGroupId) return;
    setAssigningProduct(product.code);
    try {
      await addProductToGroup(parseInt(assignTargetGroupId), product.code, product.name);
      await loadAllProducts();
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao adicionar produto.", status: "error", duration: 3000 });
    } finally {
      setAssigningProduct(null);
    }
  };

  // ── Batch assign ungrouped products ───────────────────────────────────────
  const handleBatchAssignUngrouped = async () => {
    if (!assignTargetGroupId || selectedUngrouped.size === 0) return;
    setBatchAssigning(true);
    try {
      const products = ungroupedProducts
        .filter((p) => selectedUngrouped.has(p.code))
        .map((p) => ({ code: p.code, name: p.name }));
      await addProductsToGroupBatch(parseInt(assignTargetGroupId), products);
      toast({ title: `${products.length} produto(s) adicionado(s) ao grupo.`, status: "success", duration: 3000 });
      setSelectedUngrouped(new Set());
      await loadAllProducts();
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao adicionar produtos.", status: "error", duration: 3000 });
    } finally {
      setBatchAssigning(false);
    }
  };

  // ── Filtered product search results ──────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const term = productSearch.toLowerCase();
    return allProducts
      .filter(
        (p) =>
          !groupProductCodes.has(p.code) &&
          ((p.code || "").toLowerCase().includes(term) ||
          (p.name || "").toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [productSearch, allProducts, groupProductCodes]);

  // ── Create group ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      await createTerceirosProductGroup(newGroupName.trim());
      setNewGroupName("");
      createModal.onClose();
      toast({ title: "Grupo criado com sucesso.", status: "success", duration: 3000 });
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao criar grupo.", status: "error", duration: 3000 });
    } finally {
      setCreating(false);
    }
  };

  // ── Update group ─────────────────────────────────────────────────────────
  const handleUpdate = async (id) => {
    if (!editingName.trim()) return;
    try {
      await updateTerceirosProductGroup(id, editingName.trim());
      setEditingId(null);
      toast({ title: "Grupo atualizado.", status: "success", duration: 3000 });
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao atualizar grupo.", status: "error", duration: 3000 });
    }
  };

  // ── Delete group ─────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await deleteTerceirosProductGroup(id);
      if (selectedGroupId === id) {
        setSelectedGroupId(null);
      }
      toast({ title: "Grupo excluido.", status: "success", duration: 3000 });
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir grupo. Verifique se nao esta em uso.", status: "error", duration: 4000 });
    }
  };

  // ── Add single product to group ─────────────────────────────────────────
  const handleAddProduct = async (product) => {
    if (!selectedGroupId) return;
    setAddingProduct(product.code);
    try {
      await addProductToGroup(selectedGroupId, product.code, product.name);
      await loadGroupProducts(selectedGroupId);
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao adicionar produto.", status: "error", duration: 3000 });
    } finally {
      setAddingProduct(null);
    }
  };

  // ── Batch add products to group ──────────────────────────────────────────
  const handleBatchAdd = async () => {
    if (!selectedGroupId || selectedSearchResults.size === 0) return;
    setBatchAdding(true);
    try {
      const products = filteredProducts
        .filter((p) => selectedSearchResults.has(p.code))
        .map((p) => ({ code: p.code, name: p.name }));
      await addProductsToGroupBatch(selectedGroupId, products);
      toast({ title: `${products.length} produto(s) adicionado(s).`, status: "success", duration: 3000 });
      setSelectedSearchResults(new Set());
      setProductSearch("");
      await loadGroupProducts(selectedGroupId);
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao adicionar produtos.", status: "error", duration: 3000 });
    } finally {
      setBatchAdding(false);
    }
  };

  // ── Remove single product from group ────────────────────────────────────
  const handleRemoveProduct = async (productCode) => {
    if (!selectedGroupId) return;
    try {
      await removeProductFromGroup(selectedGroupId, productCode);
      toast({ title: "Produto removido do grupo.", status: "success", duration: 3000 });
      await loadGroupProducts(selectedGroupId);
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao remover produto.", status: "error", duration: 3000 });
    }
  };

  // ── Batch remove products from group ────────────────────────────────────
  const handleBatchRemove = async () => {
    if (!selectedGroupId || selectedProducts.size === 0) return;
    setRemovingBatch(true);
    try {
      const codes = Array.from(selectedProducts);
      await removeProductsFromGroupBatch(selectedGroupId, codes);
      toast({ title: `${codes.length} produto(s) removido(s).`, status: "success", duration: 3000 });
      setSelectedProducts(new Set());
      await loadGroupProducts(selectedGroupId);
      await loadGroups();
    } catch (err) {
      toast({ title: err.message || "Erro ao remover produtos.", status: "error", duration: 3000 });
    } finally {
      setRemovingBatch(false);
    }
  };

  // ── Toggle helpers ──────────────────────────────────────────────────────
  const toggleProduct = (code, set, setter) => {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setter(next);
  };

  const toggleAllFiltered = useCallback(() => {
    if (selectedProducts.size === filteredGroupProducts.length && filteredGroupProducts.length > 0) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredGroupProducts.map((p) => p.productCode)));
    }
  }, [filteredGroupProducts, selectedProducts]);

  const toggleAllSearch = useCallback(() => {
    if (selectedSearchResults.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedSearchResults(new Set());
    } else {
      setSelectedSearchResults(new Set(filteredProducts.map((p) => p.code)));
    }
  }, [filteredProducts, selectedSearchResults]);

  const toggleAllUngrouped = useCallback(() => {
    if (selectedUngrouped.size === ungroupedProducts.length && ungroupedProducts.length > 0) {
      setSelectedUngrouped(new Set());
    } else {
      setSelectedUngrouped(new Set(ungroupedProducts.map((p) => p.code)));
    }
  }, [ungroupedProducts, selectedUngrouped]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box>
      <Flex
        direction={isMobile ? "column" : "row"}
        gap={4}
        align="flex-start"
      >
        {/* ── Left: Groups ──────────────────────────────────────────────── */}
        <Box
          bg={cardBg}
          borderRadius="lg"
          boxShadow="sm"
          border="1px solid"
          borderColor={borderColor}
          w={isMobile ? "100%" : "340px"}
          flexShrink={0}
        >
          <Flex justify="space-between" align="center" p={4} borderBottomWidth="1px" borderColor={borderColor}>
            <Heading size="sm">Grupos de Produtos</Heading>
            <Button
              leftIcon={<AddIcon />}
              size="xs"
              colorScheme="blue"
              onClick={createModal.onOpen}
            >
              Novo Grupo
            </Button>
          </Flex>

          {loadingGroups ? (
            <Center p={8}><Spinner /></Center>
          ) : (
            <VStack spacing={0} align="stretch">
              {/* Sem grupo */}
              <Flex
                align="center"
                px={4}
                py={2.5}
                cursor="pointer"
                bg={showUngrouped ? selectedBg : undefined}
                _hover={{ bg: showUngrouped ? selectedBg : hoverBg }}
                borderBottomWidth="1px"
                borderColor={borderColor}
                onClick={() => {
                  setShowUngrouped(true);
                  setSelectedGroupId(null);
                  setUngroupedSearch("");
                  setAssignTargetGroupId("");
                  setSelectedUngrouped(new Set());
                }}
              >
                <Text
                  fontSize="sm"
                  fontWeight={showUngrouped ? "semibold" : "normal"}
                  flex={1}
                  color={ungroupedProducts.length > 0 ? "orange.500" : "gray.400"}
                >
                  Sem grupo
                </Text>
                <Badge
                  colorScheme={ungroupedProducts.length > 0 ? "orange" : "gray"}
                  fontSize="xs"
                  ml={2}
                >
                  {loadingAllProducts ? "..." : ungroupedProducts.length}
                </Badge>
              </Flex>

              {groups.map((group) => (
                <Flex
                  key={group.id}
                  align="center"
                  px={4}
                  py={2.5}
                  cursor="pointer"
                  bg={selectedGroupId === group.id ? selectedBg : undefined}
                  _hover={{ bg: selectedGroupId === group.id ? selectedBg : hoverBg }}
                  borderBottomWidth="1px"
                  borderColor={borderColor}
                  onClick={() => {
                    if (editingId !== group.id) {
                      setSelectedGroupId(group.id);
                      setShowUngrouped(false);
                    }
                  }}
                >
                  <Box flex={1} minW={0}>
                    {editingId === group.id ? (
                      <Input
                        size="sm"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdate(group.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <Text
                        fontSize="sm"
                        fontWeight={selectedGroupId === group.id ? "semibold" : "normal"}
                        isTruncated
                      >
                        {group.name}
                      </Text>
                    )}
                  </Box>

                  <Badge colorScheme="blue" fontSize="xs" ml={2} flexShrink={0}>
                    {group.productCount ?? 0}
                  </Badge>

                  <HStack spacing={0} ml={2} flexShrink={0} onClick={(e) => e.stopPropagation()}>
                    {editingId === group.id ? (
                      <>
                        <IconButton
                          icon={<CheckIcon />}
                          size="xs"
                          variant="ghost"
                          colorScheme="green"
                          aria-label="Confirmar"
                          onClick={() => handleUpdate(group.id)}
                        />
                        <IconButton
                          icon={<CloseIcon />}
                          size="xs"
                          variant="ghost"
                          aria-label="Cancelar"
                          onClick={() => setEditingId(null)}
                        />
                      </>
                    ) : (
                      <>
                        <IconButton
                          icon={<EditIcon />}
                          size="xs"
                          variant="ghost"
                          aria-label="Editar"
                          onClick={() => {
                            setEditingId(group.id);
                            setEditingName(group.name);
                          }}
                        />
                        <IconButton
                          icon={<DeleteIcon />}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          aria-label="Excluir"
                          onClick={() => handleDelete(group.id)}
                        />
                      </>
                    )}
                  </HStack>
                </Flex>
              ))}
            </VStack>
          )}
        </Box>

        {/* ── Right: Products ───────────────────────────────────────────── */}
        <Box
          bg={cardBg}
          borderRadius="lg"
          boxShadow="sm"
          border="1px solid"
          borderColor={borderColor}
          flex={1}
          w={isMobile ? "100%" : undefined}
          minW={0}
        >
          <Flex justify="space-between" align="center" p={4} borderBottomWidth="1px" borderColor={borderColor}>
            <Heading size="sm" isTruncated>
              {showUngrouped ? "Produtos sem grupo" : selectedGroup ? `Produtos — ${selectedGroup.name}` : "Produtos"}
            </Heading>
            {showUngrouped ? (
              <Badge colorScheme="orange" fontSize="xs" ml={2} flexShrink={0}>
                {ungroupedProducts.length} produto{ungroupedProducts.length !== 1 ? "s" : ""}
              </Badge>
            ) : selectedGroup ? (
              <Badge colorScheme="blue" fontSize="xs" ml={2} flexShrink={0}>
                {groupProducts.length} produto{groupProducts.length !== 1 ? "s" : ""}
              </Badge>
            ) : null}
          </Flex>

          {showUngrouped ? (
            <Box p={4}>
              {/* Search */}
              <InputGroup size="sm" mb={3}>
                <InputLeftElement pointerEvents="none">
                  <SearchIcon color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="Filtrar por codigo ou nome..."
                  value={ungroupedSearch}
                  onChange={(e) => { setUngroupedSearch(e.target.value); setSelectedUngrouped(new Set()); }}
                />
              </InputGroup>

              {/* Group selector for batch assignment */}
              <Box mb={3}>
                <SearchableSelect
                  size="sm"
                  placeholder="Selecionar grupo para atribuir"
                  value={assignTargetGroupId}
                  onChange={(val) => setAssignTargetGroupId(val)}
                  options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
                />
              </Box>

              {/* Batch actions bar */}
              {ungroupedProducts.length > 0 && (
                <Flex align="center" gap={2} mb={3}>
                  <Checkbox
                    size="sm"
                    isChecked={selectedUngrouped.size === ungroupedProducts.length && ungroupedProducts.length > 0}
                    isIndeterminate={selectedUngrouped.size > 0 && selectedUngrouped.size < ungroupedProducts.length}
                    onChange={toggleAllUngrouped}
                  >
                    <Text fontSize="xs">Selecionar todos ({ungroupedProducts.length})</Text>
                  </Checkbox>
                  {selectedUngrouped.size > 0 && assignTargetGroupId && (
                    <Button
                      size="xs"
                      colorScheme="blue"
                      leftIcon={<AddIcon />}
                      onClick={handleBatchAssignUngrouped}
                      isLoading={batchAssigning}
                    >
                      Adicionar {selectedUngrouped.size} ao grupo
                    </Button>
                  )}
                </Flex>
              )}

              {loadingAllProducts ? (
                <Center p={6}><Spinner /></Center>
              ) : ungroupedProducts.length === 0 ? (
                <Center p={6}>
                  <Text fontSize="sm" color="gray.500">
                    {ungroupedSearch ? "Nenhum produto encontrado." : "Todos os produtos ja estao em algum grupo."}
                  </Text>
                </Center>
              ) : (
                <VStack spacing={0} align="stretch" maxH="500px" overflowY="auto">
                  {ungroupedProducts.map((p) => (
                    <Flex
                      key={p.code}
                      align="center"
                      px={3}
                      py={2}
                      borderBottomWidth="1px"
                      borderColor={borderColor}
                      _last={{ borderBottomWidth: 0 }}
                      _hover={{ bg: hoverBg }}
                    >
                      <Checkbox
                        size="sm"
                        mr={2}
                        isChecked={selectedUngrouped.has(p.code)}
                        onChange={() => toggleProduct(p.code, selectedUngrouped, setSelectedUngrouped)}
                      />
                      <Text fontSize="xs" fontWeight="bold" color="gray.500" w="55px" flexShrink={0}>
                        {p.code}
                      </Text>
                      <Text fontSize="sm" flex={1} minW={0} isTruncated>
                        {p.name}
                      </Text>
                      <IconButton
                        icon={assigningProduct === p.code ? <Spinner size="xs" /> : <AddIcon />}
                        size="xs"
                        colorScheme="blue"
                        variant="ghost"
                        aria-label="Adicionar ao grupo"
                        ml={2}
                        flexShrink={0}
                        isDisabled={!assignTargetGroupId || assigningProduct === p.code}
                        onClick={() => handleAssignToGroup(p)}
                      />
                    </Flex>
                  ))}
                </VStack>
              )}
            </Box>
          ) : !selectedGroupId ? (
            <Center p={10}>
              <Text fontSize="sm" color="gray.500">Selecione um grupo para gerenciar os produtos.</Text>
            </Center>
          ) : (
            <Box p={4}>
              {/* Search / add product */}
              <Box position="relative" mb={4}>
                <InputGroup size="sm">
                  <InputLeftElement pointerEvents="none">
                    <SearchIcon color="gray.400" />
                  </InputLeftElement>
                  <Input
                    placeholder="Buscar produto por codigo ou nome para adicionar..."
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setSelectedSearchResults(new Set()); }}
                  />
                </InputGroup>

                {filteredProducts.length > 0 && (
                  <Box
                    position="absolute"
                    top="100%"
                    left={0}
                    right={0}
                    zIndex={10}
                    bg={searchResultBg}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="md"
                    maxH="350px"
                    overflowY="auto"
                    boxShadow="lg"
                    mt={1}
                  >
                    {/* Batch add bar */}
                    <Flex
                      align="center"
                      gap={2}
                      px={3}
                      py={2}
                      bg={headerBg}
                      borderBottomWidth="1px"
                      borderColor={borderColor}
                      position="sticky"
                      top={0}
                      zIndex={1}
                    >
                      <Checkbox
                        size="sm"
                        isChecked={selectedSearchResults.size === filteredProducts.length && filteredProducts.length > 0}
                        isIndeterminate={selectedSearchResults.size > 0 && selectedSearchResults.size < filteredProducts.length}
                        onChange={toggleAllSearch}
                      >
                        <Text fontSize="xs">Todos ({filteredProducts.length})</Text>
                      </Checkbox>
                      {selectedSearchResults.size > 0 && (
                        <Button
                          size="xs"
                          colorScheme="blue"
                          leftIcon={<AddIcon />}
                          onClick={handleBatchAdd}
                          isLoading={batchAdding}
                        >
                          Adicionar {selectedSearchResults.size}
                        </Button>
                      )}
                    </Flex>

                    {filteredProducts.map((product) => (
                      <Flex
                        key={product.code}
                        align="center"
                        px={3}
                        py={2}
                        _hover={{ bg: searchResultHover }}
                        borderBottomWidth="1px"
                        borderColor={borderColor}
                        _last={{ borderBottomWidth: 0 }}
                      >
                        <Checkbox
                          size="sm"
                          mr={2}
                          isChecked={selectedSearchResults.has(product.code)}
                          onChange={() => toggleProduct(product.code, selectedSearchResults, setSelectedSearchResults)}
                        />
                        <Text fontSize="xs" fontWeight="bold" color="gray.500" w="55px" flexShrink={0}>
                          {product.code}
                        </Text>
                        <Text fontSize="sm" flex={1} minW={0} isTruncated>
                          {product.name}
                        </Text>
                        {product.groupName && (
                          <Badge colorScheme="orange" fontSize="2xs" ml={2} flexShrink={0}>
                            {product.groupName}
                          </Badge>
                        )}
                        <Box ml={2} flexShrink={0}>
                          {addingProduct === product.code ? (
                            <Spinner size="xs" />
                          ) : (
                            <IconButton
                              icon={<AddIcon />}
                              size="xs"
                              variant="ghost"
                              colorScheme="blue"
                              aria-label="Adicionar"
                              onClick={() => handleAddProduct(product)}
                            />
                          )}
                        </Box>
                      </Flex>
                    ))}
                  </Box>
                )}
              </Box>

              {/* Filter within group products */}
              <InputGroup size="sm" mb={3}>
                <InputLeftElement pointerEvents="none">
                  <SearchIcon color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="Pesquisar nos produtos do grupo..."
                  value={groupFilter}
                  onChange={(e) => { setGroupFilter(e.target.value); setSelectedProducts(new Set()); }}
                />
              </InputGroup>

              {/* Batch actions bar */}
              {filteredGroupProducts.length > 0 && (
                <Flex align="center" gap={2} mb={3}>
                  <Checkbox
                    size="sm"
                    isChecked={selectedProducts.size === filteredGroupProducts.length && filteredGroupProducts.length > 0}
                    isIndeterminate={selectedProducts.size > 0 && selectedProducts.size < filteredGroupProducts.length}
                    onChange={toggleAllFiltered}
                  >
                    <Text fontSize="xs">Selecionar todos ({filteredGroupProducts.length})</Text>
                  </Checkbox>
                  {selectedProducts.size > 0 && (
                    <Button
                      size="xs"
                      colorScheme="red"
                      leftIcon={<DeleteIcon />}
                      onClick={handleBatchRemove}
                      isLoading={removingBatch}
                    >
                      Remover {selectedProducts.size}
                    </Button>
                  )}
                </Flex>
              )}

              {/* Products list */}
              {loadingProducts ? (
                <Center p={6}><Spinner /></Center>
              ) : groupProducts.length === 0 ? (
                <Center p={6}>
                  <Text fontSize="sm" color="gray.500">Nenhum produto neste grupo. Use a busca acima para adicionar.</Text>
                </Center>
              ) : filteredGroupProducts.length === 0 ? (
                <Center p={6}>
                  <Text fontSize="sm" color="gray.500">Nenhum produto encontrado com esse filtro.</Text>
                </Center>
              ) : (
                <VStack spacing={0} align="stretch" maxH="500px" overflowY="auto">
                  {filteredGroupProducts.map((p) => (
                    <Flex
                      key={p.productCode}
                      align="center"
                      px={3}
                      py={2}
                      borderBottomWidth="1px"
                      borderColor={borderColor}
                      _last={{ borderBottomWidth: 0 }}
                      _hover={{ bg: hoverBg }}
                    >
                      <Checkbox
                        size="sm"
                        mr={2}
                        isChecked={selectedProducts.has(p.productCode)}
                        onChange={() => toggleProduct(p.productCode, selectedProducts, setSelectedProducts)}
                      />
                      <Text fontSize="xs" fontWeight="bold" color="gray.500" w="55px" flexShrink={0}>
                        {p.productCode}
                      </Text>
                      <Text fontSize="sm" flex={1} minW={0} isTruncated>
                        {p.productName}
                      </Text>
                      <IconButton
                        icon={<CloseIcon />}
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        aria-label="Remover produto"
                        ml={2}
                        flexShrink={0}
                        onClick={() => handleRemoveProduct(p.productCode)}
                      />
                    </Flex>
                  ))}
                </VStack>
              )}
            </Box>
          )}
        </Box>
      </Flex>

      {/* ── Create Group Modal ──────────────────────────────────────────── */}
      <Modal isOpen={createModal.isOpen} onClose={createModal.onClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Novo Grupo de Produtos</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Input
              placeholder="Nome do grupo..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={createModal.onClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleCreate}
              isLoading={creating}
            >
              Criar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default TerceirosProductGroups;
