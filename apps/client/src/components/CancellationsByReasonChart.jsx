import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { Box, Button, Flex, Text } from "@chakra-ui/react";

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

const CancellationsByReasonChart = ({ data }) => (
  <Box className="panel" bg="white" p={6} borderRadius="lg" boxShadow="sm">
    <Flex justify="space-between" align="center" mb={4}>
      <Text fontSize="lg" fontWeight="bold">
        Cancelamentos por motivo
      </Text>
      <Button size="sm" onClick={() => downloadCsv(data, "cancelamentos_por_motivo.csv")} colorScheme="blue">
        Exportar CSV
      </Button>
    </Flex>
    <div className="chart">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="reason" />
          <YAxis />
          <Tooltip formatter={(value) => [value, "Qtde"]} />
          <Bar dataKey="count" fill="#e53e3e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </Box>
);

export default CancellationsByReasonChart;
