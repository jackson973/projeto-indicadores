import { useState } from "react";
import {
  Box,
  Button,
  Center,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Link,
  VStack,
  Alert,
  AlertIcon,
  useColorModeValue
} from "@chakra-ui/react";

const LoginPage = ({ onLogin, onForgotPassword }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const panelBg = useColorModeValue("white", "gray.800");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message || "Falha no login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center minH="100vh">
      <Box bg={panelBg} p={8} borderRadius="xl" boxShadow="lg" w="full" maxW="400px">
        <VStack spacing={6} as="form" onSubmit={handleSubmit}>
          <Heading size="lg">Entrar</Heading>

          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              {error}
            </Alert>
          )}

          <FormControl isRequired>
            <FormLabel>E-mail</FormLabel>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Senha</FormLabel>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
            />
          </FormControl>

          <Button type="submit" colorScheme="blue" w="full" isLoading={loading}>
            Entrar
          </Button>

          <Link color="blue.500" fontSize="sm" onClick={onForgotPassword} cursor="pointer">
            Esqueci minha senha
          </Link>
        </VStack>
      </Box>
    </Center>
  );
};

export default LoginPage;
