import { useState } from "react";
import {
  Box,
  Button,
  Center,
  FormControl,
  FormLabel,
  Heading,
  Input,
  VStack,
  Alert,
  AlertIcon,
  useColorModeValue
} from "@chakra-ui/react";
import { resetPassword } from "../api";

const ResetPasswordPage = ({ token, onSuccess }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const panelBg = useColorModeValue("white", "gray.800");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      return setError("A senha deve ter no mínimo 6 caracteres.");
    }
    if (password !== confirm) {
      return setError("As senhas não coincidem.");
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => onSuccess(), 2000);
    } catch (err) {
      setError(err.message || "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center minH="100vh">
      <Box bg={panelBg} p={8} borderRadius="xl" boxShadow="lg" w="full" maxW="400px">
        <VStack spacing={6} as="form" onSubmit={handleSubmit}>
          <Heading size="lg">Redefinir senha</Heading>

          {success && (
            <Alert status="success" borderRadius="md">
              <AlertIcon />
              Senha alterada com sucesso! Redirecionando...
            </Alert>
          )}

          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              {error}
            </Alert>
          )}

          {!success && (
            <>
              <FormControl isRequired>
                <FormLabel>Nova senha</FormLabel>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Confirmar senha</FormLabel>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repita a senha"
                />
              </FormControl>

              <Button type="submit" colorScheme="blue" w="full" isLoading={loading}>
                Redefinir senha
              </Button>
            </>
          )}
        </VStack>
      </Box>
    </Center>
  );
};

export default ResetPasswordPage;
