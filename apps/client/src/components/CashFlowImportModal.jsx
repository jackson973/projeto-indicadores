import { useState, useEffect, useRef } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Select,
  Button,
  HStack,
  Text,
  Box,
  Icon,
  useToast,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  useDisclosure
} from "@chakra-ui/react";
import { AttachmentIcon, WarningIcon } from "@chakra-ui/icons";
import * as XLSX from "xlsx";
import { checkImportDuplicates } from "../api";

const MONTH_MAP = {
  'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
  'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
  'outubro': 10, 'novembro': 11, 'dezembro': 12,
  'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
  'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
};

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function parseMonthYear(title) {
  if (!title) return null;

  const text = title.toLowerCase().replace(/[^a-záàâãéèêíïóôõúç0-9\/\s]/gi, '').trim();

  // Try "mes/ano" pattern
  const slashMatch = text.match(/([a-záàâãéèêíïóôõúç]+)\s*\/\s*(\d{4})/);
  if (slashMatch) {
    const month = MONTH_MAP[slashMatch[1]];
    const year = parseInt(slashMatch[2]);
    if (month && year) return { month, year };
  }

  // Try short format like "Jan26"
  const shortMatch = text.match(/^([a-záàâãéèêíïóôõúç]+)(\d{2,4})$/);
  if (shortMatch) {
    const month = MONTH_MAP[shortMatch[1]];
    let year = parseInt(shortMatch[2]);
    if (year < 100) year += 2000;
    if (month && year) return { month, year };
  }

  // Try just month name
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    if (text.includes(name)) {
      return { month: num, year: new Date().getFullYear() };
    }
  }

  return null;
}

const CashFlowImportModal = ({ isOpen, onClose, boxes, selectedBoxId, onImport }) => {
  const [boxId, setBoxId] = useState(selectedBoxId);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);

  const fileInputRef = useRef(null);
  const cancelRef = useRef();
  const alertDialog = useDisclosure();
  const toast = useToast();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Validate selected box still exists
      const boxExists = boxes.some(b => b.id === selectedBoxId);
      if (boxExists) {
        setBoxId(selectedBoxId);
      } else if (boxes.length > 0) {
        setBoxId(boxes[0].id);
        toast({
          title: "Caixa selecionado não encontrado",
          description: `Selecionado automaticamente: ${boxes[0].name}`,
          status: "warning",
          duration: 3000
        });
      }
      setFile(null);
      setDuplicateInfo(null);
    }
  }, [isOpen, selectedBoxId, boxes, toast]);

  // Check for duplicates by parsing Excel
  const checkForDuplicates = async (selectedFile, selectedBoxId) => {
    setChecking(true);
    setDuplicateInfo(null);

    try {
      // Read Excel file
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      const periodsToCheck = new Set();

      // Extract month/year from each sheet
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        if (!ws['!ref']) continue;

        const range = XLSX.utils.decode_range(ws['!ref']);

        // Try to get month/year from title row
        let monthYear = null;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
          if (cell && cell.v) {
            monthYear = parseMonthYear(String(cell.v));
            if (monthYear) break;
          }
        }

        // Fallback: parse sheet name
        if (!monthYear) {
          monthYear = parseMonthYear(sheetName);
        }

        if (monthYear) {
          periodsToCheck.add(`${monthYear.year}-${monthYear.month}`);
        }
      }

      if (periodsToCheck.size === 0) {
        setChecking(false);
        return;
      }

      // Check each period for duplicates
      const duplicateChecks = await Promise.all(
        Array.from(periodsToCheck).map(async (period) => {
          const [year, month] = period.split('-').map(Number);
          try {
            const data = await checkImportDuplicates(selectedBoxId, year, month);
            return { year, month, ...data };
          } catch (err) {
            console.error(`Error checking period ${year}-${month}:`, err);
            return { year, month, hasEntries: false, count: 0 };
          }
        })
      );

      // Find periods with existing entries
      const duplicates = duplicateChecks.filter(d => d.hasEntries);

      if (duplicates.length > 0) {
        // Format message
        const periods = duplicates.map(d =>
          `${MONTH_NAMES[d.month - 1]}/${d.year} (${d.count} lançamento${d.count !== 1 ? 's' : ''})`
        ).join(', ');

        setDuplicateInfo({
          hasEntries: true,
          message: `Já existem registros nos seguintes períodos: ${periods}`,
          detailedMessage: `Foram encontrados registros existentes para: ${periods}.`,
          duplicates
        });
      }

    } catch (error) {
      console.error('Error checking duplicates:', error);
      toast({
        title: "Erro ao verificar duplicatas",
        description: "Não foi possível verificar registros existentes. A importação pode continuar.",
        status: "warning",
        duration: 4000
      });
    } finally {
      setChecking(false);
    }
  };

  // Handle file selection
  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      toast({
        title: "Arquivo inválido",
        description: "O arquivo selecionado não é um Excel válido (.xlsx ou .xls).",
        status: "error",
        duration: 4000
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setFile(selectedFile);
    // Check for duplicates
    await checkForDuplicates(selectedFile, boxId);
  };

  // Handle box change
  const handleBoxChange = async (e) => {
    const newBoxId = parseInt(e.target.value);
    setBoxId(newBoxId);
    // Re-check duplicates if file is selected
    if (file) {
      await checkForDuplicates(file, newBoxId);
    }
  };

  // Handle import confirmation
  const handleConfirmImport = async () => {
    // Close alert dialog if open
    if (alertDialog.isOpen) {
      alertDialog.onClose();
    }

    // Proceed with import
    setImporting(true);
    try {
      await onImport(file, boxId);
      onClose();
    } catch (err) {
      // Error toast is handled by parent component
    } finally {
      setImporting(false);
    }
  };

  // Handle import button click
  const handleImportClick = () => {
    if (!file || !boxId) return;

    if (duplicateInfo && duplicateInfo.hasEntries) {
      // Show confirmation dialog
      alertDialog.onOpen();
    } else {
      // No duplicates, proceed directly
      handleConfirmImport();
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Importar Planilha de Fluxo de Caixa</ModalHeader>
          <ModalCloseButton />
          <ModalBody display="flex" flexDirection="column" gap={4}>
            {boxes.length === 0 ? (
              <Box p={4} borderRadius="md" bg="yellow.50" borderWidth="1px" borderColor="yellow.200">
                <Text fontSize="sm" color="yellow.700">
                  Nenhum caixa disponível. Crie um caixa antes de importar.
                </Text>
              </Box>
            ) : (
              <>
                {/* Box Selector */}
                <FormControl isRequired>
                  <FormLabel>Caixa de Destino</FormLabel>
                  <Select value={boxId || ""} onChange={handleBoxChange}>
                    {boxes.map((box) => (
                      <option key={box.id} value={box.id}>{box.name}</option>
                    ))}
                  </Select>
                </FormControl>

                {/* File Upload */}
                <FormControl isRequired>
                  <FormLabel>Arquivo Excel</FormLabel>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls"
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />
                  <Button
                    leftIcon={<AttachmentIcon />}
                    variant="outline"
                    w="full"
                    onClick={() => fileInputRef.current?.click()}
                    isLoading={checking}
                    loadingText="Verificando..."
                  >
                    {file ? file.name : "Selecionar arquivo..."}
                  </Button>
                </FormControl>

                {/* File info display */}
                {file && (
                  <Box p={3} borderRadius="md" bg="gray.50" borderWidth="1px">
                    <Text fontSize="sm" fontWeight="medium">
                      Arquivo selecionado:
                    </Text>
                    <Text fontSize="sm" color="gray.600">
                      {file.name}
                    </Text>
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      {(file.size / 1024).toFixed(2)} KB
                    </Text>
                  </Box>
                )}

                {/* Duplicate warning */}
                {duplicateInfo && duplicateInfo.hasEntries && (
                  <Box
                    p={3}
                    borderRadius="md"
                    bg="orange.50"
                    borderWidth="1px"
                    borderColor="orange.200"
                  >
                    <HStack spacing={2} mb={1}>
                      <Icon as={WarningIcon} color="orange.500" />
                      <Text fontSize="sm" fontWeight="medium" color="orange.700">
                        Atenção
                      </Text>
                    </HStack>
                    <Text fontSize="sm" color="orange.700">
                      {duplicateInfo.message}
                    </Text>
                  </Box>
                )}
              </>
            )}
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleImportClick}
              isDisabled={!file || !boxId || boxes.length === 0}
              isLoading={importing}
              loadingText="Importando..."
            >
              Importar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Confirmation AlertDialog */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={alertDialog.onClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Confirmar Importação
            </AlertDialogHeader>

            <AlertDialogBody>
              {duplicateInfo && (
                <Text>
                  {duplicateInfo.detailedMessage}
                  <br /><br />
                  A importação irá <strong>adicionar novos registros</strong> aos existentes.
                  <br /><br />
                  Deseja continuar?
                </Text>
              )}
            </AlertDialogBody>

            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={alertDialog.onClose}>
                Cancelar
              </Button>
              <Button
                colorScheme="orange"
                onClick={handleConfirmImport}
                ml={3}
                isLoading={importing}
              >
                Confirmar Importação
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
};

export default CashFlowImportModal;
