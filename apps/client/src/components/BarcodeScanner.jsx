import { useEffect, useRef, useCallback, useId, useState } from "react";
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
import { SearchIcon } from "@chakra-ui/icons";

/**
 * BarcodeScanner — input para leitor/digitação + câmera opcional.
 *
 * A câmera NÃO abre automaticamente. O usuário clica em "Abrir Câmera" se quiser.
 * O input de texto funciona imediatamente com pistola bluetooth/USB ou digitação.
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
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const bg = useColorModeValue("gray.100", "gray.700");
  const mutedColor = useColorModeValue("gray.500", "gray.400");

  const handleScan = useCallback(
    (decodedText) => {
      const code = decodedText.trim();
      if (!code) return;
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

  // Start/stop camera only when cameraOn changes
  useEffect(() => {
    if (!active || !cameraOn || !containerRef.current) return;

    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 100 },
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

    return () => {
      scanner
        .stop()
        .catch(() => {})
        .finally(() => {
          try { scanner.clear(); } catch (_) {}
          scannerRef.current = null;
        });
    };
  }, [active, cameraOn, continuous, handleScan, containerId]);

  // Turn off camera when component deactivates
  useEffect(() => {
    if (!active) setCameraOn(false);
  }, [active]);

  if (!active) return null;

  return (
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

      {/* Botão para ativar câmera (não abre automaticamente) */}
      {!cameraOn && (
        <Button
          size="xs"
          variant="ghost"
          color={mutedColor}
          onClick={() => { setCameraError(null); setCameraOn(true); }}
        >
          Abrir câmera
        </Button>
      )}

      {/* Câmera (só quando ativada pelo usuário) */}
      {cameraOn && (
        <>
          <Box
            id={containerId}
            ref={containerRef}
            w="full"
            minH={height}
            bg={bg}
            borderRadius="xl"
            position="relative"
            sx={{
              "& video": {
                borderRadius: "xl",
                objectFit: "cover",
                width: "100% !important",
                height: `${height} !important`,
                display: "block !important",
              },
              "& #qr-shaded-region": { borderColor: "blue.400 !important" },
              /* html5-qrcode injects elements that may be hidden by modal overflow */
              "& > div": { overflow: "visible !important" },
              "& img": { display: "none" }, /* hide scan-region image placeholder */
            }}
          />
          <Button
            size="xs"
            variant="ghost"
            colorScheme="red"
            onClick={() => setCameraOn(false)}
          >
            Fechar câmera
          </Button>
        </>
      )}

      {cameraError && (
        <Text fontSize="xs" color="red.500" textAlign="center">{cameraError}</Text>
      )}
    </VStack>
  );
}
