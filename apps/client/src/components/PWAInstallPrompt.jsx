import { useState, useEffect } from "react";
import {
  Box,
  Button,
  CloseButton,
  Flex,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { DownloadIcon } from "@chakra-ui/icons";

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);

  const bg = useColorModeValue("blue.50", "blue.900");
  const borderColor = useColorModeValue("blue.200", "blue.700");

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if dismissed recently (7 days)
    const dismissed = localStorage.getItem("pwa_prompt_dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    // iOS detection
    const ua = navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (iosDevice && !window.navigator.standalone) {
      setIsIos(true);
      setShowBanner(true);
      return;
    }

    // Android/Chrome — capture beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa_prompt_dismissed", String(Date.now()));
  };

  if (!showBanner) return null;

  return (
    <Box
      bg={bg}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="lg"
      p={4}
      mb={4}
    >
      <Flex align="center" justify="space-between" gap={3}>
        <Flex align="center" gap={3} flex={1}>
          <DownloadIcon boxSize={5} color="blue.500" />
          <Box>
            <Text fontSize="sm" fontWeight="bold">
              Instalar Dashboard Project
            </Text>
            <Text fontSize="xs" color="gray.500">
              {isIos
                ? "Toque no botao de compartilhar e depois \"Adicionar a Tela de Inicio\""
                : "Acesse direto da tela inicial, como um app"}
            </Text>
          </Box>
        </Flex>
        {!isIos && (
          <Button
            size="sm"
            colorScheme="blue"
            leftIcon={<DownloadIcon />}
            onClick={handleInstall}
          >
            Instalar
          </Button>
        )}
        <CloseButton size="sm" onClick={handleDismiss} />
      </Flex>
    </Box>
  );
};

export default PWAInstallPrompt;
