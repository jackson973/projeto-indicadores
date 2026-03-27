import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
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

// ─── Audio feedback via custom sound files ──────────────────────────────────
// Place your .m4a/.mp3/.wav files in apps/client/public/sounds/

const SOUND_FILES = {
  success:   "/sounds/beep-success.m4a",
  duplicate: "/sounds/beep-duplicate.m4a",
  error:     "/sounds/beep-error.m4a",
};

const audioCache = {};
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  for (const src of Object.values(SOUND_FILES)) {
    if (!audioCache[src]) {
      const a = new Audio(src);
      a.volume = 0;
      a.play().then(() => { a.pause(); a.volume = 1; a.currentTime = 0; }).catch(() => {});
      audioCache[src] = a;
    }
  }
}

function playBeep(type = "success") {
  try {
    const src = SOUND_FILES[type] || SOUND_FILES.error;
    if (!audioCache[src]) audioCache[src] = new Audio(src);
    const audio = audioCache[src];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (_) {}
}

// ─── Native BarcodeDetector scanner (hardware-accelerated) ──────────────────

function startNativeScanner(videoEl, onDetected, signal) {
  const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8"] });
  let running = true;
  let scanning = false;
  let frameCount = 0;
  const startTime = performance.now();

  console.log("[Scanner] Native BarcodeDetector started, waiting for video...");
  signal.addEventListener("abort", () => { running = false; console.log("[Scanner] Stopped"); });

  async function scan() {
    if (!running) return;
    if (scanning || videoEl.readyState < 2) {
      requestAnimationFrame(scan);
      return;
    }
    scanning = true;
    frameCount++;
    try {
      const t0 = performance.now();
      const barcodes = await detector.detect(videoEl);
      const dt = (performance.now() - t0).toFixed(1);
      if (barcodes.length > 0 && running) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`[Scanner] DETECTED: ${barcodes[0].rawValue} (${dt}ms detect, frame #${frameCount}, ${elapsed}s since start)`);
        onDetected(barcodes[0].rawValue);
      }
    } catch (err) {
      console.warn("[Scanner] detect() error:", err.message);
    }
    scanning = false;
    if (running) requestAnimationFrame(scan);
  }

  if (videoEl.readyState >= 2) {
    console.log("[Scanner] Video already ready, starting scan loop");
    requestAnimationFrame(scan);
  } else {
    videoEl.addEventListener("loadeddata", () => {
      console.log(`[Scanner] Video ready (${((performance.now() - startTime) / 1000).toFixed(1)}s), starting scan loop`);
      requestAnimationFrame(scan);
    }, { once: true });
  }
}

// ─── Fallback: html5-qrcode (JS-based, slower) ─────────────────────────────

async function startFallbackScanner(containerId, onDetected, signal) {
  const { Html5Qrcode } = await import("html5-qrcode");
  const scanner = new Html5Qrcode(containerId);

  signal.addEventListener("abort", () => {
    scanner.stop().catch(() => {});
    try { scanner.clear(); } catch (_) {}
  });

  await scanner.start(
    { facingMode: "environment" },
    {
      fps: 20,
      qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.floor(h * 0.4) }),
      formatsToSupport: [4, 3],
      disableFlip: true,
    },
    onDetected,
    () => {}
  );
  return scanner;
}

// ─── Check if native BarcodeDetector is available ───────────────────────────

const hasNativeDetector = typeof window !== "undefined"
  && "BarcodeDetector" in window;

console.log(`[Scanner] BarcodeDetector nativo: ${hasNativeDetector ? "SIM" : "NÃO (usando fallback html5-qrcode)"}`);

/**
 * BarcodeScanner — input para leitor/digitação + câmera fullscreen opcional.
 * Uses native BarcodeDetector API when available (instant), falls back to html5-qrcode.
 */
export default function BarcodeScanner({
  onScan,
  active = true,
  continuous = true,
}) {
  const videoRef = useRef(null);
  const lastCodeRef = useRef(null);
  const lastTimeRef = useRef(0);
  const inputRef = useRef(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [useNative, setUseNative] = useState(hasNativeDetector);
  const mutedColor = useColorModeValue("gray.500", "gray.400");

  const handleScan = useCallback(
    async (decodedText) => {
      const code = decodedText.trim();
      if (!code) return;
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastTimeRef.current < 800) return;
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
    unlockAudio();
    const code = manualCode.trim();
    if (!code) return;
    handleScan(code);
    setManualCode("");
    inputRef.current?.focus();
  }

  // ─── Native camera scanner ─────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !cameraOn || !useNative) return;

    const abortController = new AbortController();
    let stream = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        // Try to enable continuous autofocus via track constraints
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track.getCapabilities?.() || {};
          if (caps.focusMode?.includes("continuous")) {
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
            console.log("[Scanner] Continuous autofocus enabled");
          }
          if (caps.torch) {
            console.log("[Scanner] Torch available");
          }
          console.log("[Scanner] Camera resolution:", track.getSettings().width, "x", track.getSettings().height);
        } catch (_) {}
        if (abortController.signal.aborted) { stream.getTracks().forEach(t => t.stop()); return; }

        const video = videoRef.current;
        if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();

        startNativeScanner(video, (code) => {
          handleScan(code);
          if (!continuous) setCameraOn(false);
        }, abortController.signal);
      } catch (err) {
        // If native fails, try fallback
        setUseNative(false);
        setCameraError(null);
      }
    })();

    return () => {
      abortController.abort();
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active, cameraOn, useNative, continuous, handleScan]);

  // ─── Fallback html5-qrcode scanner ────────────────────────────────────────
  useEffect(() => {
    if (!active || !cameraOn || useNative) return;

    const abortController = new AbortController();
    const containerId = "barcode-fallback-container";

    const timeout = setTimeout(() => {
      const el = document.getElementById(containerId);
      if (!el) return;
      startFallbackScanner(containerId, (code) => {
        handleScan(code);
        if (!continuous) setCameraOn(false);
      }, abortController.signal).catch((err) => {
        setCameraError("Câmera indisponível");
        setCameraOn(false);
      });
    }, 100);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [active, cameraOn, useNative, continuous, handleScan]);

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
            onClick={() => { unlockAudio(); setCameraError(null); setFeedback(null); setCameraOn(true); }}
          >
            Abrir câmera
          </Button>
        )}

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

          {/* Camera view */}
          {useNative ? (
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                flex: 1,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <Box
              id="barcode-fallback-container"
              flex={1}
              sx={{
                "& video": {
                  width: "100% !important",
                  height: "100% !important",
                  objectFit: "cover",
                },
              }}
            />
          )}

          {/* Scan area overlay (native mode) */}
          {useNative && (
            <Box
              position="absolute"
              top="50%" left="50%"
              transform="translate(-50%, -50%)"
              w="85%" h="25%"
              border="3px solid"
              borderColor="rgba(66, 153, 225, 0.7)"
              borderRadius="xl"
              pointerEvents="none"
              zIndex={1}
            />
          )}

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
