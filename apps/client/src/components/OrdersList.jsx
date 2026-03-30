import { useState, useEffect, useCallback } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Spinner,
  Text,
  useColorModeValue,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";
import { fetchOrders, fetchOrderById, updateOrderStatus, downloadOrderPdf, deleteOrder as apiDeleteOrder, integrateOrderSisplan } from "../api";
import NewOrder from "./NewOrder";

const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_LABELS = {
  pedido:    { label: "Pedido",    color: "blue"   },
  orcamento: { label: "Orçamento", color: "purple" },
};

const STATUS_LABELS = {
  rascunho:  { label: "Rascunho",  color: "gray"   },
  enviado:   { label: "Enviado",   color: "orange" },
  concluido: { label: "Concluído", color: "green"  },
  cancelado: { label: "Cancelado", color: "red"    },
};

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function groupItemsByProduct(items) {
  const map = {};
  items.forEach(item => {
    const key = item.product_name;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return map;
}

export default function OrdersList() {
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selected, setSelected]     = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [integrating, setIntegrating] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const cardBg      = useColorModeValue("white", "gray.750");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const mutedColor  = useColorModeValue("gray.500", "gray.400");
  const rowBg       = useColorModeValue("gray.50", "gray.700");

  const load = useCallback(() => {
    setLoading(true);
    fetchOrders({ search: search.trim() || undefined, type: filterType || undefined, status: filterStatus || undefined })
      .then(setOrders)
      .catch(err => toast({ status: "error", description: err.message, duration: 3000 }))
      .finally(() => setLoading(false));
  }, [search, filterType, filterStatus]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function openDetail(order) {
    setSelected(order);
    onOpen();
    // Load full order with items
    setDetailLoading(true);
    try {
      const full = await fetchOrderById(order.id);
      setSelected(full);
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleOpenPdf() {
    if (!selected) return;
    try {
      await downloadOrderPdf(selected);
    } catch {
      toast({ status: "error", description: "Erro ao gerar PDF.", duration: 3000 });
    }
  }

  async function handleConvertToOrder() {
    if (!selected) return;
    try {
      const updated = await updateOrderStatus(selected.id, { status: "enviado", type: "pedido" });
      setSelected(updated);
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      toast({ status: "success", description: "Convertido para pedido.", duration: 2000 });
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm("Tem certeza que deseja excluir este orçamento?")) return;
    try {
      await apiDeleteOrder(selected.id);
      setOrders(prev => prev.filter(o => o.id !== selected.id));
      setSelected(null);
      toast({ status: "success", description: "Orçamento excluído.", duration: 2000 });
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 3000 });
    }
  }

  async function handleIntegrate() {
    if (!selected) return;
    if (!window.confirm("Confirma a integração deste pedido no Sisplan?")) return;
    setIntegrating(true);
    try {
      const result = await integrateOrderSisplan(selected.id);
      if (result.success) {
        toast({ status: "success", description: `Pedido integrado no Sisplan (${result.numero})`, duration: 5000 });
        setSelected({ ...selected, sisplan_order_id: result.numero });
        setOrders(prev => prev.map(o => o.id === selected.id ? { ...o, sisplan_order_id: result.numero } : o));
      } else {
        toast({ status: "error", description: result.errors?.join(", ") || "Erro na integração", duration: 5000 });
      }
    } catch (err) {
      toast({ status: "error", description: err.message, duration: 5000 });
    } finally {
      setIntegrating(false);
    }
  }

  const customer = (order) => order.customer_snapshot || {};

  return (
    <Box maxW="960px" mx="auto" px={{ base: 0, md: 4 }} py={{ base: 2, md: 6 }}>
      {/* Header */}
      <Flex align="center" justify="space-between" mb={4} px={{ base: 1, md: 0 }}>
        <Box>
          <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="bold">Pedidos e Orçamentos</Text>
          <Text fontSize="xs" color={mutedColor}>{orders.length} registro{orders.length !== 1 ? "s" : ""}</Text>
        </Box>
      </Flex>

      {/* Filters */}
      <SimpleGrid columns={{ base: 1, sm: 3 }} gap={2} mb={4}>
        <InputGroup size="sm">
          <InputLeftElement pointerEvents="none"><SearchIcon color={mutedColor} /></InputLeftElement>
          <Input
            placeholder="Código, cliente ou pedido..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            borderRadius="lg"
          />
        </InputGroup>
        <Select size="sm" borderRadius="lg" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="pedido">Pedidos</option>
          <option value="orcamento">Orçamentos</option>
        </Select>
        <Select size="sm" borderRadius="lg" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="enviado">Enviado</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
        </Select>
      </SimpleGrid>

      {/* List */}
      {loading ? (
        <Flex justify="center" py={16}><Spinner color="blue.500" /></Flex>
      ) : orders.length === 0 ? (
        <Box py={16} textAlign="center" color={mutedColor}>
          <Text fontSize="2xl" mb={2}>📋</Text>
          <Text>Nenhum registro encontrado.</Text>
        </Box>
      ) : (
        <VStack spacing={3} align="stretch">
          {orders.map(order => {
            // Se tem sisplan_order_id, é PEDIDO independente do type original
            const isIntegrated = !!order.sisplan_order_id;
            const typeInfo   = isIntegrated
              ? { label: "Pedido", color: "blue" }
              : (TYPE_LABELS[order.type] || { label: order.type, color: "gray" });
            const statusInfo = isIntegrated
              ? { label: "Integrado", color: "green" }
              : (STATUS_LABELS[order.status] || { label: order.status, color: "gray" });
            const c = customer(order);
            return (
              <Box
                key={order.id}
                bg={cardBg}
                borderRadius="xl"
                border="1px solid"
                borderColor={borderColor}
                p={4}
                boxShadow="sm"
                cursor="pointer"
                onClick={() => openDetail(order)}
                _hover={{ borderColor: "blue.300", boxShadow: "md" }}
                transition="all 0.15s"
              >
                <Flex justify="space-between" align="flex-start">
                  <Box flex={1} mr={3}>
                    <HStack spacing={2} mb={0.5}>
                      {c.sisplan_id && (
                        <Badge colorScheme="gray" fontSize="xs" fontFamily="mono" flexShrink={0}>
                          {c.sisplan_id}
                        </Badge>
                      )}
                      <Text fontWeight="semibold" fontSize="sm" noOfLines={1}>
                        {c.fantasy_name || c.company_name || "—"}
                      </Text>
                    </HStack>
                    {c.fantasy_name && c.company_name && (
                      <Text fontSize="xs" color={mutedColor} noOfLines={1}>{c.company_name}</Text>
                    )}
                    <HStack mt={1} spacing={2} flexWrap="wrap">
                      <Text fontSize="xs" color={mutedColor}>{formatDate(order.created_at)}</Text>
                      {isIntegrated && (
                        <Badge colorScheme="green" fontSize="xs" fontFamily="mono">
                          ERP: {order.sisplan_order_id}
                        </Badge>
                      )}
                    </HStack>
                    {order.created_by_name && (
                      <Text fontSize="xs" color={mutedColor}>Rep.: {order.created_by_name}</Text>
                    )}
                  </Box>

                  <VStack align="flex-end" spacing={1} flexShrink={0}>
                    <HStack spacing={1}>
                      <Badge colorScheme={typeInfo.color} fontSize="xs">{typeInfo.label}</Badge>
                      <Badge colorScheme={statusInfo.color} fontSize="xs">{statusInfo.label}</Badge>
                    </HStack>
                    <Text fontWeight="bold" color="blue.500" fontSize="sm">
                      R$ {fmtBRL(order.total)}
                    </Text>
                    <Text fontSize="xs" color={mutedColor}>
                      {order.item_count} item{order.item_count != 1 ? "s" : ""}
                    </Text>
                  </VStack>
                </Flex>
              </Box>
            );
          })}
        </VStack>
      )}

      {/* Edit Modal */}
      <Modal isOpen={!!editingOrder} onClose={() => setEditingOrder(null)} size="full" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius={0}>
          <ModalHeader pb={2} fontSize="md">
            ✏️ Editando {editingOrder?.type === "pedido" ? "Pedido" : "Orçamento"} #{editingOrder?.id}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody p={0} overflowY="auto">
            {editingOrder && (
              <NewOrder
                initialOrder={editingOrder}
                onSaved={(order) => {
                  setEditingOrder(null);
                  if (order) {
                    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...order } : o));
                  }
                }}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "xl" }} scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius={{ base: 0, md: "xl" }}>
          {selected && (
            <>
              <ModalHeader pb={2}>
                {(() => {
                  const integrated = !!selected.sisplan_order_id;
                  const typeLabel = integrated ? "Pedido" : (selected.type === "pedido" ? "Pedido" : "Orçamento");
                  const stLabel = integrated
                    ? { label: "Integrado", color: "green" }
                    : (STATUS_LABELS[selected.status] || { label: selected.status, color: "gray" });
                  return (
                    <VStack align="start" spacing={1}>
                      <HStack spacing={2} flexWrap="wrap">
                        <Text fontSize="md">{typeLabel} #{selected.id}</Text>
                        <Badge colorScheme={stLabel.color}>{stLabel.label}</Badge>
                      </HStack>
                      {integrated && (
                        <Text fontSize="sm" color="green.600" fontWeight="semibold">
                          Pedido no ERP: {selected.sisplan_order_id}
                        </Text>
                      )}
                    </VStack>
                  );
                })()}
              </ModalHeader>
              <ModalCloseButton />
              <ModalBody px={4} pt={0}>
                {detailLoading ? (
                  <Flex justify="center" py={10}><Spinner color="blue.500" /></Flex>
                ) : (
                  <>
                    {/* Customer info */}
                    {(() => {
                      const c = customer(selected);
                      return (
                        <Box bg={rowBg} borderRadius="lg" p={3} mb={4}>
                          <HStack spacing={2} mb={0.5}>
                            {c.sisplan_id && (
                              <Badge colorScheme="gray" fontSize="xs" fontFamily="mono">{c.sisplan_id}</Badge>
                            )}
                            <Text fontSize="sm" fontWeight="semibold">{c.fantasy_name || c.company_name || "—"}</Text>
                          </HStack>
                          <Text fontSize="xs" color={mutedColor}>{c.company_name}</Text>
                          {c.cnpj && <Text fontSize="xs" color={mutedColor}>{c.cnpj}</Text>}
                          <HStack mt={1} spacing={3} flexWrap="wrap">
                            <Text fontSize="xs" color={mutedColor}>Tabela: <strong>{selected.price_table}</strong></Text>
                            <Text fontSize="xs" color={mutedColor}>{formatDate(selected.created_at)}</Text>
                            {selected.created_by_name && (
                              <Text fontSize="xs" color={mutedColor}>Rep.: <strong>{selected.created_by_name}</strong></Text>
                            )}
                          </HStack>
                        </Box>
                      );
                    })()}

                    {/* Items grouped by product */}
                    <Text fontSize="sm" fontWeight="semibold" mb={2}>Itens</Text>
                    <VStack spacing={3} align="stretch" mb={4}>
                      {Object.entries(groupItemsByProduct(selected.items || [])).map(([productName, sizes]) => {
                        const productTotal = sizes.reduce((s, i) => s + Number(i.unit_price) * i.qty, 0);
                        const photoUrl = sizes[0]?.photo_url;
                        return (
                          <Box
                            key={productName}
                            borderRadius="lg"
                            border="1px solid"
                            borderColor={borderColor}
                            overflow="hidden"
                          >
                            <Flex
                              justify="space-between"
                              align="center"
                              px={3} py={2}
                              bg={rowBg}
                              gap={2}
                            >
                              <HStack spacing={2} flex={1} minW={0}>
                                {photoUrl && (
                                  <Image
                                    src={photoUrl}
                                    alt={productName}
                                    boxSize="36px"
                                    objectFit="contain"
                                    borderRadius="md"
                                    bg="white"
                                    flexShrink={0}
                                  />
                                )}
                                <Text fontSize="sm" fontWeight="semibold" noOfLines={2}>{productName}</Text>
                              </HStack>
                              <Text fontSize="sm" fontWeight="bold" color="blue.500" flexShrink={0}>
                                R$ {fmtBRL(productTotal)}
                              </Text>
                            </Flex>

                            <Flex px={3} py={2} gap={3} flexWrap="wrap">
                              {sizes.map((item, idx) => (
                                <VStack key={idx} spacing={0.5} align="center" minW="40px">
                                  <Badge colorScheme="blue" fontSize="xs" px={2}>{item.size_name}</Badge>
                                  <Text fontSize="sm" fontWeight="bold">×{item.qty}</Text>
                                  <Text fontSize="xs" color={mutedColor}>
                                    R$ {fmtBRL(Number(item.unit_price) * item.qty)}
                                  </Text>
                                </VStack>
                              ))}
                            </Flex>
                          </Box>
                        );
                      })}
                    </VStack>

                    {selected.notes && (
                      <Box mb={4}>
                        <Text fontSize="sm" fontWeight="semibold" mb={1}>Observações</Text>
                        <Text fontSize="sm" color={mutedColor}>{selected.notes}</Text>
                      </Box>
                    )}

                    {/* Total */}
                    <Flex justify="space-between" align="center" p={3} bg={rowBg} borderRadius="lg">
                      <Text fontWeight="bold">Total</Text>
                      <Text fontSize="xl" fontWeight="bold" color="blue.500">
                        R$ {fmtBRL(selected.total)}
                      </Text>
                    </Flex>
                  </>
                )}
              </ModalBody>

              <ModalFooter flexDirection="column" gap={2} pb={{ base: 8, md: 4 }}>
                {selected.status === "rascunho" && selected.type === "orcamento" && (
                  <Button w="full" colorScheme="blue" size="md" borderRadius="xl" onClick={handleConvertToOrder}>
                    Converter para Pedido
                  </Button>
                )}
                {(selected.status === "enviado" || selected.status === "concluido") && !selected.sisplan_order_id && (
                  <Button
                    w="full" colorScheme="green" size="md" borderRadius="xl"
                    onClick={handleIntegrate}
                    isLoading={integrating}
                    loadingText="Integrando..."
                  >
                    Integrar Sisplan
                  </Button>
                )}
                <SimpleGrid columns={selected.status === "rascunho" ? 4 : 2} gap={2} w="full">
                  <Button
                    variant="outline" colorScheme="gray" size="md" borderRadius="xl"
                    onClick={handleOpenPdf}
                  >
                    📄 PDF
                  </Button>
                  {selected.status === "rascunho" && (
                    <Button
                      variant="outline" colorScheme="blue" size="md" borderRadius="xl"
                      isDisabled={detailLoading}
                      onClick={() => { onClose(); setEditingOrder(selected); }}
                    >
                      ✏️ Editar
                    </Button>
                  )}
                  {selected.status === "rascunho" && (
                    <Button
                      variant="outline" colorScheme="red" size="md" borderRadius="xl"
                      onClick={handleDelete}
                    >
                      🗑 Excluir
                    </Button>
                  )}
                  <Button variant="ghost" size="md" borderRadius="xl" onClick={onClose}>Fechar</Button>
                </SimpleGrid>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </Box>
  );
}
