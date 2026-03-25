import { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Spinner,
  Tag,
  TagLabel,
  Text,
  useColorModeValue,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, EditIcon, SearchIcon } from "@chakra-ui/icons";
import {
  fetchOrderCatalog,
  createOrderCatalogProduct,
  updateOrderCatalogProduct,
  deleteOrderCatalogProduct,
  uploadOrderProductPhoto,
  fetchSisplanProductsForOrders,
  fetchCatalogBarcodes,
  addCatalogBarcodes,
  removeCatalogBarcode,
  fetchProductGroups,
  associateBarcodesByGroup,
} from "../api";
import BarcodeScanner from "./BarcodeScanner";

const SIZE_ORDER = ["RN", "PP", "P", "M", "G", "GG", "XG", "XGG", "EG", "EGG"];

function sortSize(s) {
  const upper = String(s).toUpperCase().trim();
  const idx = SIZE_ORDER.indexOf(upper);
  if (idx !== -1) return idx;
  const num = parseFloat(upper);
  if (!isNaN(num)) return 100 + num; // numeric sizes after letter sizes
  return 200; // unknown at end
}

const emptyProduct = { name: "", price_pc: "", price_mn: "", photo_url: null, reference_codigo: "", sizes: [] };

export default function OrderProductsConfig() {
  const [products, setProducts]         = useState([]);
  const [sisplanProducts, setSisplanProducts] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [editing, setEditing]           = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(null);
  const [refSearch, setRefSearch]       = useState("");
  const [refOpen, setRefOpen]           = useState(false);
  const refBoxRef                       = useRef();
  const [barcodes, setBarcodes]         = useState([]);
  const [barcodesLoading, setBarcodesLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [lastScanned, setLastScanned]   = useState(null);
  const [groups, setGroups]             = useState([]);
  const [groupSelectOpen, setGroupSelectOpen] = useState(false);
  const [associating, setAssociating]   = useState(false);

  const { isOpen, onOpen, onClose }                     = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const fileRef = useRef();
  const toast   = useToast();

  const panelBg     = useColorModeValue("white", "gray.800");
  const cardBg      = useColorModeValue("white", "gray.750");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const mutedColor  = useColorModeValue("gray.500", "gray.400");
  const photoBg     = useColorModeValue("gray.100", "gray.700");

  useEffect(() => {
    Promise.all([fetchOrderCatalog(), fetchSisplanProductsForOrders(), fetchProductGroups()])
      .then(([catalog, sp, grp]) => {
        setProducts(catalog);
        setSisplanProducts(sp);
        setGroups(grp);
      })
      .catch(err => toast({ status: "error", description: err.message, duration: 3000 }))
      .finally(() => setLoading(false));
  }, []);

  // Unique reference products grouped by codigo
  const referenceProducts = useMemo(() => {
    const seen = new Set();
    return sisplanProducts.filter(sp => {
      if (seen.has(sp.codigo)) return false;
      seen.add(sp.codigo);
      return true;
    });
  }, [sisplanProducts]);

  // Filtered reference products for combobox search
  const filteredRef = useMemo(() => {
    if (!refSearch.trim()) return referenceProducts;
    const q = refSearch.toLowerCase();
    return referenceProducts.filter(sp =>
      sp.codigo.toLowerCase().includes(q) ||
      sp.descricao.toLowerCase().includes(q)
    );
  }, [referenceProducts, refSearch]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setEditing({ ...emptyProduct, sizes: [] });
    setPhotoPreview(null);
    setRefSearch("");
    setRefOpen(false);
    setBarcodes([]);
    setScannerActive(false);
    setLastScanned(null);
    onOpen();
  }

  function openEdit(p) {
    setEditing({ ...p, sizes: p.sizes.map(s => ({ ...s })) });
    setPhotoPreview(p.photo_url || null);
    setRefSearch("");
    setRefOpen(false);
    setScannerActive(false);
    setLastScanned(null);
    onOpen();
    // Load existing barcodes
    if (p.id) {
      setBarcodesLoading(true);
      fetchCatalogBarcodes(p.id)
        .then(setBarcodes)
        .catch(() => setBarcodes([]))
        .finally(() => setBarcodesLoading(false));
    } else {
      setBarcodes([]);
    }
  }

  function openDelete(p) {
    setDeleting(p);
    onDeleteOpen();
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
    setEditing(prev => ({ ...prev, _photoFile: file }));
  }

  function handleReferenceChange(codigo) {
    const seen = new Set();
    const sizes = sisplanProducts
      .filter(sp => sp.codigo === codigo)
      .filter(sp => {
        if (seen.has(sp.tamanho)) return false;
        seen.add(sp.tamanho);
        return true;
      })
      .map(sp => ({ size_name: sp.tamanho, sisplan_sku: sp.sku }))
      .sort((a, b) => sortSize(a.size_name) - sortSize(b.size_name));
    setEditing(prev => ({ ...prev, reference_codigo: codigo, sizes }));
  }

  function removeSize(idx) {
    setEditing(prev => ({ ...prev, sizes: prev.sizes.filter((_, i) => i !== idx) }));
  }

  // ─── Barcode scanner handlers ───────────────────────────────────────────────

  const handleBarcodeScan = useCallback(async (code) => {
    if (!editing?.id) return { status: "error", message: "Salve o produto antes de vincular barcodes" };
    // Find this barcode in sisplan_products to get tamanho
    // EAN field may contain multiple barcodes separated by comma
    const sp = sisplanProducts.find(p => {
      if (p.sku === code) return true;
      if (!p.ean) return false;
      return p.ean.split(",").map(e => e.trim()).includes(code);
    });
    if (!sp) {
      return { status: "error", message: "Código não encontrado no Sisplan" };
    }
    // Check if size exists in this product
    const sizeMatch = editing.sizes.find(
      s => s.size_name?.toUpperCase() === sp.tamanho?.toUpperCase()
    );
    if (!sizeMatch) {
      return { status: "error", message: `Tamanho "${sp.tamanho}" não está na grade deste produto` };
    }
    // Check if already added
    if (barcodes.find(b => b.barcode === code)) {
      return { status: "duplicate", message: `Tam ${sp.tamanho} — ${sp.descricao}` };
    }
    // Add barcode
    const label = [sp.descricao, sp.desc_cor].filter(Boolean).join(" - ");
    const results = await addCatalogBarcodes(editing.id, [{
      size_name: sizeMatch.size_name,
      barcode: code,
      sisplan_sku: sp.sku,
      label,
    }]);
    setBarcodes(prev => [...prev, ...results]);
    return { status: "success", message: `Tam ${sizeMatch.size_name} — ${label}` };
  }, [editing, sisplanProducts, barcodes]);

  async function handleRemoveBarcode(barcodeId) {
    try {
      await removeCatalogBarcode(barcodeId);
      setBarcodes(prev => prev.filter(b => b.id !== barcodeId));
      toast({ status: "success", description: "Código removido.", duration: 2000 });
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    }
  }

  async function handleAssociateGroup(groupId) {
    if (!editing?.id || !groupId) return;
    setAssociating(true);
    try {
      const result = await associateBarcodesByGroup(editing.id, groupId);
      toast({ status: "success", description: result.message, duration: 4000 });
      // Reload barcodes
      const updated = await fetchCatalogBarcodes(editing.id);
      setBarcodes(updated);
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    } finally {
      setAssociating(false);
      setGroupSelectOpen(false);
    }
  }

  async function handleSave() {
    if (!editing.name.trim()) {
      toast({ status: "warning", description: "Informe o nome do produto.", duration: 2500 });
      return;
    }
    if (!editing.price_pc || isNaN(parseFloat(editing.price_pc))) {
      toast({ status: "warning", description: "Informe o preço PC.", duration: 2500 });
      return;
    }
    if (!editing.price_mn || isNaN(parseFloat(editing.price_mn))) {
      toast({ status: "warning", description: "Informe o preço MN.", duration: 2500 });
      return;
    }
    if (editing.sizes.length === 0) {
      toast({ status: "warning", description: "Selecione o produto Sisplan de referência para carregar os tamanhos.", duration: 3000 });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        price_pc: parseFloat(editing.price_pc),
        price_mn: parseFloat(editing.price_mn),
        reference_codigo: editing.reference_codigo,
        sizes: editing.sizes.map(s => ({ size_name: s.size_name ?? s.name, sisplan_sku: s.sisplan_sku })),
      };

      let saved;
      if (editing.id) {
        saved = await updateOrderCatalogProduct(editing.id, payload);
      } else {
        saved = await createOrderCatalogProduct(payload);
      }

      // Upload photo if changed
      if (editing._photoFile) {
        const { photoUrl } = await uploadOrderProductPhoto(saved.id, editing._photoFile);
        saved = { ...saved, photo_url: photoUrl };
      }

      setProducts(prev =>
        editing.id
          ? prev.map(p => p.id === saved.id ? saved : p)
          : [...prev, saved]
      );
      toast({ status: "success", description: editing.id ? "Produto atualizado!" : "Produto criado!", duration: 2000 });
      onClose();
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteOrderCatalogProduct(deleting.id);
      setProducts(prev => prev.filter(p => p.id !== deleting.id));
      toast({ status: "success", description: "Produto removido.", duration: 2000 });
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    }
    onDeleteClose();
    setDeleting(null);
  }

  if (loading) {
    return (
      <Flex justify="center" align="center" h="200px">
        <Spinner color="blue.500" />
      </Flex>
    );
  }

  return (
    <Box maxW="960px" mx="auto" px={{ base: 0, md: 4 }} py={{ base: 2, md: 6 }}>
      {/* Header */}
      <Flex align="center" justify="space-between" mb={4} px={{ base: 1, md: 0 }}>
        <Box>
          <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">Catálogo de Produtos</Text>
          <Text fontSize="xs" color={mutedColor}>Produtos para exibição nos pedidos</Text>
        </Box>
        <Button leftIcon={<AddIcon />} colorScheme="blue" size={{ base: "sm", md: "md" }} onClick={openCreate}>
          Novo
        </Button>
      </Flex>

      {/* Search */}
      <InputGroup mb={4} size="sm">
        <InputLeftElement pointerEvents="none"><SearchIcon color={mutedColor} /></InputLeftElement>
        <Input
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          borderRadius="lg"
        />
      </InputGroup>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <Box py={16} textAlign="center" color={mutedColor}>
          <Text>Nenhum produto cadastrado ainda.</Text>
          <Button mt={4} colorScheme="blue" variant="outline" onClick={openCreate}>
            Cadastrar primeiro produto
          </Button>
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={4}>
          {filtered.map(product => (
            <Box
              key={product.id}
              bg={cardBg}
              borderRadius="xl"
              border="1px solid"
              borderColor={borderColor}
              overflow="hidden"
              boxShadow="sm"
            >
              {/* Photo */}
              <Box bg={photoBg} h="160px" display="flex" alignItems="center" justifyContent="center" position="relative">
                {product.photo_url ? (
                  <Image src={product.photo_url} alt={product.name} objectFit="contain" w="full" h="full" />
                ) : (
                  <VStack spacing={1} color={mutedColor}>
                    <Box fontSize="2xl">👗</Box>
                    <Text fontSize="xs">Sem foto</Text>
                  </VStack>
                )}
                <HStack position="absolute" top={2} right={2} spacing={1}>
                  <IconButton icon={<EditIcon />} size="xs" colorScheme="blue" aria-label="Editar" onClick={() => openEdit(product)} />
                  <IconButton icon={<DeleteIcon />} size="xs" colorScheme="red" aria-label="Excluir" onClick={() => openDelete(product)} />
                </HStack>
              </Box>

              {/* Info */}
              <Box p={3}>
                <Text fontWeight="semibold" fontSize="sm" noOfLines={1}>{product.name}</Text>
                {product.reference_codigo && (
                  <Text fontSize="xs" color={mutedColor} mb={1}>Ref: {product.reference_codigo}</Text>
                )}
                <HStack spacing={3} mt={0.5}>
                  <Box>
                    <Text fontSize="9px" fontWeight="bold" color={mutedColor} textTransform="uppercase" letterSpacing="wide">PC</Text>
                    <Text fontSize="sm" fontWeight="bold" color="blue.500">
                      R$ {parseFloat(product.price_pc || 0).toFixed(2).replace(".", ",")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="9px" fontWeight="bold" color={mutedColor} textTransform="uppercase" letterSpacing="wide">MN</Text>
                    <Text fontSize="sm" fontWeight="bold" color="purple.500">
                      R$ {parseFloat(product.price_mn || 0).toFixed(2).replace(".", ",")}
                    </Text>
                  </Box>
                </HStack>
                {/* Sizes */}
                <Flex wrap="wrap" gap={1} mt={2}>
                  {product.sizes.map((s, i) => (
                    <Tag key={s.id || i} size="sm" colorScheme="gray" borderRadius="full">
                      <TagLabel>{s.size_name}</TagLabel>
                    </Tag>
                  ))}
                  {product.sizes.length === 0 && (
                    <Text fontSize="xs" color={mutedColor}>Sem tamanhos</Text>
                  )}
                </Flex>
              </Box>
            </Box>
          ))}
        </SimpleGrid>
      )}

      {/* ---- Create/Edit Modal ---- */}
      <Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "xl" }} scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius={{ base: 0, md: "xl" }}>
          <ModalHeader fontSize="md">{editing?.id ? "Editar Produto" : "Novo Produto"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            {editing && (
              <VStack spacing={4} align="stretch">
                {/* Photo upload */}
                <FormControl>
                  <FormLabel fontSize="sm">Foto do Produto</FormLabel>
                  <Box
                    border="2px dashed"
                    borderColor={borderColor}
                    borderRadius="xl"
                    h="180px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    bg={photoBg}
                    overflow="hidden"
                    onClick={() => fileRef.current?.click()}
                    _hover={{ borderColor: "blue.400" }}
                    transition="border-color 0.2s"
                  >
                    {photoPreview ? (
                      <Image src={photoPreview} objectFit="contain" w="full" h="full" />
                    ) : (
                      <VStack spacing={1} color={mutedColor}>
                        <Text fontSize="2xl">📷</Text>
                        <Text fontSize="sm">Clique para adicionar foto</Text>
                        <Text fontSize="xs">JPG, PNG ou WEBP</Text>
                      </VStack>
                    )}
                  </Box>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
                  {photoPreview && (
                    <Button size="xs" variant="ghost" colorScheme="red" mt={1}
                      onClick={() => { setPhotoPreview(null); setEditing(p => ({ ...p, photo_url: null, _photoFile: null })); }}>
                      Remover foto
                    </Button>
                  )}
                </FormControl>

                {/* Nome */}
                <FormControl>
                  <FormLabel fontSize="sm">Nome do Produto *</FormLabel>
                  <Input size="sm" placeholder="Ex: Vestido Floral" value={editing.name}
                    onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
                </FormControl>

                {/* Preços PC e MN */}
                <SimpleGrid columns={2} gap={3}>
                  <FormControl>
                    <FormLabel fontSize="sm">
                      Preço{" "}
                      <Badge colorScheme="blue" fontSize="xs">PC</Badge>
                      {" "}*
                    </FormLabel>
                    <InputGroup size="sm">
                      <InputLeftElement pointerEvents="none" fontSize="xs" color={mutedColor}>R$</InputLeftElement>
                      <Input
                        pl={8}
                        type="number"
                        step="0.01"
                        placeholder="89.90"
                        value={editing.price_pc}
                        onChange={e => setEditing(p => ({ ...p, price_pc: e.target.value }))}
                      />
                    </InputGroup>
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">
                      Preço{" "}
                      <Badge colorScheme="purple" fontSize="xs">MN</Badge>
                      {" "}*
                    </FormLabel>
                    <InputGroup size="sm">
                      <InputLeftElement pointerEvents="none" fontSize="xs" color={mutedColor}>R$</InputLeftElement>
                      <Input
                        pl={8}
                        type="number"
                        step="0.01"
                        placeholder="59.90"
                        value={editing.price_mn}
                        onChange={e => setEditing(p => ({ ...p, price_mn: e.target.value }))}
                      />
                    </InputGroup>
                  </FormControl>
                </SimpleGrid>

                <Box fontSize="xs" color={mutedColor} bg={photoBg} borderRadius="md" px={3} py={2}>
                  Cor: <strong>Sortida (Cód. 9)</strong> — padrão para todos os produtos
                </Box>

                {/* Sisplan reference product — combobox pesquisável */}
                <FormControl>
                  <FormLabel fontSize="sm">Produto de referência Sisplan *</FormLabel>
                  {referenceProducts.length === 0 ? (
                    <Text fontSize="xs" color="orange.500">
                      Nenhum produto sincronizado do Sisplan. Acesse Configurações → Sisplan para sincronizar.
                    </Text>
                  ) : (
                    <Box position="relative" ref={refBoxRef}>
                      {/* Selected value display / search input */}
                      <InputGroup size="sm">
                        <InputLeftElement pointerEvents="none">
                          <SearchIcon color={mutedColor} boxSize={3} />
                        </InputLeftElement>
                        <Input
                          pl={8}
                          borderRadius="md"
                          placeholder="Buscar por código ou descrição..."
                          value={refOpen ? refSearch : (editing.reference_codigo
                            ? `${editing.reference_codigo} — ${referenceProducts.find(r => r.codigo === editing.reference_codigo)?.descricao || ""}`
                            : ""
                          )}
                          onChange={e => { setRefSearch(e.target.value); setRefOpen(true); }}
                          onFocus={() => { setRefSearch(""); setRefOpen(true); }}
                          onBlur={() => setTimeout(() => setRefOpen(false), 150)}
                          readOnly={!refOpen}
                          cursor={refOpen ? "text" : "pointer"}
                        />
                      </InputGroup>

                      {/* Dropdown list */}
                      {refOpen && (
                        <Box
                          position="absolute"
                          top="100%"
                          left={0}
                          right={0}
                          zIndex={20}
                          bg={panelBg}
                          border="1px solid"
                          borderColor={borderColor}
                          borderRadius="md"
                          boxShadow="lg"
                          maxH="200px"
                          overflowY="auto"
                          mt={1}
                        >
                          {filteredRef.length === 0 ? (
                            <Text fontSize="xs" color={mutedColor} px={3} py={2}>Nenhum resultado</Text>
                          ) : (
                            <List>
                              {filteredRef.map(sp => (
                                <ListItem
                                  key={sp.codigo}
                                  px={3}
                                  py={2}
                                  fontSize="sm"
                                  cursor="pointer"
                                  bg={editing.reference_codigo === sp.codigo ? "blue.50" : undefined}
                                  color={editing.reference_codigo === sp.codigo ? "blue.700" : undefined}
                                  _hover={{ bg: "blue.50", color: "blue.700" }}
                                  _dark={{
                                    bg: editing.reference_codigo === sp.codigo ? "blue.900" : undefined,
                                    color: editing.reference_codigo === sp.codigo ? "blue.200" : undefined,
                                    _hover: { bg: "blue.900", color: "blue.200" },
                                  }}
                                  onMouseDown={() => {
                                    handleReferenceChange(sp.codigo);
                                    setRefOpen(false);
                                    setRefSearch("");
                                  }}
                                >
                                  <Text as="span" fontFamily="mono" fontWeight="bold" fontSize="xs" mr={2}>
                                    {sp.codigo}
                                  </Text>
                                  {sp.descricao}
                                </ListItem>
                              ))}
                            </List>
                          )}
                        </Box>
                      )}
                    </Box>
                  )}
                  <Text fontSize="xs" color={mutedColor} mt={1}>
                    Os tamanhos disponíveis serão carregados automaticamente ao selecionar.
                  </Text>
                </FormControl>

                {/* Sizes (auto-populated) */}
                {editing.reference_codigo && (
                  <Box>
                    <Flex justify="space-between" align="center" mb={2}>
                      <FormLabel fontSize="sm" mb={0}>
                        Tamanhos{" "}
                        <Badge colorScheme="blue" fontSize="xs" ml={1}>{editing.sizes.length}</Badge>
                      </FormLabel>
                    </Flex>

                    {editing.sizes.length === 0 ? (
                      <Text fontSize="xs" color={mutedColor} textAlign="center" py={3}>
                        Nenhum tamanho encontrado para este produto no Sisplan.
                      </Text>
                    ) : (
                      <VStack spacing={2} align="stretch">
                        {editing.sizes.map((size, idx) => (
                          <Flex
                            key={size.id || idx}
                            align="center"
                            gap={2}
                            p={2}
                            borderRadius="md"
                            border="1px solid"
                            borderColor={borderColor}
                            bg={photoBg}
                          >
                            <Flex
                              w="44px"
                              h="32px"
                              align="center"
                              justify="center"
                              bg="blue.500"
                              color="white"
                              borderRadius="md"
                              fontSize="sm"
                              fontWeight="bold"
                              flexShrink={0}
                            >
                              {size.size_name}
                            </Flex>
                            <Box flex={1} />
                            <IconButton
                              icon={<DeleteIcon />}
                              size="xs"
                              colorScheme="red"
                              variant="ghost"
                              aria-label="Remover tamanho"
                              onClick={() => removeSize(idx)}
                            />
                          </Flex>
                        ))}
                      </VStack>
                    )}
                  </Box>
                )}

                {!editing.reference_codigo && (
                  <Box
                    border="1px dashed"
                    borderColor={borderColor}
                    borderRadius="lg"
                    p={4}
                    textAlign="center"
                    color={mutedColor}
                  >
                    <Text fontSize="sm">Selecione o produto Sisplan de referência acima para carregar os tamanhos</Text>
                  </Box>
                )}

                {/* ─── Códigos de Barras ──────────────────────── */}
                {editing.id && (
                  <Box>
                    <Flex justify="space-between" align="center" mb={3}>
                      <FormLabel fontSize="sm" mb={0}>
                        Códigos de Barras{" "}
                        <Badge colorScheme="green" fontSize="xs" ml={1}>{barcodes.length}</Badge>
                      </FormLabel>
                    </Flex>

                    {/* Action buttons — stacked on mobile */}
                    <SimpleGrid columns={2} gap={2} mb={3}>
                      <Button
                        size="md"
                        colorScheme={scannerActive ? "red" : "green"}
                        variant={scannerActive ? "solid" : "outline"}
                        onClick={() => { setScannerActive(!scannerActive); setLastScanned(null); setGroupSelectOpen(false); }}
                        w="full"
                      >
                        {scannerActive ? "Fechar Scanner" : "Bipar"}
                      </Button>
                      <Button
                        size="md"
                        colorScheme={groupSelectOpen ? "red" : "blue"}
                        variant={groupSelectOpen ? "solid" : "outline"}
                        onClick={() => { setGroupSelectOpen(!groupSelectOpen); setScannerActive(false); }}
                        isLoading={associating}
                        loadingText="Associando..."
                        w="full"
                      >
                        {groupSelectOpen ? "Cancelar" : "Por Grupo"}
                      </Button>
                    </SimpleGrid>

                    {/* Seleção de grupo para associação automática */}
                    <Collapse in={groupSelectOpen} animateOpacity>
                      <Box mb={3} p={3} bg={photoBg} borderRadius="lg" border="1px solid" borderColor={borderColor}>
                        <Text fontSize="sm" fontWeight="bold" mb={3}>
                          Selecione o grupo:
                        </Text>
                        <VStack spacing={2} align="stretch" maxH="280px" overflowY="auto">
                          {groups.map(g => (
                            <Button
                              key={g.id}
                              size="lg"
                              variant="outline"
                              justifyContent="flex-start"
                              isLoading={associating}
                              onClick={() => handleAssociateGroup(g.id)}
                              py={4}
                              h="auto"
                              whiteSpace="normal"
                              textAlign="left"
                            >
                              <Box>
                                <Text fontSize="sm">{g.name}</Text>
                                {g.product_count != null && (
                                  <Text fontSize="xs" color={mutedColor}>{g.product_count} produtos</Text>
                                )}
                              </Box>
                            </Button>
                          ))}
                          {groups.length === 0 && (
                            <Text fontSize="sm" color={mutedColor} textAlign="center" py={4}>Nenhum grupo cadastrado.</Text>
                          )}
                        </VStack>
                      </Box>
                    </Collapse>

                    {/* Scanner */}
                    <Collapse in={scannerActive} animateOpacity>
                      <Box mb={3}>
                        <BarcodeScanner
                          active={scannerActive}
                          onScan={handleBarcodeScan}
                          continuous
                        />
                      </Box>
                    </Collapse>

                    {/* Lista de barcodes vinculados */}
                    {barcodesLoading ? (
                      <Flex justify="center" py={3}><Spinner size="sm" /></Flex>
                    ) : barcodes.length === 0 ? (
                      <Text fontSize="sm" color={mutedColor} textAlign="center" py={4}>
                        Nenhum código de barras vinculado.
                      </Text>
                    ) : (
                      <VStack spacing={2} align="stretch" maxH="250px" overflowY="auto">
                        {barcodes.map(b => (
                          <Flex
                            key={b.id}
                            align="center"
                            gap={2}
                            px={3}
                            py={2.5}
                            borderRadius="lg"
                            border="1px solid"
                            borderColor={borderColor}
                            bg={photoBg}
                          >
                            <Flex
                              w="48px"
                              h="32px"
                              align="center"
                              justify="center"
                              bg="green.500"
                              color="white"
                              borderRadius="md"
                              fontSize="sm"
                              fontWeight="bold"
                              flexShrink={0}
                            >
                              {b.size_name}
                            </Flex>
                            <Box flex={1} minW={0}>
                              <Text fontSize="sm" fontFamily="mono" fontWeight="bold" noOfLines={1}>
                                {b.barcode}
                              </Text>
                              {b.label && (
                                <Text fontSize="xs" color={mutedColor} noOfLines={1}>{b.label}</Text>
                              )}
                            </Box>
                            <IconButton
                              icon={<DeleteIcon />}
                              size="xs"
                              colorScheme="red"
                              variant="ghost"
                              aria-label="Remover barcode"
                              onClick={() => handleRemoveBarcode(b.id)}
                            />
                          </Flex>
                        ))}
                      </VStack>
                    )}
                  </Box>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button colorScheme="blue" size="sm" isLoading={saving} loadingText="Salvando..." onClick={handleSave}>
              Salvar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose} size="sm" isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl">
          <ModalHeader fontSize="md">Excluir produto?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm">Deseja excluir <strong>{deleting?.name}</strong>? Esta ação não pode ser desfeita.</Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" size="sm" onClick={onDeleteClose}>Cancelar</Button>
            <Button colorScheme="red" size="sm" onClick={handleDelete}>Excluir</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
