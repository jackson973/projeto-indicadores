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
  Image,
  Badge,
  Link,
  Spinner,
  Center,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Checkbox,
  Tag,
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
  SearchIcon,
  ExternalLinkIcon
} from "@chakra-ui/icons";
import SearchableSelect from "./SearchableSelect";
import {
  fetchProductGroups,
  createProductGroup,
  updateProductGroup,
  deleteProductGroup,
  fetchProductGroupItems,
  addProductGroupItem,
  addProductGroupItemsBatch,
  removeProductGroupItem,
  removeProductGroupItemsBatch,
  fetchAllAdsWithGroup,
  fetchProductVariations,
} from "../api";

const ProductGroups = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupItems, setGroupItems] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const createModal = useDisclosure();

  const [allAds, setAllAds] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [loadingAllAds, setLoadingAllAds] = useState(false);
  const [addingAd, setAddingAd] = useState(null);
  const [batchAdding, setBatchAdding] = useState(false);

  const [groupFilter, setGroupFilter] = useState("");
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [removingBatch, setRemovingBatch] = useState(false);
  const [selectedSearchResults, setSelectedSearchResults] = useState(new Set());

  const [showUngrouped, setShowUngrouped] = useState(false);
  const [ungroupedSearch, setUngroupedSearch] = useState("");
  const [assignTargetGroupId, setAssignTargetGroupId] = useState("");
  const [assigningAd, setAssigningAd] = useState(null);
  const [selectedUngrouped, setSelectedUngrouped] = useState(new Set());
  const [batchAssigning, setBatchAssigning] = useState(false);

  // Variation filter modal
  const variationModal = useDisclosure();
  const [variationAd, setVariationAd] = useState(null); // ad being added
  const [variationPrefixes, setVariationPrefixes] = useState([]); // available prefixes
  const [selectedVariation, setSelectedVariation] = useState(null); // chosen filter (null = all)
  const [variationTargetGroupId, setVariationTargetGroupId] = useState(null); // which group to add to
  const [loadingVariations, setLoadingVariations] = useState(false);
  const [variationQueue, setVariationQueue] = useState([]); // queue of ads waiting for variation pick
  const [batchAddedCount, setBatchAddedCount] = useState(0); // counter for batch progress

  const toast = useToast();
  const isMobile = useBreakpointValue({ base: true, md: false });

  const cardBg = useColorModeValue("white", "gray.800");
  const headerBg = useColorModeValue("gray.50", "gray.700");
  const selectedBg = useColorModeValue("blue.50", "blue.900");
  const hoverBg = useColorModeValue("gray.50", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const searchResultBg = useColorModeValue("white", "gray.700");
  const searchResultHover = useColorModeValue("gray.100", "gray.600");

  const loadGroups = async () => {
    setLoadingGroups(true);
    try { setGroups(await fetchProductGroups()); }
    catch { toast({ title: "Erro ao carregar grupos.", status: "error", duration: 3000 }); }
    finally { setLoadingGroups(false); }
  };

  const loadGroupItems = async (groupId) => {
    setLoadingItems(true);
    try { setGroupItems(await fetchProductGroupItems(groupId)); }
    catch { toast({ title: "Erro ao carregar itens do grupo.", status: "error", duration: 3000 }); }
    finally { setLoadingItems(false); }
  };

  const loadAllAds = async () => {
    setLoadingAllAds(true);
    try { setAllAds(await fetchAllAdsWithGroup()); }
    catch { toast({ title: "Erro ao carregar anúncios.", status: "error", duration: 3000 }); }
    finally { setLoadingAllAds(false); }
  };

  useEffect(() => { loadGroups(); loadAllAds(); }, []);

  useEffect(() => {
    if (selectedGroupId) { loadGroupItems(selectedGroupId); setSelectedItems(new Set()); setGroupFilter(""); }
    else { setGroupItems([]); }
  }, [selectedGroupId]);

  // Keys already in the selected group (ad_name column stores store_variation_key)
  const groupKeys = useMemo(() => new Set(groupItems.map((i) => i.ad_name)), [groupItems]);

  // Unique key for each group item (includes variation_filter)
  const itemKey = (i) => `${i.ad_name}::\x01${i.variation_filter || ""}`;

  // Map store_variation_key → display info from allAds
  const adsMap = useMemo(() => {
    const m = new Map();
    allAds.forEach((a) => m.set(a.store_variation_key, a));
    return m;
  }, [allAds]);

  const getAdDisplay = (key) => {
    const a = adsMap.get(key);
    return a ? a.ad_name : key;
  };
  const getAdLoja = (key) => {
    const a = adsMap.get(key);
    return a ? a.loja : null;
  };

  const getAdThumbnail = (key) => {
    const a = adsMap.get(key);
    return a ? a.thumbnail : null;
  };

  const getMarketplaceUrl = (ad) => {
    if (ad.product_url) return ad.product_url;
    const platform = (ad.platform || "").toLowerCase();
    const name = ad.ad_name || "";
    if (platform.includes("shopee")) {
      const slug = name.replace(/\s+/g, "-").replace(/[^\w-]/g, "");
      const sku = ad.sku || "";
      // Shopee SKU numérico longo = item ID
      if (/^\d{10,}$/.test(sku)) return `https://shopee.com.br/${slug}-i.${sku}`;
      return `https://shopee.com.br/search?keyword=${encodeURIComponent(name)}`;
    }
    if (platform.includes("mercado")) {
      return `https://www.mercadolivre.com.br/jm/search?as_word=${encodeURIComponent(name)}`;
    }
    return null;
  };

  const filteredGroupItems = useMemo(() => {
    if (!groupFilter.trim()) return groupItems;
    const term = groupFilter.toLowerCase();
    return groupItems.filter((i) => {
      const display = getAdDisplay(i.ad_name);
      return display.toLowerCase().includes(term);
    });
  }, [groupItems, groupFilter, adsMap]);

  // Deduplicate allAds by store_variation_key (backend returns multiple rows per ad if multiple associations)
  const uniqueAds = useMemo(() => {
    const map = new Map();
    for (const a of allAds) {
      const existing = map.get(a.store_variation_key);
      if (!existing) {
        map.set(a.store_variation_key, {
          ...a,
          _associations: a.group_id ? [{ group_id: a.group_id, group_name: a.group_name, variation_filter: a.variation_filter }] : [],
          _variationCount: a.variation_count || 0,
        });
      } else {
        if (a.group_id) existing._associations.push({ group_id: a.group_id, group_name: a.group_name, variation_filter: a.variation_filter });
        if (!existing.thumbnail && a.thumbnail) existing.thumbnail = a.thumbnail;
      }
    }
    return [...map.values()];
  }, [allAds]);

  // Fully grouped when:
  // 1. Has association WITHOUT variation_filter (= "all variations" selected), OR
  // 2. All variation prefixes are covered by associations with variation_filter
  const isFullyGrouped = (ad) => {
    if (!ad._associations || ad._associations.length === 0) return false;
    // Has "all variations" association
    if (ad._associations.some((a) => !a.variation_filter)) return true;
    // Has <= 1 variation prefix — no split needed, but has association
    if (ad._variationCount <= 1) return ad._associations.length > 0;
    // All variation prefixes covered
    const assignedCount = ad._associations.filter((a) => a.variation_filter).length;
    return assignedCount >= ad._variationCount;
  };

  const ungroupedAds = useMemo(() => {
    const term = ungroupedSearch.toLowerCase().trim();
    return uniqueAds.filter((a) => {
      if (isFullyGrouped(a)) return false;
      if (!a._associations || a._associations.length === 0) {
        // No associations at all — ungrouped
      } else {
        // Has some associations but not fully grouped — still show
      }
      if (!term) return true;
      return (a.ad_name || "").toLowerCase().includes(term) || (a.loja || "").toLowerCase().includes(term);
    });
  }, [uniqueAds, ungroupedSearch]);

  const filteredAds = useMemo(() => {
    if (!productSearch.trim()) return [];
    const term = productSearch.toLowerCase();
    return uniqueAds
      .filter((a) => !groupKeys.has(a.store_variation_key) &&
        ((a.ad_name || "").toLowerCase().includes(term) || (a.loja || "").toLowerCase().includes(term)))
      .slice(0, 50);
  }, [productSearch, uniqueAds, groupKeys]);

  // ── CRUD ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      await createProductGroup(newGroupName.trim());
      setNewGroupName(""); createModal.onClose();
      toast({ title: "Grupo criado com sucesso.", status: "success", duration: 3000 });
      await loadGroups();
    } catch (err) { toast({ title: err.message || "Erro ao criar grupo.", status: "error", duration: 3000 }); }
    finally { setCreating(false); }
  };

  const handleUpdate = async (id) => {
    if (!editingName.trim()) return;
    try {
      await updateProductGroup(id, editingName.trim());
      setEditingId(null);
      toast({ title: "Grupo atualizado.", status: "success", duration: 3000 });
      await loadGroups();
    } catch (err) { toast({ title: err.message || "Erro ao atualizar grupo.", status: "error", duration: 3000 }); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteProductGroup(id);
      if (selectedGroupId === id) setSelectedGroupId(null);
      toast({ title: "Grupo excluído.", status: "success", duration: 3000 });
      await loadGroups();
    } catch (err) { toast({ title: err.message || "Erro ao excluir grupo.", status: "error", duration: 4000 }); }
  };

  // ── Add/remove items (ad_name stores store_variation_key) ─────────────

  // Check if ad has multiple variation prefixes before adding
  const checkVariationsAndAdd = async (ad, targetGroupId) => {
    if (!targetGroupId) return;
    setAddingAd(ad.store_variation_key);
    try {
      // Extract store_key and ad_name from store_variation_key
      const svk = ad.store_variation_key;
      const sepIdx = svk.indexOf("|||");
      if (sepIdx > -1) {
        const storeKey = svk.substring(0, sepIdx);
        const adName = svk.substring(sepIdx + 3);
        const prefixes = await fetchProductVariations(storeKey, adName);
        if (prefixes && prefixes.length > 1) {
          // Has multiple variations — show modal to pick
          setVariationAd(ad);
          setVariationPrefixes(prefixes);
          setSelectedVariation(null);
          setVariationTargetGroupId(targetGroupId);
          variationModal.onOpen();
          setAddingAd(null);
          return;
        }
      }
      // No variations or single variation — add directly
      await addProductGroupItem(targetGroupId, ad.store_variation_key, null);
      await loadGroupItems(selectedGroupId || targetGroupId); await loadGroups(); await loadAllAds();
    } catch (err) { toast({ title: err.message || "Erro ao adicionar.", status: "error", duration: 3000 }); }
    finally { setAddingAd(null); }
  };

  const handleAddItem = (ad) => checkVariationsAndAdd(ad, selectedGroupId);

  // Process next ad in the variation queue
  const processVariationQueue = async (queue, targetGroupId) => {
    if (queue.length === 0) {
      // Queue done — refresh
      if (batchAddedCount > 0 || true) {
        await loadGroupItems(selectedGroupId || targetGroupId);
        await loadGroups();
        await loadAllAds();
      }
      return;
    }
    const { ad, prefixes } = queue[0];
    setVariationAd(ad);
    setVariationPrefixes(prefixes);
    setSelectedVariation(null);
    setVariationTargetGroupId(targetGroupId);
    setVariationQueue(queue.slice(1));
    variationModal.onOpen();
  };

  const handleConfirmVariation = async () => {
    if (!variationAd || !variationTargetGroupId) return;
    setLoadingVariations(true);
    try {
      await addProductGroupItem(variationTargetGroupId, variationAd.store_variation_key, selectedVariation);
      setBatchAddedCount((c) => c + 1);
      variationModal.onClose();
      // Process next in queue
      if (variationQueue.length > 0) {
        setTimeout(() => processVariationQueue(variationQueue, variationTargetGroupId), 200);
      } else {
        // All done — refresh
        await loadGroupItems(selectedGroupId || variationTargetGroupId); await loadGroups(); await loadAllAds();
        setBatchAddedCount(0);
      }
    } catch (err) { toast({ title: err.message || "Erro ao adicionar.", status: "error", duration: 3000 }); }
    finally { setLoadingVariations(false); }
  };

  // Batch add with variation detection
  const handleBatchWithVariations = async (ads, targetGroupId) => {
    const directItems = []; // ads without variations — add directly
    const withVariations = []; // ads with variations — queue for modal

    for (const ad of ads) {
      const svk = ad.store_variation_key;
      const sepIdx = svk.indexOf("|||");
      if (sepIdx > -1) {
        const storeKey = svk.substring(0, sepIdx);
        const adName = svk.substring(sepIdx + 3);
        try {
          const prefixes = await fetchProductVariations(storeKey, adName);
          if (prefixes && prefixes.length > 1) {
            withVariations.push({ ad, prefixes });
            continue;
          }
        } catch { /* ignore — treat as no variations */ }
      }
      directItems.push(ad.store_variation_key);
    }

    // Add direct items in batch
    if (directItems.length > 0) {
      await addProductGroupItemsBatch(targetGroupId, directItems);
    }

    if (directItems.length > 0 && withVariations.length === 0) {
      toast({ title: `${directItems.length} anúncio(s) adicionado(s).`, status: "success", duration: 3000 });
    } else if (directItems.length > 0 && withVariations.length > 0) {
      toast({ title: `${directItems.length} adicionado(s). ${withVariations.length} precisam selecionar variação.`, status: "info", duration: 4000 });
    }

    // Process variations queue
    if (withVariations.length > 0) {
      setBatchAddedCount(directItems.length);
      await processVariationQueue(withVariations, targetGroupId);
    } else {
      await loadGroupItems(selectedGroupId || targetGroupId); await loadGroups(); await loadAllAds();
    }
  };

  const handleBatchAdd = async () => {
    if (!selectedGroupId || selectedSearchResults.size === 0) return;
    setBatchAdding(true);
    try {
      const ads = filteredAds.filter((a) => selectedSearchResults.has(a.store_variation_key));
      await handleBatchWithVariations(ads, selectedGroupId);
      setSelectedSearchResults(new Set()); setProductSearch("");
    } catch (err) { toast({ title: err.message || "Erro ao adicionar.", status: "error", duration: 3000 }); }
    finally { setBatchAdding(false); }
  };

  const handleRemoveItem = async (key, variationFilter = null) => {
    if (!selectedGroupId) return;
    try {
      await removeProductGroupItem(selectedGroupId, key, variationFilter);
      toast({ title: "Anúncio removido do grupo.", status: "success", duration: 3000 });
      await loadGroupItems(selectedGroupId); await loadGroups(); await loadAllAds();
    } catch (err) { toast({ title: err.message || "Erro ao remover.", status: "error", duration: 3000 }); }
  };

  const handleBatchRemove = async () => {
    if (!selectedGroupId || selectedItems.size === 0) return;
    setRemovingBatch(true);
    try {
      // selectedItems stores "ad_name::vf" keys — parse back
      const items = Array.from(selectedItems).map((k) => {
        const [adName, vf] = k.split("::\x01");
        return { ad_name: adName, variation_filter: vf || null };
      });
      await removeProductGroupItemsBatch(selectedGroupId, items);
      toast({ title: `${items.length} anúncio(s) removido(s).`, status: "success", duration: 3000 });
      setSelectedItems(new Set());
      await loadGroupItems(selectedGroupId); await loadGroups(); await loadAllAds();
    } catch (err) { toast({ title: err.message || "Erro ao remover.", status: "error", duration: 3000 }); }
    finally { setRemovingBatch(false); }
  };

  const handleAssignToGroup = (ad) => {
    if (!assignTargetGroupId) return;
    checkVariationsAndAdd(ad, parseInt(assignTargetGroupId));
  };

  const handleBatchAssignUngrouped = async () => {
    if (!assignTargetGroupId || selectedUngrouped.size === 0) return;
    setBatchAssigning(true);
    try {
      const ads = ungroupedAds.filter((a) => selectedUngrouped.has(a.store_variation_key));
      await handleBatchWithVariations(ads, parseInt(assignTargetGroupId));
      setSelectedUngrouped(new Set());
    } catch (err) { toast({ title: err.message || "Erro ao adicionar.", status: "error", duration: 3000 }); }
    finally { setBatchAssigning(false); }
  };

  // ── Toggle helpers ────────────────────────────────────────────────────
  const toggleItem = (key, set, setter) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  };

  const toggleAllFiltered = useCallback(() => {
    if (selectedItems.size === filteredGroupItems.length && filteredGroupItems.length > 0)
      setSelectedItems(new Set());
    else setSelectedItems(new Set(filteredGroupItems.map((i) => itemKey(i))));
  }, [filteredGroupItems, selectedItems]);

  const toggleAllSearch = useCallback(() => {
    if (selectedSearchResults.size === filteredAds.length && filteredAds.length > 0)
      setSelectedSearchResults(new Set());
    else setSelectedSearchResults(new Set(filteredAds.map((a) => a.store_variation_key)));
  }, [filteredAds, selectedSearchResults]);

  const toggleAllUngrouped = useCallback(() => {
    if (selectedUngrouped.size === ungroupedAds.length && ungroupedAds.length > 0)
      setSelectedUngrouped(new Set());
    else setSelectedUngrouped(new Set(ungroupedAds.map((a) => a.store_variation_key)));
  }, [ungroupedAds, selectedUngrouped]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <Box>
      <Flex direction={isMobile ? "column" : "row"} gap={4} align="flex-start">
        {/* Left: Groups */}
        <Box bg={cardBg} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={borderColor}
          w={isMobile ? "100%" : "340px"} flexShrink={0}>
          <Flex justify="space-between" align="center" p={4} borderBottomWidth="1px" borderColor={borderColor}>
            <Heading size="sm">Grupos de Produtos</Heading>
            <Button leftIcon={<AddIcon />} size="xs" colorScheme="blue" onClick={createModal.onOpen}>Novo Grupo</Button>
          </Flex>

          {loadingGroups ? (
            <Center p={8}><Spinner /></Center>
          ) : (
            <VStack spacing={0} align="stretch">
              <Flex align="center" px={4} py={2.5} cursor="pointer"
                bg={showUngrouped ? selectedBg : undefined}
                _hover={{ bg: showUngrouped ? selectedBg : hoverBg }}
                borderBottomWidth="1px" borderColor={borderColor}
                onClick={() => { setShowUngrouped(true); setSelectedGroupId(null); setUngroupedSearch(""); setAssignTargetGroupId(""); setSelectedUngrouped(new Set()); }}>
                <Text fontSize="sm" fontWeight={showUngrouped ? "semibold" : "normal"} flex={1}
                  color={ungroupedAds.length > 0 ? "orange.500" : "gray.400"}>Sem grupo</Text>
                <Badge colorScheme={ungroupedAds.length > 0 ? "orange" : "gray"} fontSize="xs" ml={2}>
                  {loadingAllAds ? "..." : ungroupedAds.length}
                </Badge>
              </Flex>

              {groups.map((group) => (
                <Flex key={group.id} align="center" px={4} py={2.5} cursor="pointer"
                  bg={selectedGroupId === group.id ? selectedBg : undefined}
                  _hover={{ bg: selectedGroupId === group.id ? selectedBg : hoverBg }}
                  borderBottomWidth="1px" borderColor={borderColor}
                  onClick={() => { if (editingId !== group.id) { setSelectedGroupId(group.id); setShowUngrouped(false); } }}>
                  <Box flex={1} minW={0}>
                    {editingId === group.id ? (
                      <Input size="sm" value={editingName} onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(group.id); if (e.key === "Escape") setEditingId(null); }}
                        onClick={(e) => e.stopPropagation()} autoFocus />
                    ) : (
                      <Text fontSize="sm" fontWeight={selectedGroupId === group.id ? "semibold" : "normal"} isTruncated>{group.name}</Text>
                    )}
                  </Box>
                  <Badge colorScheme="blue" fontSize="xs" ml={2} flexShrink={0}>{group.product_count ?? 0}</Badge>
                  <HStack spacing={0} ml={2} flexShrink={0} onClick={(e) => e.stopPropagation()}>
                    {editingId === group.id ? (
                      <>
                        <IconButton icon={<CheckIcon />} size="xs" variant="ghost" colorScheme="green" aria-label="Confirmar" onClick={() => handleUpdate(group.id)} />
                        <IconButton icon={<CloseIcon />} size="xs" variant="ghost" aria-label="Cancelar" onClick={() => setEditingId(null)} />
                      </>
                    ) : (
                      <>
                        <IconButton icon={<EditIcon />} size="xs" variant="ghost" aria-label="Editar" onClick={() => { setEditingId(group.id); setEditingName(group.name); }} />
                        <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" onClick={() => handleDelete(group.id)} />
                      </>
                    )}
                  </HStack>
                </Flex>
              ))}
            </VStack>
          )}
        </Box>

        {/* Right: Items */}
        <Box bg={cardBg} borderRadius="lg" boxShadow="sm" border="1px solid" borderColor={borderColor}
          flex={1} w={isMobile ? "100%" : undefined} minW={0}>
          <Flex justify="space-between" align="center" p={4} borderBottomWidth="1px" borderColor={borderColor}>
            <Heading size="sm" isTruncated>
              {showUngrouped ? "Anúncios sem grupo" : selectedGroup ? `Anúncios — ${selectedGroup.name}` : "Anúncios"}
            </Heading>
            {showUngrouped ? (
              <Badge colorScheme="orange" fontSize="xs" ml={2} flexShrink={0}>{ungroupedAds.length} anúncio{ungroupedAds.length !== 1 ? "s" : ""}</Badge>
            ) : selectedGroup ? (
              <Badge colorScheme="blue" fontSize="xs" ml={2} flexShrink={0}>{groupItems.length} anúncio{groupItems.length !== 1 ? "s" : ""}</Badge>
            ) : null}
          </Flex>

          {showUngrouped ? (
            <Box p={4}>
              <InputGroup size="sm" mb={3}>
                <InputLeftElement pointerEvents="none"><SearchIcon color="gray.400" /></InputLeftElement>
                <Input placeholder="Filtrar por nome ou loja..." value={ungroupedSearch}
                  onChange={(e) => { setUngroupedSearch(e.target.value); setSelectedUngrouped(new Set()); }} />
              </InputGroup>

              <Box mb={3}>
                <SearchableSelect size="sm" placeholder="Selecionar grupo para atribuir" value={assignTargetGroupId}
                  onChange={(val) => setAssignTargetGroupId(val)}
                  options={groups.map((g) => ({ value: String(g.id), label: g.name }))} />
              </Box>

              {ungroupedAds.length > 0 && (
                <Flex align="center" gap={2} mb={3}>
                  <Checkbox size="sm"
                    isChecked={selectedUngrouped.size === ungroupedAds.length && ungroupedAds.length > 0}
                    isIndeterminate={selectedUngrouped.size > 0 && selectedUngrouped.size < ungroupedAds.length}
                    onChange={toggleAllUngrouped}>
                    <Text fontSize="xs">Selecionar todos ({ungroupedAds.length})</Text>
                  </Checkbox>
                  {selectedUngrouped.size > 0 && assignTargetGroupId && (
                    <Button size="xs" colorScheme="blue" leftIcon={<AddIcon />}
                      onClick={handleBatchAssignUngrouped} isLoading={batchAssigning}>
                      Adicionar {selectedUngrouped.size} ao grupo
                    </Button>
                  )}
                </Flex>
              )}

              {loadingAllAds ? (
                <Center p={6}><Spinner /></Center>
              ) : ungroupedAds.length === 0 ? (
                <Center p={6}>
                  <Text fontSize="sm" color="gray.500">
                    {ungroupedSearch ? "Nenhum anúncio encontrado." : "Todos os anúncios já estão em algum grupo."}
                  </Text>
                </Center>
              ) : (
                <VStack spacing={0} align="stretch" maxH="500px" overflowY="auto">
                  {ungroupedAds.map((a) => {
                    const url = getMarketplaceUrl(a);
                    return (
                      <Flex key={a.store_variation_key} align="center" px={3} py={2}
                        borderBottomWidth="1px" borderColor={borderColor} _last={{ borderBottomWidth: 0 }} _hover={{ bg: hoverBg }}>
                        <Checkbox size="sm" mr={2} isChecked={selectedUngrouped.has(a.store_variation_key)}
                          onChange={() => toggleItem(a.store_variation_key, selectedUngrouped, setSelectedUngrouped)} />
                        {a.thumbnail && (
                          <Image src={a.thumbnail} alt="" boxSize="28px" borderRadius="4px" objectFit="contain" mr={2} flexShrink={0} />
                        )}
                        <Text fontSize="sm" flex={1} minW={0} isTruncated>{a.ad_name}</Text>
                        {a._associations?.filter((x) => x.variation_filter).map((x) => (
                          <Tag key={x.variation_filter} size="sm" fontSize="9px" variant="solid" colorScheme="green" ml={1} flexShrink={0}>
                            {x.variation_filter} → {x.group_name}
                          </Tag>
                        ))}
                        {url && (
                          <Link href={url} isExternal ml={1} flexShrink={0}>
                            <ExternalLinkIcon boxSize={3} color="gray.400" />
                          </Link>
                        )}
                        {a.loja && <Tag size="sm" fontSize="10px" variant="subtle" colorScheme="blue" ml={2} flexShrink={0}>{a.loja}</Tag>}
                        <IconButton
                          icon={assigningAd === a.store_variation_key ? <Spinner size="xs" /> : <AddIcon />}
                          size="xs" colorScheme="blue" variant="ghost" aria-label="Adicionar ao grupo" ml={2} flexShrink={0}
                          isDisabled={!assignTargetGroupId || assigningAd === a.store_variation_key}
                          onClick={() => handleAssignToGroup(a)} />
                      </Flex>
                    );
                  })}
                </VStack>
              )}
            </Box>
          ) : !selectedGroupId ? (
            <Center p={10}>
              <Text fontSize="sm" color="gray.500">Selecione um grupo para gerenciar os anúncios.</Text>
            </Center>
          ) : (
            <Box p={4}>
              {/* Search / add */}
              <Box position="relative" mb={4}>
                <InputGroup size="sm">
                  <InputLeftElement pointerEvents="none"><SearchIcon color="gray.400" /></InputLeftElement>
                  <Input placeholder="Buscar anúncio para adicionar..." value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setSelectedSearchResults(new Set()); }} />
                </InputGroup>

                {filteredAds.length > 0 && (
                  <Box position="absolute" top="100%" left={0} right={0} zIndex={10}
                    bg={searchResultBg} border="1px solid" borderColor={borderColor} borderRadius="md"
                    maxH="350px" overflowY="auto" boxShadow="lg" mt={1}>
                    <Flex align="center" gap={2} px={3} py={2} bg={headerBg}
                      borderBottomWidth="1px" borderColor={borderColor} position="sticky" top={0} zIndex={1}>
                      <Checkbox size="sm"
                        isChecked={selectedSearchResults.size === filteredAds.length && filteredAds.length > 0}
                        isIndeterminate={selectedSearchResults.size > 0 && selectedSearchResults.size < filteredAds.length}
                        onChange={toggleAllSearch}>
                        <Text fontSize="xs">Todos ({filteredAds.length})</Text>
                      </Checkbox>
                      {selectedSearchResults.size > 0 && (
                        <Button size="xs" colorScheme="blue" leftIcon={<AddIcon />}
                          onClick={handleBatchAdd} isLoading={batchAdding}>
                          Adicionar {selectedSearchResults.size}
                        </Button>
                      )}
                    </Flex>

                    {filteredAds.map((ad) => (
                      <Flex key={ad.store_variation_key} align="center" px={3} py={2}
                        _hover={{ bg: searchResultHover }} borderBottomWidth="1px" borderColor={borderColor} _last={{ borderBottomWidth: 0 }}>
                        <Checkbox size="sm" mr={2} isChecked={selectedSearchResults.has(ad.store_variation_key)}
                          onChange={() => toggleItem(ad.store_variation_key, selectedSearchResults, setSelectedSearchResults)} />
                        {ad.thumbnail && (
                          <Image src={ad.thumbnail} alt="" boxSize="28px" borderRadius="4px" objectFit="contain" mr={2} flexShrink={0} />
                        )}
                        <Text fontSize="sm" flex={1} minW={0} isTruncated>{ad.ad_name}</Text>
                        {(() => { const url = getMarketplaceUrl(ad); return url ? (
                          <Link href={url} isExternal onClick={(e) => e.stopPropagation()} ml={1} flexShrink={0}>
                            <ExternalLinkIcon boxSize={3} color="gray.400" />
                          </Link>
                        ) : null; })()}
                        {ad.loja && <Tag size="sm" fontSize="10px" variant="subtle" colorScheme="blue" ml={2} flexShrink={0}>{ad.loja}</Tag>}
                        {ad.group_name && (
                          <Badge colorScheme="orange" fontSize="2xs" ml={2} flexShrink={0}>{ad.group_name}</Badge>
                        )}
                        <Box ml={2} flexShrink={0}>
                          {addingAd === ad.store_variation_key ? (
                            <Spinner size="xs" />
                          ) : (
                            <IconButton icon={<AddIcon />} size="xs" variant="ghost" colorScheme="blue"
                              aria-label="Adicionar" onClick={() => handleAddItem(ad)} />
                          )}
                        </Box>
                      </Flex>
                    ))}
                  </Box>
                )}
              </Box>

              {/* Filter within group */}
              <InputGroup size="sm" mb={3}>
                <InputLeftElement pointerEvents="none"><SearchIcon color="gray.400" /></InputLeftElement>
                <Input placeholder="Pesquisar nos anúncios do grupo..." value={groupFilter}
                  onChange={(e) => { setGroupFilter(e.target.value); setSelectedItems(new Set()); }} />
              </InputGroup>

              {/* Batch actions */}
              {filteredGroupItems.length > 0 && (
                <Flex align="center" gap={2} mb={3}>
                  <Checkbox size="sm"
                    isChecked={selectedItems.size === filteredGroupItems.length && filteredGroupItems.length > 0}
                    isIndeterminate={selectedItems.size > 0 && selectedItems.size < filteredGroupItems.length}
                    onChange={toggleAllFiltered}>
                    <Text fontSize="xs">Selecionar todos ({filteredGroupItems.length})</Text>
                  </Checkbox>
                  {selectedItems.size > 0 && (
                    <Button size="xs" colorScheme="red" leftIcon={<DeleteIcon />}
                      onClick={handleBatchRemove} isLoading={removingBatch}>
                      Remover {selectedItems.size}
                    </Button>
                  )}
                </Flex>
              )}

              {/* Items list */}
              {loadingItems ? (
                <Center p={6}><Spinner /></Center>
              ) : groupItems.length === 0 ? (
                <Center p={6}>
                  <Text fontSize="sm" color="gray.500">Nenhum anúncio neste grupo. Use a busca acima para adicionar.</Text>
                </Center>
              ) : filteredGroupItems.length === 0 ? (
                <Center p={6}>
                  <Text fontSize="sm" color="gray.500">Nenhum anúncio encontrado com esse filtro.</Text>
                </Center>
              ) : (
                <VStack spacing={0} align="stretch" maxH="500px" overflowY="auto">
                  {filteredGroupItems.map((i) => {
                    const adInfo = adsMap.get(i.ad_name);
                    const thumb = adInfo?.thumbnail;
                    const url = adInfo ? getMarketplaceUrl(adInfo) : null;
                    const ik = itemKey(i);
                    return (
                      <Flex key={ik} align="center" px={3} py={2}
                        borderBottomWidth="1px" borderColor={borderColor} _last={{ borderBottomWidth: 0 }} _hover={{ bg: hoverBg }}>
                        <Checkbox size="sm" mr={2} isChecked={selectedItems.has(ik)}
                          onChange={() => toggleItem(ik, selectedItems, setSelectedItems)} />
                        {thumb && (
                          <Image src={thumb} alt="" boxSize="28px" borderRadius="4px" objectFit="contain" mr={2} flexShrink={0} />
                        )}
                        <Text fontSize="sm" flex={1} minW={0} isTruncated>{getAdDisplay(i.ad_name)}</Text>
                        {i.variation_filter && (
                          <Tag size="sm" fontSize="10px" variant="solid" colorScheme="purple" ml={2} flexShrink={0}>{i.variation_filter}</Tag>
                        )}
                        {url && (
                          <Link href={url} isExternal onClick={(e) => e.stopPropagation()} ml={1} flexShrink={0}>
                            <ExternalLinkIcon boxSize={3} color="gray.400" />
                          </Link>
                        )}
                        {getAdLoja(i.ad_name) && (
                          <Tag size="sm" fontSize="10px" variant="subtle" colorScheme="blue" ml={2} flexShrink={0}>{getAdLoja(i.ad_name)}</Tag>
                        )}
                        <IconButton icon={<CloseIcon />} size="xs" variant="ghost" colorScheme="red"
                          aria-label="Remover" ml={2} flexShrink={0} onClick={() => handleRemoveItem(i.ad_name, i.variation_filter)} />
                      </Flex>
                    );
                  })}
                </VStack>
              )}
            </Box>
          )}
        </Box>
      </Flex>

      {/* Create Group Modal */}
      <Modal isOpen={createModal.isOpen} onClose={createModal.onClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Novo Grupo de Produtos</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Input placeholder="Nome do grupo..." value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()} autoFocus />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={createModal.onClose}>Cancelar</Button>
            <Button colorScheme="blue" onClick={handleCreate} isLoading={creating}>Criar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Variation Filter Modal */}
      <Modal isOpen={variationModal.isOpen} onClose={variationModal.onClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="md">
            Selecionar Variação
            {variationQueue.length > 0 && (
              <Badge ml={2} colorScheme="blue" fontSize="xs">+{variationQueue.length} restante{variationQueue.length > 1 ? "s" : ""}</Badge>
            )}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm" mb={3} color="gray.600">
              Este anúncio possui múltiplas variações. Selecione qual variação associar ao grupo:
            </Text>
            {variationAd && (
              <Text fontSize="sm" fontWeight="semibold" mb={3} isTruncated>{variationAd.ad_name}</Text>
            )}
            <VStack spacing={2} align="stretch">
              <Box p={2} borderRadius="md" cursor="pointer" border="2px solid"
                borderColor={selectedVariation === null ? "blue.400" : borderColor}
                bg={selectedVariation === null ? "blue.50" : undefined}
                _hover={{ bg: selectedVariation === null ? "blue.50" : hoverBg }}
                onClick={() => setSelectedVariation(null)}>
                <Text fontSize="sm" fontWeight={selectedVariation === null ? "semibold" : "normal"}>
                  Todas as variações
                </Text>
              </Box>
              {variationPrefixes.map((vp) => (
                <Box key={vp.prefix} p={2} borderRadius="md" cursor="pointer" border="2px solid"
                  borderColor={selectedVariation === vp.prefix ? "blue.400" : borderColor}
                  bg={selectedVariation === vp.prefix ? "blue.50" : undefined}
                  _hover={{ bg: selectedVariation === vp.prefix ? "blue.50" : hoverBg }}
                  onClick={() => setSelectedVariation(vp.prefix)}>
                  <HStack justify="space-between">
                    <Text fontSize="sm" fontWeight={selectedVariation === vp.prefix ? "semibold" : "normal"}>
                      {vp.prefix}
                    </Text>
                    <Badge fontSize="2xs" colorScheme="gray">{vp.count} venda{vp.count !== 1 ? "s" : ""}</Badge>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={variationModal.onClose}>Cancelar</Button>
            <Button colorScheme="blue" onClick={handleConfirmVariation} isLoading={loadingVariations}>
              Confirmar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default ProductGroups;
