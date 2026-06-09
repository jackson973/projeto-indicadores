import { useEffect, useRef, useState, useCallback } from "react";
import {
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
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  SimpleGrid,
  Spinner,
  Tag,
  TagLabel,
  TagCloseButton,
  Text,
  Tooltip,
  VStack,
  Wrap,
  WrapItem,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon, EditIcon, SearchIcon } from "@chakra-ui/icons";
import BarcodeScanner from "./BarcodeScanner";
import useAppToast from "../hooks/useAppToast";
import {
  fetchStockProducts,
  fetchStockProduct,
  createStockProduct,
  updateStockProduct,
  deleteStockProduct,
  uploadStockProductPhoto,
  addStockVariantBarcodes,
  removeStockBarcode,
} from "../api";

// Tamanhos sugeridos para montar a grade rapidamente
const PRESET_SIZES = ["RN", "P", "M", "G", "GG", "1", "2", "4", "6", "8", "10", "12"];

const emptyDraft = () => ({
  id: null,
  codigo: "",
  descricao: "",
  familia: "",
  image_url: null,
  _photoFile: null,
  _photoPreview: null,
  variants: [],
});

export default function StockProductsManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [newSize, setNewSize] = useState("");
  // Variante atualmente recebendo bipagem (id) e digitação de barcode por variante
  const [scanVariant, setScanVariant] = useState(null);
  const [barcodeInputs, setBarcodeInputs] = useState({});
  const fileRef = useRef(null);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isScanOpen, onOpen: onScanOpen, onClose: onScanClose } = useDisclosure();
  const toast = useAppToast();

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.500", "gray.400");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await fetchStockProducts({ search }));
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar produtos", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // ─── Modal abrir/editar ──────────────────────────────────────────────────

  function openCreate() {
    setDraft(emptyDraft());
    setNewSize("");
    setBarcodeInputs({});
    onOpen();
  }

  function openEdit(p) {
    setDraft({
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      familia: p.familia || "",
      image_url: p.image_url,
      _photoFile: null,
      _photoPreview: null,
      variants: (p.variants || []).map(v => ({
        id: v.id,
        tamanho: v.tamanho,
        codigo: v.codigo,
        min_stock: v.min_stock ?? 0,
        balance: v.balance ?? 0,
        barcodes: v.barcodes || [],
      })),
    });
    setNewSize("");
    setBarcodeInputs({});
    onOpen();
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDraft(d => ({ ...d, _photoFile: file, _photoPreview: URL.createObjectURL(file) }));
  }

  // ─── Grade (variantes) ───────────────────────────────────────────────────

  function addSize(size) {
    const tamanho = String(size).trim().toUpperCase();
    if (!tamanho) return;
    setDraft(d => {
      if (d.variants.some(v => v.tamanho.toUpperCase() === tamanho)) return d;
      const codigo = d.codigo ? `${d.codigo}-${tamanho}` : tamanho;
      return { ...d, variants: [...d.variants, { tamanho, codigo, min_stock: 0, balance: 0, barcodes: [] }] };
    });
    setNewSize("");
  }

  function removeSize(idx) {
    setDraft(d => ({ ...d, variants: d.variants.filter((_, i) => i !== idx) }));
  }

  function setVariantField(idx, field, value) {
    setDraft(d => ({
      ...d,
      variants: d.variants.map((v, i) => (i === idx ? { ...v, [field]: value } : v)),
    }));
  }

  // Recalcula os códigos exibidos quando o código base muda (apenas para variantes novas/sem barras lançadas)
  function handleCodigoChange(value) {
    setDraft(d => ({
      ...d,
      codigo: value,
      variants: d.variants.map(v => ({ ...v, codigo: value ? `${value}-${v.tamanho}` : v.tamanho })),
    }));
  }

  // ─── Salvar produto ──────────────────────────────────────────────────────

  async function handleSave() {
    if (!draft.codigo.trim() || !draft.descricao.trim()) {
      toast({ status: "warning", title: "Informe código e descrição" });
      return;
    }
    if (draft.variants.length === 0) {
      toast({ status: "warning", title: "Adicione ao menos um tamanho à grade" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        codigo: draft.codigo.trim(),
        descricao: draft.descricao.trim(),
        familia: draft.familia.trim(),
        variants: draft.variants.map(v => ({ tamanho: v.tamanho, min_stock: Number(v.min_stock) || 0 })),
      };
      let saved;
      if (draft.id) {
        saved = await updateStockProduct(draft.id, payload);
      } else {
        saved = await createStockProduct(payload);
      }
      if (draft._photoFile && saved?.id) {
        await uploadStockProductPhoto(saved.id, draft._photoFile);
      }
      toast({ status: "success", title: draft.id ? "Produto atualizado" : "Produto criado" });
      // Reabre em modo edição (carrega variantes com ids p/ lançar códigos de barras)
      const fresh = await fetchStockProduct(saved.id);
      openEdit(fresh);
      load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao salvar", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p) {
    if (!window.confirm(`Inativar o produto ${p.codigo} - ${p.descricao}?`)) return;
    try {
      await deleteStockProduct(p.id);
      toast({ status: "success", title: "Produto inativado" });
      load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao inativar", description: e.message });
    }
  }

  // ─── Códigos de barras (somente em produto já salvo) ──────────────────────

  async function refreshDraftBarcodes() {
    if (!draft.id) return;
    const fresh = await fetchStockProduct(draft.id);
    setDraft(d => ({
      ...d,
      variants: d.variants.map(v => {
        const fv = (fresh.variants || []).find(x => x.id === v.id);
        return fv ? { ...v, barcodes: fv.barcodes || [] } : v;
      }),
    }));
  }

  // Retorna { status, message } para alimentar o beep/feedback do BarcodeScanner
  async function addBarcodeToVariant(variant, code, { silent = false } = {}) {
    const codes = String(code)
      .split(",")
      .map(c => c.trim())
      .filter(Boolean);
    if (codes.length === 0) return { status: "error", message: "Código vazio" };
    try {
      const res = await addStockVariantBarcodes(variant.id, codes);
      const addedCount = res.added?.length || 0;
      const skippedCount = res.skipped?.length || 0;
      if (!silent) {
        if (addedCount === 0) {
          toast({ status: "warning", title: "Nenhum código adicionado",
            description: `${skippedCount} já cadastrado(s)` });
        } else {
          toast({ status: "success",
            title: `${addedCount} código(s) adicionado(s)`,
            description: skippedCount ? `${skippedCount} já cadastrado(s)` : undefined });
        }
      }
      setBarcodeInputs(s => ({ ...s, [variant.id]: "" }));
      await refreshDraftBarcodes();
      return addedCount === 0
        ? { status: "duplicate", message: `${skippedCount} já existe(m)` }
        : { status: "success", message: `${addedCount} → ${variant.tamanho}${skippedCount ? ` (${skippedCount} dup.)` : ""}` };
    } catch (e) {
      if (!silent) toast({ status: "error", title: "Erro ao adicionar código", description: e.message });
      return { status: "error", message: e.message };
    }
  }

  async function handleRemoveBarcode(barcodeId) {
    try {
      await removeStockBarcode(barcodeId);
      await refreshDraftBarcodes();
    } catch (e) {
      toast({ status: "error", title: "Erro ao remover código", description: e.message });
    }
  }

  const handleScan = useCallback(async (code) => {
    if (!scanVariant) return { status: "error", message: "Selecione um tamanho" };
    return addBarcodeToVariant(scanVariant, code, { silent: true });
  }, [scanVariant]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} gap={3} wrap="wrap">
        <Text fontSize="xl" fontWeight="bold">Cadastro de Produtos — Estoque</Text>
        <Button leftIcon={<AddIcon />} colorScheme="blue" onClick={openCreate}>Novo Produto</Button>
      </Flex>

      <InputGroup maxW="360px" mb={4}>
        <InputLeftElement pointerEvents="none"><SearchIcon color={subtle} /></InputLeftElement>
        <Input placeholder="Buscar por código ou descrição" value={search} onChange={e => setSearch(e.target.value)} />
      </InputGroup>

      {loading ? (
        <Flex justify="center" py={10}><Spinner /></Flex>
      ) : products.length === 0 ? (
        <Text color={subtle} py={8} textAlign="center">Nenhum produto cadastrado.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
          {products.map(p => (
            <Box key={p.id} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
              <HStack align="start" spacing={3}>
                <Image
                  src={p.image_url || undefined}
                  fallbackSrc="data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23edf2f7'/%3E%3C/svg%3E"
                  alt={p.descricao} boxSize="64px" objectFit="cover" borderRadius="md"
                />
                <Box flex="1" minW={0}>
                  <HStack justify="space-between">
                    <Text fontWeight="bold" noOfLines={1}>{p.codigo}</Text>
                    <HStack spacing={1}>
                      <Tooltip label="Editar"><IconButton size="xs" variant="ghost" icon={<EditIcon />} aria-label="Editar" onClick={() => openEdit(p)} /></Tooltip>
                      <Tooltip label="Inativar"><IconButton size="xs" variant="ghost" colorScheme="red" icon={<DeleteIcon />} aria-label="Inativar" onClick={() => handleDelete(p)} /></Tooltip>
                    </HStack>
                  </HStack>
                  <Text fontSize="sm" color={subtle} noOfLines={2}>{p.descricao}</Text>
                  <Wrap mt={2} spacing={1}>
                    {(p.variants || []).map(v => (
                      <WrapItem key={v.id}>
                        <Badge colorScheme={v.balance <= v.min_stock ? "red" : "gray"} variant="subtle">
                          {v.tamanho}: {v.balance}{v.barcodes?.length ? ` · ${v.barcodes.length}📷` : ""}
                        </Badge>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              </HStack>
            </Box>
          ))}
        </SimpleGrid>
      )}

      {/* ── Modal criar/editar ── */}
      <Modal isOpen={isOpen} onClose={onClose} size={{ base: "full", md: "xl" }} scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius={{ base: 0, md: "xl" }}>
          <ModalHeader fontSize="md">{draft.id ? `Editar Produto ${draft.codigo}` : "Novo Produto"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            <VStack align="stretch" spacing={4}>
              {/* Foto */}
              <HStack spacing={4} align="start">
                <Image
                  src={draft._photoPreview || draft.image_url || undefined}
                  fallbackSrc="data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%23edf2f7'/%3E%3C/svg%3E"
                  boxSize="96px" objectFit="cover" borderRadius="md"
                />
                <VStack align="start" spacing={2}>
                  <input type="file" accept="image/*" ref={fileRef} hidden onChange={handlePhotoChange} />
                  <Button size="sm" onClick={() => fileRef.current?.click()}>Selecionar imagem</Button>
                  <Text fontSize="xs" color={subtle}>Imagem do produto (até 5MB).</Text>
                </VStack>
              </HStack>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Código</FormLabel>
                  <Input value={draft.codigo} placeholder="ex: 010" onChange={e => handleCodigoChange(e.target.value)} />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel fontSize="sm">Descrição</FormLabel>
                  <Input value={draft.descricao} placeholder="ex: Trijunto de verão Menina" onChange={e => setDraft(d => ({ ...d, descricao: e.target.value }))} />
                </FormControl>
              </SimpleGrid>

              <FormControl mt={3}>
                <FormLabel fontSize="sm">
                  Família
                  <Text as="span" fontWeight="400" color="gray.500" ml={2}>
                    (agrupa linhas no Dashboard de Separação — ex.: "Soft")
                  </Text>
                </FormLabel>
                <Input value={draft.familia} placeholder="ex: Soft — deixe vazio para usar o 1º termo da descrição"
                  onChange={e => setDraft(d => ({ ...d, familia: e.target.value }))} />
              </FormControl>

              {/* Grade de tamanhos */}
              <Box>
                <FormLabel fontSize="sm" mb={2}>Grade de tamanhos</FormLabel>
                <Wrap spacing={1} mb={2}>
                  {PRESET_SIZES.map(s => (
                    <WrapItem key={s}>
                      <Button size="xs" variant="outline" onClick={() => addSize(s)}>+ {s}</Button>
                    </WrapItem>
                  ))}
                </Wrap>
                <HStack mb={3}>
                  <Input size="sm" maxW="160px" placeholder="Tamanho personalizado" value={newSize}
                    onChange={e => setNewSize(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSize(newSize); } }} />
                  <Button size="sm" onClick={() => addSize(newSize)}>Adicionar</Button>
                </HStack>

                {draft.variants.length === 0 ? (
                  <Text fontSize="sm" color={subtle}>Nenhum tamanho na grade.</Text>
                ) : (
                  <VStack align="stretch" spacing={2}>
                    {draft.variants.map((v, idx) => (
                      <Box key={v.tamanho} borderWidth="1px" borderColor={border} borderRadius="md" p={2}>
                        <HStack justify="space-between" align="center" wrap="wrap" spacing={2}>
                          <HStack spacing={2}>
                            <Badge colorScheme="blue">{v.tamanho}</Badge>
                            <Text fontSize="sm" color={subtle}>{v.codigo}</Text>
                            {draft.id && <Text fontSize="xs" color={subtle}>saldo: {v.balance}</Text>}
                          </HStack>
                          <HStack spacing={2}>
                            <FormControl display="flex" alignItems="center" w="auto">
                              <FormLabel fontSize="xs" mb={0} mr={1}>mín.</FormLabel>
                              <NumberInput size="xs" maxW="72px" min={0} value={v.min_stock}
                                onChange={(_, n) => setVariantField(idx, "min_stock", Number.isNaN(n) ? 0 : n)}>
                                <NumberInputField />
                              </NumberInput>
                            </FormControl>
                            <IconButton size="xs" variant="ghost" colorScheme="red" icon={<DeleteIcon />} aria-label="Remover tamanho" onClick={() => removeSize(idx)} />
                          </HStack>
                        </HStack>

                        {/* Códigos de barras — só após salvar (variante com id) */}
                        {draft.id && v.id ? (
                          <Box mt={2}>
                            <Wrap spacing={1} mb={2}>
                              {(v.barcodes || []).length === 0 && <Text fontSize="xs" color={subtle}>Sem códigos de barras.</Text>}
                              {(v.barcodes || []).map(b => (
                                <WrapItem key={b.id}>
                                  <Tag size="sm" variant="subtle" colorScheme="purple">
                                    <TagLabel>{b.barcode}</TagLabel>
                                    <TagCloseButton onClick={() => handleRemoveBarcode(b.id)} />
                                  </Tag>
                                </WrapItem>
                              ))}
                            </Wrap>
                            <HStack>
                              <Input size="xs" maxW="260px" placeholder="Código(s) — separar por vírgula"
                                value={barcodeInputs[v.id] || ""}
                                onChange={e => setBarcodeInputs(s => ({ ...s, [v.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addBarcodeToVariant(v, barcodeInputs[v.id]); } }} />
                              <Button size="xs" onClick={() => addBarcodeToVariant(v, barcodeInputs[v.id])}>Add</Button>
                              <Button size="xs" colorScheme="purple" variant="outline"
                                onClick={() => { setScanVariant(v); onScanOpen(); }}>Bipar</Button>
                            </HStack>
                          </Box>
                        ) : (
                          <Text fontSize="xs" color={subtle} mt={2}>Salve o produto para lançar os códigos de barras.</Text>
                        )}
                      </Box>
                    ))}
                  </VStack>
                )}
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button colorScheme="blue" isLoading={saving} onClick={handleSave}>
              {draft.id ? "Salvar" : "Criar"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Scanner de códigos de barras (BarcodeScanner é inline → embutido num modal) ── */}
      <Modal isOpen={isScanOpen} onClose={() => { onScanClose(); setScanVariant(null); }} size={{ base: "full", md: "md" }}>
        <ModalOverlay />
        <ModalContent borderRadius={{ base: 0, md: "xl" }}>
          <ModalHeader fontSize="md">
            {scanVariant ? `Bipar códigos — ${draft.codigo}-${scanVariant.tamanho}` : "Bipar código"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            {isScanOpen && <BarcodeScanner active={isScanOpen} onScan={handleScan} continuous />}
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => { onScanClose(); setScanVariant(null); }}>Concluir</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
