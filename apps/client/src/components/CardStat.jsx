import { Box, Text, useColorModeValue } from "@chakra-ui/react";

// Rótulo + valor usado nos cards do layout mobile (mesmo padrão dos Relatórios de Estoque)
export default function CardStat({ label, children }) {
  const subtle = useColorModeValue("gray.500", "gray.400");
  return (
    <Box>
      <Text fontSize="10px" textTransform="uppercase" letterSpacing="wide" color={subtle}>{label}</Text>
      <Box fontSize="sm" fontWeight="medium">{children}</Box>
    </Box>
  );
}
