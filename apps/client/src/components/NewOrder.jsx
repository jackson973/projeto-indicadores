import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  SimpleGrid,
  Spinner,
  Text,
  Textarea,
  useColorModeValue,
  useDisclosure,
  useToast,
  VStack,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerCloseButton,
} from "@chakra-ui/react";
import { AddIcon, CloseIcon, SearchIcon } from "@chakra-ui/icons";
import {
  fetchOrderCatalog,
  fetchOrderCustomers,
  fetchPaymentConditions,
  syncOrderCustomers,
  createOrder as apiCreateOrder,
  updateOrderStatus as apiUpdateOrder,
  getOrderPdfUrl,
} from "../api";

const PRICE_TABLES = [
  { id: "PC", label: "PC" },
  { id: "MN", label: "MN" },
];

// Normalize catalog sizes from API (size_name → name for UI)
function normalizeCatalog(products) {
  return products.map(p => ({
    ...p,
    sizes: (p.sizes || []).map(s => ({ ...s, name: s.size_name || s.name })),
  }));
}

const getEmoji = (name) => {
  const n = (name || "").toLowerCase();
  if (n.includes("vestido")) return "👗";
  if (n.includes("blusa") || n.includes("camiseta")) return "👕";
  if (n.includes("shorts") || n.includes("short")) return "🩲";
  if (n.includes("calça") || n.includes("legging")) return "👖";
  return "🛍️";
};

const cartKey = (productId, sizeId) => `${productId}:${sizeId}`;

export default function NewOrder({ initialOrder = null, onSaved = null }) {
  const isEditing = !!initialOrder;

  const [catalog, setCatalog]                       = useState([]);
  const [catalogLoading, setCatalogLoading]         = useState(true);
  const [conditions, setConditions]                 = useState([]);
  const [customers, setCustomers]                   = useState([]);
  const [customersLoading, setCustomersLoading]     = useState(false);
  const [syncing, setSyncing]                       = useState(false);
  const [customerSearch, setCustomerSearch]         = useState("");
  const [selectedCustomer, setSelectedCustomer]     = useState(null);
  const [priceTable, setPriceTable]                 = useState("");
  const [selectedCondition, setSelectedCondition]   = useState(null);
  const [notes, setNotes]                           = useState("");
  const [productSearch, setProductSearch]           = useState("");
  const [submitting, setSubmitting]                 = useState(false);
  const [cart, setCart]                             = useState({});

  const customerDrawer  = useDisclosure();
  const cartDrawer      = useDisclosure();
  const confirmDialog   = useDisclosure();
  const cancelRef       = useRef(null);
  const toast           = useToast();

  const panelBg     = useColorModeValue("white", "gray.800");
  const cardBg      = useColorModeValue("white", "gray.750");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const mutedColor  = useColorModeValue("gray.500", "gray.400");
  const photoBg     = useColorModeValue("gray.100", "gray.700");

  // Load catalog + conditions on mount
  useEffect(() => {
    fetchOrderCatalog()
      .then(data => setCatalog(normalizeCatalog(data)))
      .catch(err => toast({ status: "error", description: err.message, duration: 3000 }))
      .finally(() => setCatalogLoading(false));
    fetchPaymentConditions()
      .then(data => {
        setConditions(data);
        if (!initialOrder) {
          setPriceTable("MN");
          const def = data.find(c => c.name === "30/60/90");
          if (def) setSelectedCondition(def.name);
        }
      })
      .catch(() => {});
  }, []);

  // Pre-populate state when editing an existing order (run once when catalog is ready)
  const cartInitialized = useRef(false);
  useEffect(() => {
    if (!initialOrder || catalog.length === 0 || cartInitialized.current) return;
    cartInitialized.current = true;

    setPriceTable(initialOrder.price_table || "");
    setSelectedCondition(initialOrder.payment_condition || null);
    setNotes(initialOrder.notes || "");
    setSelectedCustomer({
      id:           initialOrder.customer_id,
      sisplan_id:   initialOrder.customer_snapshot?.sisplan_id,
      fantasy_name: initialOrder.customer_snapshot?.fantasy_name,
      company_name: initialOrder.customer_snapshot?.company_name,
      cnpj:         initialOrder.customer_snapshot?.cnpj,
    });

    const newCart = {};
    for (const item of initialOrder.items || []) {
      // Match by catalog_product_id first, fallback to product_name
      const product = catalog.find(p =>
        (item.catalog_product_id && p.id === item.catalog_product_id) ||
        p.name === item.product_name
      );
      if (!product) continue;
      const size = product.sizes.find(s => (s.size_name || s.name) === item.size_name);
      if (!size) continue;
      const k = cartKey(product.id, size.id);
      newCart[k] = { product, size, qty: item.qty, unitPrice: Number(item.unit_price) };
    }
    setCart(newCart);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrder, catalog]);

  // Load customers when drawer opens or search changes
  const loadCustomers = useCallback((search) => {
    setCustomersLoading(true);
    fetchOrderCustomers(search)
      .then(setCustomers)
      .catch(err => toast({ status: "error", description: err.message, duration: 3000 }))
      .finally(() => setCustomersLoading(false));
  }, []);

  useEffect(() => {
    if (!customerDrawer.isOpen) return;
    const t = setTimeout(() => loadCustomers(customerSearch), 250);
    return () => clearTimeout(t);
  }, [customerSearch, customerDrawer.isOpen, loadCustomers]);

  const filteredCatalog = useMemo(() => {
    if (!productSearch.trim()) return catalog;
    const q = productSearch.toLowerCase();
    return catalog.filter(p => p.name.toLowerCase().includes(q));
  }, [productSearch, catalog]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + (i.unitPrice ?? 0) * i.qty, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems]);

  function setQty(productId, size, qty, unitPrice) {
    const k = cartKey(productId, size.id);
    if (qty <= 0) {
      setCart(prev => { const n = { ...prev }; delete n[k]; return n; });
    } else {
      const product = catalog.find(p => p.id === productId);
      const price = unitPrice ?? cart[k]?.unitPrice ?? 0;
      setCart(prev => ({ ...prev, [k]: { product, size, qty, unitPrice: price } }));
    }
  }

  function getQty(productId, sizeId) {
    return cart[cartKey(productId, sizeId)]?.qty || 0;
  }

  function clearProduct(productId) {
    setCart(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${productId}:`)) delete next[k]; });
      return next;
    });
  }

  async function handleSyncCustomers() {
    setSyncing(true);
    try {
      const { count } = await syncOrderCustomers();
      toast({ status: "success", description: `${count} clientes sincronizados.`, duration: 3000 });
      loadCustomers(customerSearch);
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 4000 });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSubmit(type) {
    if (!selectedCustomer) {
      toast({ status: "warning", description: "Selecione o cliente.", duration: 2500 });
      return;
    }
    if (!priceTable) {
      toast({ status: "warning", description: "Selecione a tabela de preços.", duration: 2500 });
      return;
    }
    if (cartItems.length === 0) {
      toast({ status: "warning", description: "Adicione ao menos um produto.", duration: 2500 });
      return;
    }

    const condObj = conditions.find(c => c.name === selectedCondition);
    const customer_snapshot = {
      sisplan_id:   selectedCustomer.sisplan_id,
      fantasy_name: selectedCustomer.fantasy_name,
      company_name: selectedCustomer.company_name,
      cnpj:         selectedCustomer.cnpj,
    };
    const items = cartItems.map(item => ({
      catalog_product_id: item.product.id,
      product_name:       item.product.name,
      size_name:          item.size.size_name || item.size.name,
      sisplan_sku:        item.size.sisplan_sku || null,
      qty:                item.qty,
      unit_price:         item.unitPrice,
    }));

    setSubmitting(true);
    try {
      let order;
      if (isEditing) {
        order = await apiUpdateOrder(initialOrder.id, {
          customer_id: selectedCustomer.id,
          customer_snapshot,
          price_table: priceTable,
          payment_condition:     condObj?.name     || selectedCondition || null,
          payment_condition_erp: condObj?.erp_code || null,
          notes,
          items,
        });
        toast({ status: "success", title: "Alterações salvas!", description: `#${order.id} atualizado.`, duration: 3000 });
        cartDrawer.onClose();
        if (onSaved) onSaved(order);
      } else {
        order = await apiCreateOrder({ type, customer_id: selectedCustomer.id, customer_snapshot, price_table: priceTable, payment_condition: condObj?.name || null, payment_condition_erp: condObj?.erp_code || null, notes, items });
        toast({
          status: "success",
          title: type === "pedido" ? "Pedido salvo!" : "Orçamento salvo!",
          description: `#${order.id} criado com sucesso.`,
          duration: 3000,
        });
        cartDrawer.onClose();
        setCart({});
        setSelectedCustomer(null);
        setPriceTable("");
        setSelectedCondition(null);
        setNotes("");
        window.open(getOrderPdfUrl(order), "_blank");
      }
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    } finally {
      setSubmitting(false);
    }
  }

  if (catalogLoading) {
    return (
      <Flex justify="center" align="center" h="200px">
        <Spinner color="blue.500" />
      </Flex>
    );
  }

  return (
    <Box maxW="700px" mx="auto" pb="100px">
      {/* ---- Header: Cliente + Tabela ---- */}
      <Box
        bg={panelBg}
        borderRadius="xl"
        border="1px solid"
        borderColor={borderColor}
        p={4}
        mb={4}
        boxShadow="sm"
      >
        <Text fontSize="sm" fontWeight="bold" mb={3} color={mutedColor} textTransform="uppercase" letterSpacing="wide">
          Dados do Pedido
        </Text>

        {/* Customer selector */}
        <FormControl mb={3}>
          <FormLabel fontSize="sm" mb={1}>Cliente *</FormLabel>
          <Box
            border="1px solid"
            borderColor={selectedCustomer ? "blue.400" : borderColor}
            borderRadius="md"
            p={3}
            cursor="pointer"
            onClick={customerDrawer.onOpen}
            _hover={{ borderColor: "blue.400" }}
            transition="border-color 0.2s"
          >
            {selectedCustomer ? (
              <Flex justify="space-between" align="center">
                <Box>
                  <HStack spacing={2}>
                    <Badge colorScheme="gray" fontSize="xs" fontFamily="mono">{selectedCustomer.sisplan_id}</Badge>
                    <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                      {selectedCustomer.fantasy_name || selectedCustomer.company_name}
                    </Text>
                  </HStack>
                  {selectedCustomer.fantasy_name && selectedCustomer.company_name && (
                    <Text fontSize="xs" color={mutedColor} noOfLines={1}>{selectedCustomer.company_name}</Text>
                  )}
                  {selectedCustomer.cnpj && (
                    <Text fontSize="xs" color={mutedColor}>{selectedCustomer.cnpj}</Text>
                  )}
                </Box>
                <Badge colorScheme="blue" fontSize="xs">Alterar</Badge>
              </Flex>
            ) : (
              <Flex align="center" gap={2} color={mutedColor}>
                <SearchIcon boxSize={3} />
                <Text fontSize="sm">Buscar cliente...</Text>
              </Flex>
            )}
          </Box>
        </FormControl>

        {/* Price table */}
        <FormControl>
          <FormLabel fontSize="sm" mb={1}>Tabela de Preços *</FormLabel>
          <SimpleGrid columns={2} gap={2}>
            {PRICE_TABLES.map(t => (
              <Box
                key={t.id}
                as="button"
                py={2}
                borderRadius="md"
                border="2px solid"
                borderColor={priceTable === t.id ? "blue.400" : borderColor}
                bg={priceTable === t.id ? "blue.50" : "transparent"}
                color={priceTable === t.id ? "blue.600" : mutedColor}
                fontWeight={priceTable === t.id ? "bold" : "normal"}
                fontSize="sm"
                onClick={() => setPriceTable(t.id)}
                transition="all 0.15s"
                _dark={{
                  bg: priceTable === t.id ? "blue.900" : "transparent",
                  color: priceTable === t.id ? "blue.300" : mutedColor,
                }}
              >
                {t.label}
              </Box>
            ))}
          </SimpleGrid>
        </FormControl>

        {/* Payment condition */}
        {conditions.length > 0 && (
          <FormControl mt={3}>
            <FormLabel fontSize="sm" mb={1}>Condição de Pagamento</FormLabel>
            <SimpleGrid columns={{ base: 2, sm: 3 }} gap={2}>
              {conditions.map(c => (
                <Box
                  key={c.id}
                  as="button"
                  py={2}
                  px={1}
                  borderRadius="md"
                  border="2px solid"
                  borderColor={selectedCondition === c.name ? "blue.400" : borderColor}
                  bg={selectedCondition === c.name ? "blue.50" : "transparent"}
                  color={selectedCondition === c.name ? "blue.600" : mutedColor}
                  fontWeight={selectedCondition === c.name ? "bold" : "normal"}
                  fontSize="sm"
                  onClick={() => setSelectedCondition(prev => prev === c.name ? null : c.name)}
                  transition="all 0.15s"
                  _dark={{
                    bg: selectedCondition === c.name ? "blue.900" : "transparent",
                    color: selectedCondition === c.name ? "blue.300" : mutedColor,
                  }}
                >
                  {c.name}
                </Box>
              ))}
            </SimpleGrid>
          </FormControl>
        )}
      </Box>

      {/* ---- Product catalog ---- */}
      <Box mb={4}>
        <Text fontSize="sm" fontWeight="bold" mb={3} color={mutedColor} textTransform="uppercase" letterSpacing="wide" px={1}>
          Produtos
        </Text>
        <InputGroup size="sm" mb={3}>
          <InputLeftElement pointerEvents="none"><SearchIcon color={mutedColor} /></InputLeftElement>
          <Input placeholder="Buscar produto..." value={productSearch}
            onChange={e => setProductSearch(e.target.value)} borderRadius="lg" />
        </InputGroup>

        {filteredCatalog.length === 0 ? (
          <Box py={10} textAlign="center" color={mutedColor}>
            <Text>Nenhum produto no catálogo.</Text>
            <Text fontSize="xs" mt={1}>Configure produtos em Config Produtos (admin).</Text>
          </Box>
        ) : (
          <SimpleGrid columns={{ base: 2, md: 3 }} gap={3}>
            {filteredCatalog.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                priceTable={priceTable}
                getQty={getQty}
                setQty={setQty}
                clearProduct={clearProduct}
                cardBg={cardBg}
                borderColor={borderColor}
                mutedColor={mutedColor}
                photoBg={photoBg}
              />
            ))}
          </SimpleGrid>
        )}
      </Box>

      {/* ---- Floating cart button ---- */}
      {cartCount > 0 && (
        <Box
          position="fixed"
          bottom={6}
          left="50%"
          transform="translateX(-50%)"
          zIndex={10}
          w={{ base: "calc(100% - 32px)", md: "460px" }}
          maxW="460px"
        >
          <Button
            w="full"
            colorScheme="blue"
            size="lg"
            borderRadius="full"
            boxShadow="lg"
            onClick={cartDrawer.onOpen}
          >
            <Flex justify="space-between" w="full" align="center">
              <HStack spacing={2}>
                <Text>🛒</Text>
                <Badge bg="white" color="blue.600" borderRadius="full" px={2} fontSize="xs" fontWeight="bold">
                  {cartCount}
                </Badge>
                <Text fontWeight="semibold">Ver Carrinho</Text>
              </HStack>
              <Text fontWeight="bold">R$ {cartTotal.toFixed(2).replace(".", ",")}</Text>
            </Flex>
          </Button>
        </Box>
      )}

      {/* ---- Customer picker drawer ---- */}
      <Drawer isOpen={customerDrawer.isOpen} onClose={customerDrawer.onClose} placement="bottom" size="md" returnFocusOnClose={false} onCloseComplete={() => window.scrollTo({ top: 0, behavior: "instant" })}>
        <DrawerOverlay />
        <DrawerContent borderTopRadius="2xl" maxH="85vh">
          <DrawerCloseButton />
          <DrawerHeader fontSize="md" pb={2}>Selecionar Cliente</DrawerHeader>
          <DrawerBody px={4} pt={0}>
            <InputGroup size="sm" mb={3}>
              <InputLeftElement pointerEvents="none"><SearchIcon color={mutedColor} /></InputLeftElement>
              <Input
                placeholder="Código, nome ou CNPJ..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                borderRadius="lg"
                autoFocus
              />
            </InputGroup>
            {customersLoading ? (
              <Flex justify="center" py={6}><Spinner size="sm" color="blue.500" /></Flex>
            ) : (
              <VStack spacing={2} align="stretch">
                {customers.map(c => (
                  <Box
                    key={c.id}
                    p={3}
                    borderRadius="lg"
                    border="1px solid"
                    borderColor={selectedCustomer?.id === c.id ? "blue.400" : borderColor}
                    bg={selectedCustomer?.id === c.id ? "blue.50" : cardBg}
                    cursor="pointer"
                    onClick={() => { setSelectedCustomer(c); customerDrawer.onClose(); }}
                    _dark={{ bg: selectedCustomer?.id === c.id ? "blue.900" : cardBg }}
                  >
                    <HStack spacing={2} mb={0.5}>
                      <Badge colorScheme="gray" fontSize="xs" fontFamily="mono" flexShrink={0}>{c.sisplan_id}</Badge>
                      <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                        {c.fantasy_name || c.company_name}
                      </Text>
                    </HStack>
                    {c.fantasy_name && c.company_name && (
                      <Text fontSize="xs" color={mutedColor} noOfLines={1}>{c.company_name}</Text>
                    )}
                    <HStack spacing={2}>
                      {c.cidade && <Text fontSize="xs" color={mutedColor}>{c.cidade}</Text>}
                      {c.cnpj && <Text fontSize="xs" color={mutedColor}>{c.cnpj}</Text>}
                    </HStack>
                  </Box>
                ))}
                {customers.length === 0 && (
                  <Flex direction="column" align="center" py={6} gap={3}>
                    <Text fontSize="sm" color={mutedColor}>
                      {customerSearch ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                    </Text>
                    <Button
                      size="sm" variant="outline" colorScheme="blue"
                      isLoading={syncing} loadingText="Sincronizando..."
                      onClick={handleSyncCustomers}
                    >
                      Sincronizar do Sisplan
                    </Button>
                  </Flex>
                )}
              </VStack>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* ---- Cart drawer ---- */}
      <Drawer isOpen={cartDrawer.isOpen} onClose={cartDrawer.onClose} placement="bottom" size="full">
        <DrawerOverlay />
        <DrawerContent borderTopRadius="2xl">
          <DrawerCloseButton />
          <DrawerHeader fontSize="md" pb={1}>
            <HStack>
              <Text>Resumo do Pedido</Text>
              <Badge colorScheme="blue">{cartCount} item{cartCount !== 1 ? "s" : ""}</Badge>
            </HStack>
          </DrawerHeader>
          <DrawerBody px={4} pt={0} overflowY="auto">
            {/* Customer / Price table summary */}
            {selectedCustomer && (
              <Box bg={photoBg} borderRadius="lg" p={3} mb={4} fontSize="sm">
                <HStack justify="space-between">
                  <Box>
                    <HStack spacing={2}>
                      <Badge colorScheme="gray" fontSize="xs" fontFamily="mono">{selectedCustomer.sisplan_id}</Badge>
                      <Text fontWeight="semibold">{selectedCustomer.fantasy_name}</Text>
                    </HStack>
                    <Text fontSize="xs" color={mutedColor}>{selectedCustomer.cnpj}</Text>
                  </Box>
                  {priceTable && (
                    <Badge colorScheme={priceTable === "MN" ? "purple" : "blue"} fontSize="xs">
                      {priceTable}
                    </Badge>
                  )}
                </HStack>
              </Box>
            )}

            {/* Items */}
            <VStack spacing={2} align="stretch" mb={4}>
              {cartItems.map(item => (
                <Flex
                  key={cartKey(item.product.id, item.size.id)}
                  align="center"
                  justify="space-between"
                  p={3}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor={borderColor}
                  bg={cardBg}
                >
                  <Box flex={1} mr={2}>
                    <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{item.product.name}</Text>
                    <HStack spacing={1} mt={0.5}>
                      <Badge colorScheme="gray" fontSize="xs">{item.size.name}</Badge>
                      <Text fontSize="xs" color={mutedColor}>
                        R$ {(item.unitPrice ?? 0).toFixed(2).replace(".", ",")} un
                      </Text>
                    </HStack>
                  </Box>

                  <HStack spacing={1}>
                    <IconButton
                      icon={<Text fontSize="md" lineHeight={1}>−</Text>}
                      size="xs" variant="outline" colorScheme="blue" borderRadius="full"
                      aria-label="Diminuir"
                      onClick={() => setQty(item.product.id, item.size, item.qty - 1)}
                    />
                    <Text fontSize="sm" fontWeight="bold" minW="24px" textAlign="center">{item.qty}</Text>
                    <IconButton
                      icon={<AddIcon boxSize={2.5} />}
                      size="xs" colorScheme="blue" borderRadius="full"
                      aria-label="Aumentar"
                      onClick={() => setQty(item.product.id, item.size, item.qty + 1)}
                    />
                  </HStack>

                  <HStack spacing={1} ml={1}>
                    <Text fontSize="sm" fontWeight="bold" color="blue.500" minW="60px" textAlign="right">
                      R$ {((item.unitPrice ?? 0) * item.qty).toFixed(2).replace(".", ",")}
                    </Text>
                    <IconButton
                      icon={<CloseIcon boxSize={2} />}
                      size="xs" variant="ghost" colorScheme="red" borderRadius="full"
                      aria-label="Remover"
                      onClick={() => setQty(item.product.id, item.size, 0)}
                    />
                  </HStack>
                </Flex>
              ))}
            </VStack>

            <FormControl mb={4}>
              <FormLabel fontSize="sm" mb={1}>Observações</FormLabel>
              <Textarea size="sm" placeholder="Informações adicionais..." borderRadius="lg"
                value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
            </FormControl>

            {/* Total */}
            <Flex justify="space-between" align="center" p={4} bg={photoBg} borderRadius="xl" mb={4}>
              <Text fontWeight="bold">Total</Text>
              <Text fontSize="xl" fontWeight="bold" color="blue.500">
                R$ {cartTotal.toFixed(2).replace(".", ",")}
              </Text>
            </Flex>
          </DrawerBody>

          <DrawerFooter borderTop="1px solid" borderColor={borderColor} flexDirection="column" gap={2} pb={{ base: 8, md: 4 }}>
            {isEditing ? (
              <SimpleGrid columns={2} gap={2} w="full">
                <Button w="full" colorScheme="blue" size="lg" borderRadius="xl"
                  isLoading={submitting} loadingText="Salvando..." onClick={() => handleSubmit(initialOrder.type)}>
                  Salvar Alterações
                </Button>
                <Button variant="outline" colorScheme="gray" size="md" borderRadius="xl" onClick={cartDrawer.onClose}>
                  Fechar
                </Button>
              </SimpleGrid>
            ) : (
              <>
                <Button w="full" colorScheme="blue" size="lg" borderRadius="xl"
                  onClick={confirmDialog.onOpen}>
                  Enviar Pedido
                </Button>
                <SimpleGrid columns={2} gap={2} w="full">
                  <Button variant="outline" colorScheme="blue" size="md" borderRadius="xl"
                    isLoading={submitting} onClick={() => handleSubmit("orcamento")}>
                    Salvar Orçamento
                  </Button>
                  <Button variant="outline" colorScheme="gray" size="md" borderRadius="xl" onClick={cartDrawer.onClose}>
                    Fechar
                  </Button>
                </SimpleGrid>
              </>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      {/* ---- Confirm send dialog ---- */}
      <AlertDialog isOpen={confirmDialog.isOpen} leastDestructiveRef={cancelRef} onClose={confirmDialog.onClose} isCentered>
        <AlertDialogOverlay />
        <AlertDialogContent borderRadius="xl" mx={4}>
          <AlertDialogHeader fontSize="md" fontWeight="bold">Enviar Pedido</AlertDialogHeader>
          <AlertDialogBody fontSize="sm">
            Ao finalizar o pedido ele será transmitido e <strong>não poderá mais ser alterado</strong>. Deseja continuar?
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRef} variant="ghost" size="sm" onClick={confirmDialog.onClose}>Cancelar</Button>
            <Button
              colorScheme="blue" size="sm" borderRadius="lg"
              isLoading={submitting} loadingText="Enviando..."
              onClick={() => { confirmDialog.onClose(); handleSubmit("pedido"); }}
            >
              Confirmar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}

// ---- Product Card ----
function ProductCard({ product, priceTable, getQty, setQty, clearProduct, cardBg, borderColor, mutedColor, photoBg }) {
  const [selectedSizes, setSelectedSizes] = useState(() => new Set(product.sizes.map(s => s.id)));
  const [addQty, setAddQty] = useState(1);

  const basePrice = (table) => {
    if (table === "MN") return parseFloat(product.price_mn ?? product.price_pc ?? 0);
    return parseFloat(product.price_pc ?? 0);
  };

  const [priceInput, setPriceInput] = useState(() => basePrice(priceTable).toFixed(2));
  const [priceEditing, setPriceEditing] = useState(false);

  useEffect(() => {
    setPriceInput(basePrice(priceTable).toFixed(2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceTable]);

  const price = parseFloat(priceInput) || basePrice(priceTable);

  const totalInCart   = product.sizes.reduce((sum, s) => sum + getQty(product.id, s.id), 0);
  const selectedCount = selectedSizes.size;

  const blueBorder   = useColorModeValue("blue.400", "blue.300");
  const blueActiveBg = useColorModeValue("blue.500", "blue.400");
  const stepperBg    = useColorModeValue("gray.100", "gray.700");
  const priceEditBg  = useColorModeValue("blue.50", "blue.900");

  function toggleSize(sizeId) {
    setSelectedSizes(prev => {
      const next = new Set(prev);
      if (next.has(sizeId)) next.delete(sizeId);
      else next.add(sizeId);
      return next;
    });
  }

  function handleAdd() {
    const sizesToAdd = product.sizes.filter(s => selectedSizes.has(s.id));
    sizesToAdd.forEach(s => {
      const current = getQty(product.id, s.id);
      setQty(product.id, s, current + addQty, price);
    });
  }

  function changeAddQty(delta) {
    setAddQty(prev => Math.max(1, prev + delta));
  }

  function handlePriceBlur() {
    setPriceEditing(false);
    const v = parseFloat(priceInput);
    if (isNaN(v) || v <= 0) setPriceInput(basePrice(priceTable).toFixed(2));
    else setPriceInput(v.toFixed(2));
  }

  return (
    <Box
      bg={cardBg}
      borderRadius="xl"
      border="2px solid"
      borderColor={totalInCart > 0 ? blueBorder : borderColor}
      overflow="hidden"
      boxShadow={totalInCart > 0 ? "0 0 0 2px var(--chakra-colors-blue-100)" : "sm"}
      transition="all 0.15s"
      position="relative"
    >
      {totalInCart > 0 && (
        <>
          <Badge
            position="absolute" top={2} right={2} zIndex={1}
            colorScheme="blue" borderRadius="full" fontSize="xs" px={2}
          >
            {totalInCart}
          </Badge>
          <IconButton
            position="absolute" top={1} left={1} zIndex={1}
            icon={<CloseIcon boxSize={2} />}
            size="xs" colorScheme="red" variant="solid" borderRadius="full"
            aria-label="Remover produto"
            onClick={() => clearProduct(product.id)}
          />
        </>
      )}

      {/* Photo */}
      <Box bg={photoBg} h={{ base: "90px", md: "110px" }} display="flex" alignItems="center" justifyContent="center">
        {product.photo_url ? (
          <Image src={product.photo_url} alt={product.name} objectFit="contain" w="full" h="full" />
        ) : (
          <Text fontSize={{ base: "2xl", md: "3xl" }}>{getEmoji(product.name)}</Text>
        )}
      </Box>

      <Box p={2}>
        <Text fontSize="xs" fontWeight="semibold" noOfLines={2} mb={0.5} lineHeight="tight">
          {product.name}
        </Text>

        {/* Price editável + subtotal */}
        <Flex justify="space-between" align="center" mb={2}>
          <Flex
            align="center"
            gap={0.5}
            bg={priceEditing ? priceEditBg : "transparent"}
            borderRadius="md"
            px={priceEditing ? 1.5 : 0}
            py={priceEditing ? 0.5 : 0}
            border={priceEditing ? "1.5px solid" : "1.5px solid transparent"}
            borderColor={priceEditing ? "blue.400" : "transparent"}
            cursor="text"
            transition="all 0.15s"
            onClick={() => !priceEditing && setPriceEditing(true)}
          >
            <Text fontSize="xs" fontWeight="bold" color="blue.500" lineHeight={1}>R$</Text>
            <Input
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              onBlur={handlePriceBlur}
              tabIndex={-1}
              size="xs"
              w={`${Math.max(38, priceInput.length * 8)}px`}
              variant="unstyled"
              fontWeight="bold"
              color="blue.500"
              fontSize="sm"
              type="number"
              step="0.01"
              min="0"
              textAlign="left"
              px={0}
              lineHeight={1}
            />
          </Flex>
          {totalInCart > 0 && (
            <Text fontSize="xs" fontWeight="bold" color="green.500">
              = R$ {(price * totalInCart).toFixed(2).replace(".", ",")}
            </Text>
          )}
        </Flex>

        {/* Size selector */}
        <Flex wrap="wrap" gap={1} mb={2}>
          {product.sizes.map(s => {
            const isSelected = selectedSizes.has(s.id);
            const inCart     = getQty(product.id, s.id);
            return (
              <Box
                key={s.id}
                as="button"
                px={1.5}
                py={0.5}
                fontSize="xs"
                borderRadius="md"
                border="1.5px solid"
                borderColor={isSelected ? "blue.400" : borderColor}
                bg={isSelected ? blueActiveBg : "transparent"}
                color={isSelected ? "white" : mutedColor}
                onClick={() => toggleSize(s.id)}
                fontWeight={isSelected ? "bold" : "normal"}
                transition="all 0.1s"
                position="relative"
                _dark={{
                  bg: isSelected ? blueActiveBg : "transparent",
                  color: isSelected ? "white" : mutedColor,
                }}
              >
                {s.name}
                {inCart > 0 && (
                  <Box
                    as="span"
                    position="absolute"
                    top="-5px"
                    right="-5px"
                    w="14px"
                    h="14px"
                    bg="green.400"
                    borderRadius="full"
                    fontSize="8px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    color="white"
                    fontWeight="black"
                    lineHeight={1}
                  >
                    {inCart}
                  </Box>
                )}
              </Box>
            );
          })}
        </Flex>

        {/* Qty stepper + Add button */}
        <Flex gap={1} align="center">
          <Flex
            align="center"
            bg={stepperBg}
            borderRadius="lg"
            overflow="hidden"
            flexShrink={0}
            h="28px"
          >
            <Box
              as="button"
              px={2} h="full"
              display="flex" alignItems="center" justifyContent="center"
              fontSize="md" fontWeight="bold" color={mutedColor}
              onClick={() => changeAddQty(-1)}
              _hover={{ bg: "gray.200", _dark: { bg: "gray.600" } }}
              cursor={addQty <= 1 ? "not-allowed" : "pointer"}
              opacity={addQty <= 1 ? 0.4 : 1}
            >
              −
            </Box>
            <Text fontSize="sm" fontWeight="bold" px={2} minW="22px" textAlign="center" userSelect="none">
              {addQty}
            </Text>
            <Box
              as="button"
              px={2} h="full"
              display="flex" alignItems="center" justifyContent="center"
              fontSize="sm" fontWeight="bold" color={mutedColor}
              onClick={() => changeAddQty(1)}
              _hover={{ bg: "gray.200", _dark: { bg: "gray.600" } }}
            >
              +
            </Box>
          </Flex>

          <Button
            size="xs" flex={1} colorScheme="blue" variant="outline"
            borderRadius="lg" h="28px"
            onClick={handleAdd}
            isDisabled={selectedCount === 0}
            fontSize="xs" px={1}
          >
            {totalInCart > 0
              ? `+${addQty} em ${selectedCount} tam.`
              : `+ Adicionar${selectedCount < product.sizes.length ? ` (${selectedCount})` : " tudo"}`
            }
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}
