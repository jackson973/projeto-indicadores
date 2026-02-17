import { useState, useRef } from "react";
import {
  Alert,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Box,
  Button,
  Divider,
  HStack,
  Icon,
  Text,
  VStack,
  useColorModeValue,
  useDisclosure,
  useToast
} from "@chakra-ui/react";
import { WarningIcon, DeleteIcon } from "@chakra-ui/icons";
import { clearSalesData, clearCashflowData } from "../api";

const DatabaseMaintenance = () => {
  const [actionType, setActionType] = useState(null); // 'sales' or 'cashflow'
  const [loading, setLoading] = useState(false);
  const alertDialog = useDisclosure();
  const cancelRef = useRef();
  const toast = useToast();

  const panelBg = useColorModeValue("white", "gray.800");
  const dangerBg = useColorModeValue("red.50", "red.900");
  const dangerBorder = useColorModeValue("red.200", "red.700");

  const handleOpenConfirmation = (type) => {
    setActionType(type);
    alertDialog.onOpen();
  };

  const handleConfirmDelete = async () => {
    setLoading(true);
    try {
      if (actionType === 'sales') {
        await clearSalesData();
        toast({
          title: "Dados de vendas excluídos",
          description: "Todos os registros de vendas foram removidos.",
          status: "success",
          duration: 4000
        });
      } else if (actionType === 'cashflow') {
        await clearCashflowData();
        toast({
          title: "Dados financeiros excluídos",
          description: "Todos os lançamentos de fluxo de caixa foram removidos.",
          status: "success",
          duration: 4000
        });
      }
      alertDialog.onClose();
    } catch (err) {
      toast({
        title: "Erro ao excluir dados",
        description: err.message || "Não foi possível realizar a operação.",
        status: "error",
        duration: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  const getConfirmationMessage = () => {
    if (actionType === 'sales') {
      return {
        title: "Confirmar exclusão de vendas",
        message: "Esta ação irá excluir TODOS os registros de vendas do sistema. Esta operação NÃO PODE SER DESFEITA.",
        action: "Excluir todas as vendas"
      };
    } else if (actionType === 'cashflow') {
      return {
        title: "Confirmar exclusão de dados financeiros",
        message: "Esta ação irá excluir TODOS os lançamentos de fluxo de caixa do sistema. Esta operação NÃO PODE SER DESFEITA.",
        action: "Excluir todos os dados financeiros"
      };
    }
    return { title: "", message: "", action: "" };
  };

  const confirmation = getConfirmationMessage();

  return (
    <>
      <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm" maxW="960px" mx="auto" mt={8}>
        <Text fontSize="lg" fontWeight="bold" mb={4}>Manutenção de Base</Text>

        <Alert status="warning" borderRadius="md" mb={6}>
          <AlertIcon />
          <Box>
            <Text fontWeight="semibold">Atenção: Área de Risco</Text>
            <Text fontSize="sm" mt={1}>
              As operações abaixo são destrutivas e irreversíveis. Use apenas se tiver certeza do que está fazendo.
            </Text>
          </Box>
        </Alert>

        <VStack spacing={6} align="stretch">
          {/* Limpar Vendas */}
          <Box
            p={5}
            borderRadius="md"
            borderWidth="2px"
            borderColor={dangerBorder}
            bg={dangerBg}
          >
            <HStack justify="space-between" align="start">
              <Box flex={1}>
                <HStack mb={2}>
                  <Icon as={DeleteIcon} color="red.500" />
                  <Text fontWeight="semibold" fontSize="md">Limpar Dados de Vendas</Text>
                </HStack>
                <Text fontSize="sm" color="gray.600">
                  Remove todos os registros de vendas importados do sistema.
                  Útil para reiniciar a base de dados de vendas ou corrigir importações com erro.
                </Text>
                <Text fontSize="xs" color="red.500" mt={2} fontWeight="semibold">
                  ⚠️ Esta ação não pode ser desfeita
                </Text>
              </Box>
              <Button
                colorScheme="red"
                variant="outline"
                size="sm"
                leftIcon={<DeleteIcon />}
                onClick={() => handleOpenConfirmation('sales')}
                minW="140px"
              >
                Limpar vendas
              </Button>
            </HStack>
          </Box>

          <Divider />

          {/* Limpar Fluxo de Caixa */}
          <Box
            p={5}
            borderRadius="md"
            borderWidth="2px"
            borderColor={dangerBorder}
            bg={dangerBg}
          >
            <HStack justify="space-between" align="start">
              <Box flex={1}>
                <HStack mb={2}>
                  <Icon as={DeleteIcon} color="red.500" />
                  <Text fontWeight="semibold" fontSize="md">Limpar Dados Financeiros</Text>
                </HStack>
                <Text fontSize="sm" color="gray.600">
                  Remove todos os lançamentos de fluxo de caixa do sistema.
                  Útil para reiniciar a base de dados financeiros ou corrigir importações com erro.
                </Text>
                <Text fontSize="xs" color="red.500" mt={2} fontWeight="semibold">
                  ⚠️ Esta ação não pode ser desfeita
                </Text>
              </Box>
              <Button
                colorScheme="red"
                variant="outline"
                size="sm"
                leftIcon={<DeleteIcon />}
                onClick={() => handleOpenConfirmation('cashflow')}
                minW="180px"
              >
                Limpar fluxo de caixa
              </Button>
            </HStack>
          </Box>

          <Alert status="info" borderRadius="md" mt={4}>
            <AlertIcon />
            <Text fontSize="sm">
              <strong>Dica:</strong> Recomendamos fazer backup do banco de dados antes de executar essas operações.
              Use o script <code>backup.sh</code> disponível no repositório.
            </Text>
          </Alert>
        </VStack>
      </Box>

      {/* Confirmation Dialog */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={alertDialog.onClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              <HStack>
                <Icon as={WarningIcon} color="red.500" />
                <Text>{confirmation.title}</Text>
              </HStack>
            </AlertDialogHeader>

            <AlertDialogBody>
              <Text mb={3}>{confirmation.message}</Text>
              <Text fontSize="sm" color="gray.600">
                Certifique-se de ter um backup recente antes de continuar.
              </Text>
            </AlertDialogBody>

            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={alertDialog.onClose}>
                Cancelar
              </Button>
              <Button
                colorScheme="red"
                onClick={handleConfirmDelete}
                ml={3}
                isLoading={loading}
                loadingText="Excluindo..."
              >
                {confirmation.action}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
};

export default DatabaseMaintenance;
