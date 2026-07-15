import { useState, useEffect, useCallback, useRef } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  Box, Flex, Text, Button, IconButton, Badge, Textarea, HStack, Spinner, Image, Wrap, WrapItem,
  useColorModeValue,
} from "@chakra-ui/react";
import { AttachmentIcon, CloseIcon, DownloadIcon } from "@chakra-ui/icons";
import {
  fetchCashflowAttachments, uploadCashflowAttachment, deleteCashflowAttachment,
  fetchCashflowAttachmentUrl, updateCashflowEntryDetails,
} from "../api";
import useAppToast from "../hooks/useAppToast";

const formatCurrency = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * Visualizador de comprovante (lightbox): mostra a imagem/PDF sobre o sistema,
 * fecha ao clicar fora e permite baixar o arquivo sem trocar de aba.
 */
export function AttachmentViewerModal({ attachment, isOpen, onClose }) {
  const [url, setUrl] = useState(null);
  const toast = useAppToast();
  const isImg = attachment?.mimeType?.startsWith("image/");

  useEffect(() => {
    if (!isOpen || !attachment?.id) return undefined;
    let alive = true;
    let objectUrl = null;
    (async () => {
      try {
        objectUrl = await fetchCashflowAttachmentUrl(attachment.id);
        if (alive) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch (err) {
        toast({ title: err.message || "Erro ao abrir anexo.", status: "error", duration: 3000 });
        if (alive) onClose();
      }
    })();
    return () => {
      alive = false;
      setUrl(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, attachment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = () => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment?.originalName || "comprovante";
    link.click();
  };

  if (!attachment) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent>
        <ModalHeader pr={10} fontSize="md" noOfLines={1}>
          {attachment.originalName || "Comprovante"}
          {attachment.sizeBytes ? (
            <Text as="span" fontSize="xs" color="gray.500" fontWeight="normal" ml={2}>
              {formatSize(attachment.sizeBytes)}
            </Text>
          ) : null}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody p={2} display="flex" alignItems="center" justifyContent="center" minH="200px">
          {!url ? (
            <Spinner />
          ) : isImg ? (
            <Image src={url} alt={attachment.originalName || "comprovante"} maxH="72vh" maxW="100%" objectFit="contain" />
          ) : (
            <Box as="iframe" src={url} title={attachment.originalName || "comprovante"} w="100%" h="72vh" border="none" />
          )}
        </ModalBody>
        <ModalFooter py={2}>
          <Button variant="ghost" mr={3} onClick={onClose}>Fechar</Button>
          <Button leftIcon={<DownloadIcon />} colorScheme="blue" onClick={handleDownload} isDisabled={!url}>
            Download
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * Lista + upload de comprovantes de um lançamento.
 * Aceita seleção de arquivo, arrastar-e-soltar e Ctrl+V (quando `pasteActive`).
 * Reutilizado na modal pós-check e na modal de edição do lançamento.
 */
export function AttachmentManager({ entryId, pasteActive = false, onCountChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [thumbs, setThumbs] = useState({}); // attachment id -> object URL (miniatura de imagem)
  const [viewing, setViewing] = useState(null); // anexo aberto no visualizador
  const thumbsRef = useRef({});
  const inputRef = useRef(null);
  const toast = useAppToast();

  const dropBgIdle = useColorModeValue("gray.50", "gray.700");
  const dropBgActive = useColorModeValue("blue.50", "blue.900");
  const dropBorderIdle = useColorModeValue("gray.300", "gray.600");
  const rowBorder = useColorModeValue("gray.200", "gray.600");
  const dropBg = dragOver ? dropBgActive : dropBgIdle;
  const dropBorder = dragOver ? "blue.400" : dropBorderIdle;

  // notify=true apenas em ações do usuário (upload/exclusão) — a carga inicial não avisa o pai
  const reload = useCallback(async (notify = false) => {
    if (!entryId) return;
    try {
      const list = await fetchCashflowAttachments(entryId);
      setItems(list);
      if (notify) onCountChange?.(list.length);
    } catch { /* lista permanece */ }
    finally { setLoading(false); }
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLoading(true); reload(); }, [reload]);

  // Baixa as miniaturas das imagens (rota autenticada → object URL)
  useEffect(() => {
    let alive = true;
    (async () => {
      const urls = {};
      for (const a of items) {
        if (a.mimeType?.startsWith("image/") && !thumbsRef.current[a.id]) {
          try { urls[a.id] = await fetchCashflowAttachmentUrl(a.id); } catch { /* fica sem preview */ }
        }
      }
      if (alive && Object.keys(urls).length) {
        setThumbs(prev => { const next = { ...prev, ...urls }; thumbsRef.current = next; return next; });
      }
    })();
    return () => { alive = false; };
  }, [items]);

  // Libera as object URLs ao desmontar
  useEffect(() => () => { Object.values(thumbsRef.current).forEach(u => URL.revokeObjectURL(u)); }, []);

  const uploadFiles = useCallback(async (files) => {
    const valid = [...files].filter(f => /^image\/|^application\/pdf$/.test(f.type));
    if (!valid.length) {
      toast({ title: "Use uma imagem ou PDF.", status: "warning", duration: 3000 });
      return;
    }
    setUploading(true);
    try {
      for (const f of valid) await uploadCashflowAttachment(entryId, f);
      toast({ title: `Comprovante${valid.length > 1 ? "s" : ""} anexado${valid.length > 1 ? "s" : ""}.`, status: "success", duration: 2500 });
      await reload(true);
    } catch (err) {
      toast({ title: err.message || "Erro ao anexar.", status: "error", duration: 4000 });
    } finally { setUploading(false); }
  }, [entryId, reload, toast]);

  // Ctrl+V: cola imagem da área de transferência
  useEffect(() => {
    if (!pasteActive) return;
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter(i => i.kind === "file")
        .map(i => i.getAsFile())
        .filter(Boolean);
      if (files.length) { e.preventDefault(); uploadFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pasteActive, uploadFiles]);

  const removeAttachment = async (a) => {
    if (!window.confirm("Excluir este comprovante?")) return;
    try {
      await deleteCashflowAttachment(a.id);
      await reload(true);
    } catch (err) {
      toast({ title: err.message || "Erro ao excluir anexo.", status: "error", duration: 3000 });
    }
  };

  return (
    <Box>
      <Box
        borderWidth="2px" borderStyle="dashed" borderColor={dropBorder} borderRadius="md"
        bg={dropBg} p={4} textAlign="center" cursor="pointer" transition="all 0.15s"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
      >
        {uploading ? (
          <HStack justify="center"><Spinner size="sm" /><Text fontSize="sm">Enviando…</Text></HStack>
        ) : (
          <>
            <AttachmentIcon color="gray.400" mb={1} />
            <Text fontSize="sm">Clique para escolher, arraste o arquivo aqui{pasteActive ? " ou use Ctrl+V" : ""}</Text>
            <Text fontSize="xs" color="gray.500">Imagem ou PDF · até 15 MB</Text>
          </>
        )}
        <input
          ref={inputRef} type="file" hidden multiple accept="image/*,application/pdf"
          onChange={(e) => { uploadFiles(e.target.files); e.target.value = ""; }}
        />
      </Box>

      {loading ? (
        <Flex justify="center" py={3}><Spinner size="sm" /></Flex>
      ) : items.length > 0 && (
        <Wrap spacing={3} mt={3}>
          {items.map(a => {
            const isImg = a.mimeType?.startsWith("image/");
            return (
              <WrapItem key={a.id}>
                <Box w="84px">
                  <Box position="relative">
                    <Box
                      w="84px" h="84px" borderWidth="1px" borderColor={rowBorder} borderRadius="md"
                      overflow="hidden" cursor="pointer" bg={dropBgIdle}
                      display="flex" alignItems="center" justifyContent="center"
                      title={`${a.originalName || "comprovante"}${a.sizeBytes ? ` · ${formatSize(a.sizeBytes)}` : ""} — clique para abrir`}
                      onClick={() => setViewing(a)}
                    >
                      {isImg && thumbs[a.id] ? (
                        <Image src={thumbs[a.id]} alt={a.originalName || "comprovante"} w="100%" h="100%" objectFit="cover" />
                      ) : isImg ? (
                        <Spinner size="sm" />
                      ) : (
                        <Box textAlign="center">
                          <Text fontSize="xl" lineHeight="1">📄</Text>
                          <Text fontSize="2xs" color="gray.500" fontWeight="bold">PDF</Text>
                        </Box>
                      )}
                    </Box>
                    <IconButton
                      icon={<CloseIcon boxSize={2} />}
                      size="xs" colorScheme="red" borderRadius="full" aria-label="Excluir comprovante"
                      title="Excluir comprovante"
                      position="absolute" top="-7px" right="-7px" h="20px" w="20px" minW="20px"
                      onClick={(e) => { e.stopPropagation(); removeAttachment(a); }}
                    />
                  </Box>
                  <Text fontSize="2xs" color="gray.500" noOfLines={1} mt={1} textAlign="center">
                    {a.originalName || "comprovante"}
                  </Text>
                </Box>
              </WrapItem>
            );
          })}
        </Wrap>
      )}

      <AttachmentViewerModal attachment={viewing} isOpen={!!viewing} onClose={() => setViewing(null)} />
    </Box>
  );
}

/**
 * Modal aberta ao marcar um pagamento (despesa) como realizado.
 * O comprovante é opcional: Esc ou clique fora fecham sem anexar —
 * o check já foi persistido antes de abrir a modal.
 */
const CashFlowReceiptModal = ({ isOpen, onClose, entry, onChanged }) => {
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useAppToast();

  useEffect(() => { setDetails(entry?.details || ""); }, [entry, isOpen]);

  const close = (changed) => { onClose(); if (changed) onChanged?.(); };

  const handleConclude = async () => {
    setSaving(true);
    try {
      if ((details || "") !== (entry?.details || "")) {
        await updateCashflowEntryDetails(entry.id, details.trim() || null);
      }
      close(true);
    } catch (err) {
      toast({ title: err.message || "Erro ao salvar detalhes.", status: "error", duration: 3000 });
    } finally { setSaving(false); }
  };

  if (!entry) return null;

  return (
    <Modal isOpen={isOpen} onClose={() => close(true)} size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader pb={1}>Comprovante de pagamento</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex align="center" gap={2} mb={1} wrap="wrap">
            <Badge colorScheme="red" variant="subtle">{entry.categoryName}</Badge>
            <Text fontSize="sm" fontWeight="medium" noOfLines={1}>{entry.description}</Text>
            <Text fontSize="sm" fontWeight="bold" color="red.500" ml="auto">{formatCurrency(entry.amount)}</Text>
          </Flex>
          <Text fontSize="xs" color="gray.500" mb={3}>
            Pagamento marcado como realizado. Anexe o comprovante se desejar — ou pressione Esc / clique fora para pular.
          </Text>

          <AttachmentManager entryId={entry.id} pasteActive={isOpen} />

          <Text fontSize="sm" fontWeight="medium" mt={4} mb={1}>Detalhes do lançamento</Text>
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Observações, nº do pedido, forma de pagamento…"
            size="sm" rows={3}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={() => close(true)}>Pular</Button>
          <Button colorScheme="blue" onClick={handleConclude} isLoading={saving}>Concluir</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CashFlowReceiptModal;
