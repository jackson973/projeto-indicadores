import { useEffect, useRef, useCallback, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import { CloseIcon, SearchIcon } from "@chakra-ui/icons";

/**
 * BarcodeScanner — input para leitor/digitação + câmera fullscreen opcional.
 *
 * - Input sempre visível para pistola bluetooth/USB
 * - Câmera abre em overlay fullscreen (fora do modal) ao clicar "Abrir câmera"
 */
export default function BarcodeScanner({
  onScan,
  onError,
  active = true,
  continuous = true,
}) {
  const uniqueId = useId();
  const containerId = `barcode-scanner-${uniqueId.replace(/:/g, "")}`;
  const scannerRef = useRef(null);
  const lastCodeRef = useRef(null);
  const lastTimeRef = useRef(0);
  const inputRef = useRef(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const mutedColor = useColorModeValue("gray.500", "gray.400");

  const handleScan = useCallback(
    (decodedText) => {
      const code = decodedText.trim();
      if (!code) return;
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastTimeRef.current < 2000) return;
      lastCodeRef.current = code;
      lastTimeRef.current = now;
      setLastResult(code);
      onScan?.(code);
    },
    [onScan]
  );

  function handleManualSubmit(e) {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    handleScan(code);
    setManualCode("");
    inputRef.current?.focus();
  }

  // Start/stop camera
  useEffect(() => {
    if (!active || !cameraOn) return;

    // Small delay to ensure the portal DOM element is mounted
    const timeout = setTimeout(() => {
      const el = document.getElementById(containerId);
      if (!el) return;

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 280, height: 120 },
            formatsToSupport: [0, 4, 3, 2, 7, 11],
          },
          (decodedText) => {
            handleScan(decodedText);
            if (!continuous) {
              scanner.stop().catch(() => {});
              setCameraOn(false);
            }
          },
          () => {}
        )
        .catch((err) => {
          setCameraError(typeof err === "string" ? err : "Câmera indisponível");
          setCameraOn(false);
        });
    }, 100);

    return () => {
      clearTimeout(timeout);
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            try { scannerRef.current?.clear(); } catch (_) {}
            scannerRef.current = null;
          });
      }
    };
  }, [active, cameraOn, continuous, handleScan, containerId]);

  // Turn off camera when component deactivates
  useEffect(() => {
    if (!active) setCameraOn(false);
  }, [active]);

  if (!active) return null;

  return (
    <>
      <VStack spacing={2} w="full">
        {/* Input — sempre visível, funciona com pistola bluetooth/USB */}
        <form onSubmit={handleManualSubmit} style={{ width: "100%" }}>
          <HStack spacing={2}>
            <InputGroup size="sm" flex={1}>
              <InputLeftElement pointerEvents="none">
                <SearchIcon color={mutedColor} boxSize={3} />
              </InputLeftElement>
              <Input
                ref={inputRef}
                placeholder="Bipar com leitor ou digitar código..."
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                borderRadius="lg"
                autoFocus
              />
            </InputGroup>
            <IconButton
              type="submit"
              size="sm"
              colorScheme="blue"
              aria-label="Buscar"
              icon={<SearchIcon />}
              borderRadius="lg"
            />
          </HStack>
        </form>

        {/* Botão para ativar câmera */}
        {!cameraOn && (
          <Button
            size="xs"
            variant="ghost"
            color={mutedColor}
            onClick={() => { setCameraError(null); setLastResult(null); setCameraOn(true); }}
          >
            Abrir câmera
          </Button>
        )}

        {cameraError && (
          <Text fontSize="xs" color="red.500" textAlign="center">{cameraError}</Text>
        )}
      </VStack>

      {/* Câmera fullscreen — renderizada fora do modal via portal */}
      {cameraOn && createPortal(
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={9999}
          bg="black"
          display="flex"
          flexDirection="column"
        >
          {/* Header */}
          <Flex
            px={4}
            py={3}
            align="center"
            justify="space-between"
            bg="blackAlpha.800"
            position="absolute"
            top={0}
            left={0}
            right={0}
            zIndex={1}
          >
            <Text color="white" fontSize="sm" fontWeight="bold">Scanner</Text>
            <IconButton
              icon={<CloseIcon />}
              size="sm"
              colorScheme="red"
              variant="solid"
              borderRadius="full"
              aria-label="Fechar"
              onClick={() => setCameraOn(false)}
            />
          </Flex>

          {/* Camera view */}
          <Box
            id={containerId}
            flex={1}
            sx={{
              "& video": {
                width: "100% !important",
                height: "100% !important",
                objectFit: "cover",
              },
              "& #qr-shaded-region": {
                borderColor: "rgba(66, 153, 225, 0.8) !important",
              },
            }}
          />

          {/* Bottom bar — last scanned result */}
          <Box
            px={4}
            py={3}
            bg="blackAlpha.800"
            position="absolute"
            bottom={0}
            left={0}
            right={0}
            zIndex={1}
          >
            {lastResult ? (
              <VStack spacing={0}>
                <Text color="green.300" fontSize="xs" fontWeight="bold">Último código lido:</Text>
                <Text color="white" fontSize="md" fontFamily="mono">{lastResult}</Text>
              </VStack>
            ) : (
              <Text color="gray.400" fontSize="sm" textAlign="center">
                Aponte a câmera para o código de barras
              </Text>
            )}
          </Box>
        </Box>,
        document.body
      )}
    </>
  );
}
