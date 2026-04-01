import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Center,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Link,
  Text,
  VStack,
  Alert,
  AlertIcon,
  useColorModeValue
} from "@chakra-ui/react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { webauthnAuthenticateOptions, webauthnAuthenticateVerify } from "../api";

const LoginPage = ({ onLogin, onBiometricLogin, onForgotPassword }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState("");
  const [supportsWebAuthn, setSupportsWebAuthn] = useState(false);

  const panelBg = useColorModeValue("white", "gray.800");
  const dividerColor = useColorModeValue("gray.300", "gray.600");

  useEffect(() => {
    setSupportsWebAuthn(browserSupportsWebAuthn());
    // Pre-fill email from saved biometric
    const savedEmail = localStorage.getItem("webauthn_email");
    if (savedEmail) setEmail(savedEmail);
  }, []);

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

  const handleBiometric = async () => {
    const biometricEmail = email || localStorage.getItem("webauthn_email");
    if (!biometricEmail) {
      setError("Digite seu e-mail para usar a biometria.");
      return;
    }
    setError("");
    setBiometricLoading(true);
    try {
      const options = await webauthnAuthenticateOptions(biometricEmail);
      const authResponse = await startAuthentication({ optionsJSON: options });
      const result = await webauthnAuthenticateVerify(biometricEmail, authResponse);
      onBiometricLogin(result);
    } catch (err) {
      if (err.name === "NotAllowedError") return; // user cancelled
      setError(err.message || "Falha na autenticação biométrica.");
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <Center minH="100vh">
      <Box bg={panelBg} p={8} borderRadius="xl" boxShadow="lg" w="full" maxW="400px">
        <VStack spacing={6}>
          <Heading size="lg">Entrar</Heading>

          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              {error}
            </Alert>
          )}

          <VStack spacing={4} as="form" onSubmit={handleSubmit} w="full">
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
          </VStack>

          {supportsWebAuthn && (
            <>
              <Flex align="center" w="full" gap={3}>
                <Divider borderColor={dividerColor} />
                <Text fontSize="xs" color="gray.500" flexShrink={0}>ou</Text>
                <Divider borderColor={dividerColor} />
              </Flex>
              <Button
                w="full"
                size="lg"
                colorScheme="green"
                variant="outline"
                onClick={handleBiometric}
                isLoading={biometricLoading}
                loadingText="Autenticando..."
                borderRadius="xl"
              >
                🔐 Entrar com biometria
              </Button>
            </>
          )}

          <Link color="blue.500" fontSize="sm" onClick={onForgotPassword} cursor="pointer">
            Esqueci minha senha
          </Link>
        </VStack>
      </Box>
    </Center>
  );
};

export default LoginPage;
