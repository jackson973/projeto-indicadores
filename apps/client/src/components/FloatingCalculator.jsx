import { useState, useRef } from "react";
import { Box, Flex, Text, Button, IconButton, SimpleGrid, useColorModeValue } from "@chakra-ui/react";
import { CloseIcon, DeleteIcon } from "@chakra-ui/icons";

// Número no padrão pt-BR para o histórico/resultado
const fmt = (n) => {
  if (!Number.isFinite(n)) return "Erro";
  return Number(n.toFixed(10)).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
};
const toNumber = (s) => parseFloat(String(s).replace(",", ".")) || 0;
const toDisplay = (n) => (Number.isFinite(n) ? String(Number(n.toFixed(10))).replace(".", ",") : "Erro");

/**
 * Calculadora flutuante, arrastável (mouse e toque) e compacta, com histórico.
 * Operação imediata (estilo calculadora de mesa): 35,53 × 3 = 106,59.
 */
export default function FloatingCalculator({ isOpen, onClose }) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState(null);      // valor acumulado
  const [op, setOp] = useState(null);        // operação pendente
  const [fresh, setFresh] = useState(true);  // próximo dígito substitui o display
  const [expr, setExpr] = useState("");      // expressão em construção (mostrada acima do display)
  const [history, setHistory] = useState([]);
  const [pos, setPos] = useState(null);      // null = posição padrão (canto inferior direito)
  const boxRef = useRef(null);

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.600");
  const headBg = useColorModeValue("gray.100", "gray.700");
  const dispBg = useColorModeValue("gray.50", "gray.900");
  const histBg = useColorModeValue("gray.50", "gray.750");
  const subtle = useColorModeValue("gray.500", "gray.400");

  if (!isOpen) return null;

  const compute = (a, b, o) => {
    if (o === "+") return a + b;
    if (o === "−") return a - b;
    if (o === "×") return a * b;
    if (o === "÷") return b === 0 ? NaN : a / b;
    return b;
  };

  const pressDigit = (d) => {
    setDisplay(prev => {
      if (fresh) return d === "," ? "0," : d;
      if (d === "," && prev.includes(",")) return prev;
      if (prev === "0" && d !== ",") return d;
      return prev.length >= 14 ? prev : prev + d;
    });
    setFresh(false);
  };

  const pressOp = (o) => {
    const cur = toNumber(display);
    if (op !== null && !fresh) {
      const r = compute(acc, cur, op);
      setAcc(r);
      setDisplay(toDisplay(r));
      setExpr(`${fmt(r)} ${o}`);
    } else {
      setAcc(op !== null ? acc : cur);
      setExpr(`${fmt(op !== null ? acc : cur)} ${o}`);
    }
    setOp(o);
    setFresh(true);
  };

  const pressEquals = () => {
    if (op === null || acc === null) return;
    const cur = toNumber(display);
    const r = compute(acc, cur, op);
    setHistory(prev => [{ expr: `${fmt(acc)} ${op} ${fmt(cur)}`, result: r }, ...prev].slice(0, 30));
    setDisplay(toDisplay(r));
    setExpr("");
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const pressPercent = () => {
    // Com operação pendente, % é relativo ao acumulado (ex.: 200 + 10% = 220)
    const cur = toNumber(display);
    const v = op && acc !== null ? (acc * cur) / 100 : cur / 100;
    setDisplay(toDisplay(v));
    setFresh(false);
  };

  const clearAll = () => { setDisplay("0"); setAcc(null); setOp(null); setExpr(""); setFresh(true); };
  const backspace = () => {
    if (fresh) return;
    setDisplay(prev => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  };
  const useHistory = (h) => { setDisplay(toDisplay(h.result)); setAcc(null); setOp(null); setExpr(""); setFresh(true); };

  // Arrasto pela barra do topo (pointer events cobrem mouse e toque)
  const startDrag = (e) => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const ox = rect.left, oy = rect.top;
    const move = (ev) => {
      setPos({
        x: Math.min(Math.max(ox + ev.clientX - sx, 4), window.innerWidth - rect.width - 4),
        y: Math.min(Math.max(oy + ev.clientY - sy, 4), window.innerHeight - 80),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  };

  const KEYS = [
    ["C", "⌫", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "−"],
    ["1", "2", "3", "+"],
    ["0", ",", "=", "="],
  ];
  const press = (k) => {
    if (k === "C") return clearAll();
    if (k === "⌫") return backspace();
    if (k === "%") return pressPercent();
    if (k === "=") return pressEquals();
    if (["+", "−", "×", "÷"].includes(k)) return pressOp(k);
    return pressDigit(k);
  };

  return (
    <Box
      ref={boxRef}
      position="fixed"
      zIndex={1300}
      w="236px"
      maxW="calc(100vw - 16px)"
      bg={cardBg}
      borderWidth="1px"
      borderColor={border}
      borderRadius="xl"
      boxShadow="2xl"
      overflow="hidden"
      style={pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 110 }}
    >
      {/* Barra de arrasto */}
      <Flex
        align="center" px={3} py={1.5} bg={headBg} cursor="grab"
        onPointerDown={startDrag} style={{ touchAction: "none" }} userSelect="none"
      >
        <Text fontSize="xs" fontWeight="bold">🧮 Calculadora</Text>
        <Text fontSize="10px" color={subtle} ml={2}>arraste aqui</Text>
        <IconButton icon={<CloseIcon boxSize={2} />} size="xs" variant="ghost" aria-label="Fechar" ml="auto"
          onPointerDown={e => e.stopPropagation()} onClick={onClose} />
      </Flex>

      {/* Histórico (mais recente em cima; clique reaproveita o resultado) */}
      {history.length > 0 && (
        <Box bg={histBg} maxH="88px" overflowY="auto" px={3} py={1} borderBottomWidth="1px" borderColor={border}>
          <Flex justify="flex-end">
            <IconButton icon={<DeleteIcon boxSize={2.5} />} size="xs" variant="ghost" color={subtle}
              aria-label="Limpar histórico" title="Limpar histórico" onClick={() => setHistory([])} h="18px" minW="18px" />
          </Flex>
          {history.map((h, i) => (
            <Flex key={i} justify="space-between" gap={2} fontSize="11px" py="1px" cursor="pointer"
              _hover={{ color: "blue.400" }} onClick={() => useHistory(h)} title="Usar este resultado">
              <Text color={subtle} noOfLines={1}>{h.expr} =</Text>
              <Text fontWeight="bold" flexShrink={0}>{fmt(h.result)}</Text>
            </Flex>
          ))}
        </Box>
      )}

      {/* Display */}
      <Box bg={dispBg} px={3} py={2} textAlign="right">
        <Text fontSize="10px" color={subtle} h="14px" noOfLines={1}>{expr}&nbsp;</Text>
        <Text fontSize="xl" fontWeight="bold" fontFamily="mono" noOfLines={1}>{display}</Text>
      </Box>

      {/* Teclas */}
      <SimpleGrid columns={4} spacing="1px" bg={border}>
        {KEYS.flat().map((k, i) => {
          // o "=" ocupa duas células (última linha)
          if (k === "=" && i !== KEYS.flat().lastIndexOf("=")) return null;
          const isOpKey = ["+", "−", "×", "÷", "="].includes(k);
          const isFn = ["C", "⌫", "%"].includes(k);
          return (
            <Button
              key={i}
              gridColumn={k === "=" ? "span 2" : undefined}
              size="sm" h="38px" borderRadius={0} fontSize="md"
              colorScheme={k === "=" ? "blue" : undefined}
              variant={k === "=" ? "solid" : "ghost"}
              bg={k === "=" ? undefined : cardBg}
              color={isOpKey && k !== "=" ? "blue.400" : isFn ? subtle : undefined}
              fontWeight={isOpKey ? "bold" : "semibold"}
              onClick={() => press(k)}
            >
              {k}
            </Button>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
