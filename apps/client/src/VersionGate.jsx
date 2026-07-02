import React, { useState, useEffect } from "react";
import { Box, Text, Button } from "@chakra-ui/react";

// SHA do build (injetado pelo Vite). Comparado com o SHA do servidor (/api/version)
// para detectar quando o navegador está servindo um bundle antigo (cache).
const APP_SHA = typeof __GIT_SHA__ !== "undefined" ? __GIT_SHA__ : "dev";

// Força a atualização ignorando qualquer cache: desregistra o service worker,
// limpa os caches do navegador e recarrega — pega sempre o bundle novo.
async function forceUpdateNow() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* segue para o reload de qualquer forma */ }
  window.location.reload();
}

// Banner "Nova versão — Atualizar" que aparece quando o servidor está num commit
// diferente do bundle carregado. O servidor reinicia a cada deploy, então reflete o
// commit atual; se o cliente estiver defasado (cache), oferece a atualização forçada.
export default function VersionGate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (alive && data && data.sha && data.sha !== "nogit" && APP_SHA !== "dev" && data.sha !== APP_SHA) {
          setUpdateAvailable(true);
        }
      } catch { /* offline/sem servidor — ignora */ }
    };
    check();
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    const id = setInterval(check, 5 * 60 * 1000);
    return () => { alive = false; window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  if (!updateAvailable) return null;

  return (
    <Box position="fixed" top={0} left={0} right={0} zIndex="tooltip"
         bg="purple.600" color="white" px={4} py={2} boxShadow="md"
         display="flex" alignItems="center" justifyContent="center" gap={3} fontSize="sm">
      <Text fontWeight="medium">Nova versão disponível.</Text>
      <Button size="xs" colorScheme="whiteAlpha" onClick={forceUpdateNow}>Atualizar agora</Button>
    </Box>
  );
}
