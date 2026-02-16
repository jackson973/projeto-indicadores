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
import { formatCurrency } from "../utils/format";

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

const TicketByStateChart = ({ data }) => (
  <Box className="panel" bg="white" p={6} borderRadius="lg" boxShadow="sm">
    <Flex justify="space-between" align="center" mb={4}>
      <Text fontSize="lg" fontWeight="bold">
        Ticket médio por estado
      </Text>
      <Button size="sm" onClick={() => downloadCsv(data, "ticket_medio_por_estado.csv")} colorScheme="blue">
        Exportar CSV
      </Button>
    </Flex>
    <div className="chart">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="state" />
          <YAxis />
          <Tooltip formatter={(value) => [formatCurrency(value), "Ticket médio"]} />
          <Bar dataKey="average" fill="#319795" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </Box>
);

export default TicketByStateChart;
