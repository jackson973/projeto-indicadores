import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { Box, Button, Flex, Image, Text, HStack, useColorModeValue } from "@chakra-ui/react";
import { InfoIcon } from "@chakra-ui/icons";
import { formatCurrency, formatPercent } from "../utils/format";

const downloadCsv = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${row[key]}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const renderLegend = (payload, total, textColor) => (
  <Flex wrap="wrap" gap={2} justify="center" mt={2}>
    {payload.map((entry) => {
      const percent = total > 0 ? entry.payload?.total / total : 0;
      return (
        <Flex key={entry.value} align="center" gap={1} fontSize="xs" color={textColor}>
          <Box w="8px" h="8px" borderRadius="full" bg={entry.color} flexShrink={0} />
          <Text>
            {entry.value} • {formatPercent(percent, 1)}
          </Text>
        </Flex>
      );
    })}
  </Flex>
);

const renderTooltip = (payload, total, bg, border, textColor, subTextColor) => {
  if (!payload?.length) return null;
  const entry = payload[0];
  const percent = total > 0 ? entry.value / total : 0;
  return (
    <Box bg={bg} p={3} borderRadius="md" boxShadow="md" border="1px solid" borderColor={border}>
      <Flex align="center" gap={2} mb={2}>
        <Text fontWeight="semibold" color={textColor}>
          {entry.name}
        </Text>
      </Flex>
      <Text fontSize="sm" color={subTextColor}>
        Total: {formatCurrency(entry.value)}
      </Text>
      <Text fontSize="sm" color={subTextColor}>
        Participação: {formatPercent(percent, 1)}
      </Text>
    </Box>
  );
};

const SalesByStoreChart = ({ data }) => {
  const total = data.reduce((sum, item) => sum + (item.total || 0), 0) || 1;
  const panelBg = useColorModeValue("white", "gray.800");
  const tooltipBg = useColorModeValue("white", "gray.800");
  const tooltipBorder = useColorModeValue("gray.100", "gray.700");
  const tooltipText = useColorModeValue("gray.800", "gray.100");
  const tooltipSubText = useColorModeValue("gray.600", "gray.300");
  const legendText = useColorModeValue("gray.600", "gray.300");

  return (
    <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm">
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="bold">
          <HStack spacing={2}>
            <InfoIcon color="blue.500" />
            <span>Vendas por loja</span>
          </HStack>
        </Text>
        <Button size="sm" onClick={() => downloadCsv(data, "vendas_por_loja.csv")} colorScheme="blue">
          Exportar CSV
        </Button>
      </Flex>
      <div className="chart">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="store" innerRadius={60} outerRadius={100}>
              {data.map((entry, index) => (
                <Cell key={`cell-${entry.store}-${index}`} fill={["#0ea5e9", "#6366f1", "#22c55e", "#f97316", "#e11d48"][index % 5]} />
              ))}
            </Pie>
            <Tooltip content={({ payload }) => renderTooltip(payload, total, tooltipBg, tooltipBorder, tooltipText, tooltipSubText)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {renderLegend(
        data.map((entry, index) => ({
          value: entry.store,
          color: ["#0ea5e9", "#6366f1", "#22c55e", "#f97316", "#e11d48"][index % 5],
          payload: entry
        })),
        total,
        legendText
      )}
    </Box>
  );
};

export default SalesByStoreChart;
