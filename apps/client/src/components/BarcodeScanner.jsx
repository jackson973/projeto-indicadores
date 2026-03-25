import { useEffect, useRef, useCallback, useId, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Box,
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
import { SearchIcon } from "@chakra-ui/icons";

/**
 * BarcodeScanner — leitura de código de barras via câmera + input manual (fallback).
 *
 * Props:
 *  - onScan(code: string)  — chamado quando um código é lido
 *  - onError(err: string)  — chamado quando há erro (opcional)
 *  - active (bool)         — controla se o scanner está ativo
 *  - continuous (bool)     — se true, continua escaneando após cada leitura (default: true)
 *  - height (string)       — altura do visor da câmera (default: "220px")
 */
export default function BarcodeScanner({
  onScan,
  onError,
  active = true,
  continuous = true,
  height = "220px",
}) {
  const uniqueId = useId();
  const containerId = `barcode-scanner-${uniqueId.replace(/:/g, "")}`;
  const containerRef = useRef(null);
  const scannerRef = useRef(null);
  const lastCodeRef = useRef(null);
  const lastTimeRef = useRef(0);
  const inputRef = useRef(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const bg = useColorModeValue("gray.100", "gray.700");
  const mutedColor = useColorModeValue("gray.500", "gray.400");

  const handleScan = useCallback(
    (decodedText) => {
      const code = decodedText.trim();
      if (!code) return;
      // Debounce: ignore same code within 2s
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastTimeRef.current < 2000) return;
      lastCodeRef.current = code;
      lastTimeRef.current = now;
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

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 100 },
          formatsToSupport: [
            0,  // QR_CODE
            4,  // EAN_13
            3,  // EAN_8
            2,  // CODE_128
            7,  // CODE_39
            11, // UPC_A
          ],
        },
        (decodedText) => {
          handleScan(decodedText);
          if (!continuous) {
            scanner.stop().catch(() => {});
          }
        },
        () => {}
      )
      .catch(() => {
        setCameraAvailable(false);
      });

    return () => {
      scanner
        .stop()
        .catch(() => {})
        .finally(() => {
          try { scanner.clear(); } catch (_) {}
          scannerRef.current = null;
        });
    };
  }, [active, continuous, handleScan, containerId]);

  if (!active) return null;

  return (
    <VStack spacing={2} w="full">
      {/* Input manual — sempre visível, funciona com pistola bluetooth também */}
      <form onSubmit={handleManualSubmit} style={{ width: "100%" }}>
        <HStack spacing={2}>
          <InputGroup size="sm" flex={1}>
            <InputLeftElement pointerEvents="none">
              <SearchIcon color={mutedColor} boxSize={3} />
            </InputLeftElement>
            <Input
              ref={inputRef}
              placeholder="Digitar ou bipar código..."
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              borderRadius="lg"
              autoFocus
              inputMode="numeric"
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

      {/* Câmera */}
      {cameraAvailable ? (
        <>
          <Box
            id={containerId}
            ref={containerRef}
            w="full"
            h={height}
            bg={bg}
            borderRadius="xl"
            overflow="hidden"
            position="relative"
            sx={{
              "& video": { borderRadius: "xl" },
              "& #qr-shaded-region": { borderColor: "blue.400 !important" },
            }}
          />
          <Text fontSize="xs" color={mutedColor} textAlign="center">
            Aponte a câmera ou use o campo acima
          </Text>
        </>
      ) : (
        <Flex
          w="full"
          py={4}
          justify="center"
          bg={bg}
          borderRadius="xl"
        >
          <Text fontSize="xs" color={mutedColor} textAlign="center">
            Câmera indisponível — use o campo acima para digitar ou bipar com pistola
          </Text>
        </Flex>
      )}
    </VStack>
  );
}
