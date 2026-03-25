import { useEffect, useRef, useCallback, useId } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Box,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";

/**
 * BarcodeScanner — componente reutilizável de leitura de código de barras / QR Code via câmera.
 *
 * Props:
 *  - onScan(code: string)  — chamado quando um código é lido com sucesso
 *  - onError(err: string)  — chamado quando há erro (opcional)
 *  - active (bool)         — controla se o scanner está ativo
 *  - continuous (bool)     — se true, continua escaneando após cada leitura (default: true)
 *  - height (string)       — altura do visor (default: "260px")
 */
export default function BarcodeScanner({
  onScan,
  onError,
  active = true,
  continuous = true,
  height = "260px",
}) {
  const uniqueId = useId();
  const containerId = `barcode-scanner-${uniqueId.replace(/:/g, "")}`;
  const containerRef = useRef(null);
  const scannerRef = useRef(null);
  const lastCodeRef = useRef(null);
  const lastTimeRef = useRef(0);
  const bg = useColorModeValue("gray.100", "gray.700");
  const mutedColor = useColorModeValue("gray.500", "gray.400");

  const handleScan = useCallback(
    (decodedText) => {
      // Debounce: ignore same code within 2s
      const now = Date.now();
      if (decodedText === lastCodeRef.current && now - lastTimeRef.current < 2000) return;
      lastCodeRef.current = decodedText;
      lastTimeRef.current = now;
      onScan?.(decodedText);
    },
    [onScan]
  );

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.5,
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
        () => {} // ignore scan failures (no code in frame)
      )
      .catch((err) => {
        onError?.(typeof err === "string" ? err : err?.message || "Erro ao acessar câmera");
      });

    return () => {
      scanner
        .stop()
        .catch(() => {})
        .finally(() => {
          scanner.clear();
          scannerRef.current = null;
        });
    };
  }, [active, continuous, handleScan, onError, containerId]);

  if (!active) return null;

  return (
    <VStack spacing={2} w="full">
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
        Aponte a câmera para o código de barras
      </Text>
    </VStack>
  );
}
