import { useState, useEffect, useCallback, useRef } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  Box, Flex, Text, Button, IconButton, Badge, Textarea, VStack, HStack, Spinner,
  useColorModeValue,
} from "@chakra-ui/react";
import { AttachmentIcon, DeleteIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import {
  fetchCashflowAttachments, uploadCashflowAttachment, deleteCashflowAttachment,
  fetchCashflowAttachmentUrl, updateCashflowEntryDetails,
} from "../api";
import useAppToast from "../hooks/useAppToast";

const formatCurrency = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

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

  const openAttachment = async (a) => {
    try {
      const url = await fetchCashflowAttachmentUrl(a.id);
      window.open(url, "_blank");
    } catch (err) {
      toast({ title: err.message || "Erro ao abrir anexo.", status: "error", duration: 3000 });
    }
  };

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
        <VStack align="stretch" spacing={1} mt={3}>
          {items.map(a => (
            <Flex key={a.id} align="center" gap={2} borderWidth="1px" borderColor={rowBorder} borderRadius="md" px={2} py={1.5}>
              <AttachmentIcon color="gray.400" flexShrink={0} boxSize={3} />
              <Text fontSize="xs" flex="1" noOfLines={1}>{a.originalName || "comprovante"}</Text>
              {a.sizeBytes && <Text fontSize="2xs" color="gray.500" flexShrink={0}>{formatSize(a.sizeBytes)}</Text>}
              <IconButton icon={<ExternalLinkIcon />} size="xs" variant="ghost" aria-label="Abrir" title="Abrir comprovante" onClick={() => openAttachment(a)} />
              <IconButton icon={<DeleteIcon />} size="xs" variant="ghost" colorScheme="red" aria-label="Excluir" title="Excluir comprovante" onClick={() => removeAttachment(a)} />
            </Flex>
          ))}
        </VStack>
      )}
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
