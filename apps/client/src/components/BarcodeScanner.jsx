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

// ─── Audio feedback via Web Audio API (no files needed) ─────────────────────

function playBeep(type = "success") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.frequency.value = 1400;
      gain.gain.value = 1.0;
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === "duplicate") {
      osc.frequency.value = 700;
      gain.gain.value = 1.0;
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // error: two short low beeps
      osc.frequency.value = 350;
      gain.gain.value = 1.0;
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 350;
      gain2.gain.value = 1.0;
      osc2.start(ctx.currentTime + 0.3);
      osc2.stop(ctx.currentTime + 0.5);
    }
  } catch (_) {}
}

/**
 * BarcodeScanner — input para leitor/digitação + câmera fullscreen opcional.
 *
 * Props:
 *  - onScan(code) — deve retornar (ou resolver Promise com):
 *      { status: "success", message: "..." }
 *      { status: "duplicate", message: "..." }
 *      { status: "error", message: "..." }
 *    Se não retornar nada, assume sucesso.
 *  - active, continuous
 */
export default function BarcodeScanner({
  onScan,
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
  const [feedback, setFeedback] = useState(null); // { status, message, code }
  const mutedColor = useColorModeValue("gray.500", "gray.400");

  const handleScan = useCallback(
    async (decodedText) => {
      const code = decodedText.trim();
      if (!code) return;
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastTimeRef.current < 1500) return;
      lastCodeRef.current = code;
      lastTimeRef.current = now;

      try {
        const result = await onScan?.(code);
        const status = result?.status || "success";
        const message = result?.message || code;
        setFeedback({ status, message, code });
        playBeep(status);
      } catch (err) {
        setFeedback({ status: "error", message: err.message || "Erro", code });
        playBeep("error");
      }
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
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const w = Math.floor(viewfinderWidth * 0.85);
              const h = Math.floor(viewfinderHeight * 0.35);
              return { width: Math.max(w, 250), height: Math.max(h, 150) };
            },
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

  useEffect(() => {
    if (!active) setCameraOn(false);
  }, [active]);

  if (!active) return null;

  const feedbackColor = feedback?.status === "success" ? "green"
    : feedback?.status === "duplicate" ? "yellow"
    : feedback?.status === "error" ? "red" : "gray";

  return (
    <>
      <VStack spacing={2} w="full">
        {/* Input — sempre visível */}
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

        {!cameraOn && (
          <Button
            size="xs"
            variant="ghost"
            color={mutedColor}
            onClick={() => { setCameraError(null); setFeedback(null); setCameraOn(true); }}
          >
            Abrir câmera
          </Button>
        )}

        {/* Feedback inline (for gun/manual input) */}
        {feedback && !cameraOn && (
          <Box
            w="full" px={3} py={2} borderRadius="md"
            bg={`${feedbackColor}.50`} border="1px solid" borderColor={`${feedbackColor}.200`}
          >
            <Text fontSize="xs" fontFamily="mono" fontWeight="bold">{feedback.code}</Text>
            <Text fontSize="xs" color={`${feedbackColor}.700`}>{feedback.message}</Text>
          </Box>
        )}

        {cameraError && (
          <Text fontSize="xs" color="red.500" textAlign="center">{cameraError}</Text>
        )}
      </VStack>

      {/* Câmera fullscreen via portal */}
      {cameraOn && createPortal(
        <Box
          position="fixed"
          top={0} left={0} right={0} bottom={0}
          zIndex={9999}
          bg="black"
          display="flex"
          flexDirection="column"
        >
          {/* Header */}
          <Flex
            px={4} py={3}
            align="center" justify="space-between"
            bg="blackAlpha.800"
            position="absolute" top={0} left={0} right={0}
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

          {/* Camera */}
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

          {/* Bottom feedback bar */}
          <Box
            px={4} py={3}
            bg={feedback ? `${feedbackColor}.600` : "blackAlpha.800"}
            position="absolute" bottom={0} left={0} right={0}
            zIndex={1}
            transition="background 0.2s"
          >
            {feedback ? (
              <VStack spacing={0}>
                <Text color="white" fontSize="xs" fontWeight="bold">
                  {feedback.status === "success" ? "Vinculado!"
                    : feedback.status === "duplicate" ? "Já adicionado!"
                    : "Erro!"}
                </Text>
                <Text color="white" fontSize="sm" fontFamily="mono">{feedback.code}</Text>
                <Text color="whiteAlpha.800" fontSize="xs">{feedback.message}</Text>
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
