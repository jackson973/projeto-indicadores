import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { Box, Button, Flex, Select, Text, HStack, useColorModeValue } from "@chakra-ui/react";
import { CalendarIcon } from "@chakra-ui/icons";
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

const pad2 = (value) => String(value).padStart(2, "0");

const getIsoWeekStart = (year, week) => {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  if (day <= 4) {
    simple.setUTCDate(simple.getUTCDate() - (day - 1));
  } else {
    simple.setUTCDate(simple.getUTCDate() + (8 - day));
  }
  return simple;
};

const formatShortDate = (date) => `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;

const getPeriodTooltipLabel = (label) => {
  if (!label) return { primary: "Período" };

  const weekMatch = label.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = Number(weekMatch[1]);
    const week = Number(weekMatch[2]);
    const start = getIsoWeekStart(year, week);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return {
      primary: `Período: ${formatShortDate(start)} - ${formatShortDate(end)}`,
      secondary: `Semana: ${week}`
    };
  }

  const dayMatch = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch) {
    const date = new Date(Number(dayMatch[1]), Number(dayMatch[2]) - 1, Number(dayMatch[3]));
    return {
      primary: `Data: ${formatShortDate(date)}`
    };
  }

  const monthMatch = label.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const date = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1);
    const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(date);
    return {
      primary: `Mês: ${monthLabel} / ${monthMatch[1]}`
    };
  }

  return { primary: `Período: ${label}` };
};

const formatXAxisLabel = (label) => {
  if (!label) return "";
  const weekMatch = label.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const start = getIsoWeekStart(Number(weekMatch[1]), Number(weekMatch[2]));
    return `${formatShortDate(start)}`;
  }
  const dayMatch = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch) {
    return `${dayMatch[3]}/${dayMatch[2]}`;
  }
  const monthMatch = label.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const date = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1);
    const m = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date);
    return `${m}/${monthMatch[1].slice(2)}`;
  }
  return label;
};

const SalesByPeriodChart = ({ data, period, onPeriodChange }) => {
  const panelBg = useColorModeValue("white", "gray.800");
  const tooltipBg = useColorModeValue("white", "gray.800");
  const tooltipBorder = useColorModeValue("gray.100", "gray.700");
  const tooltipText = useColorModeValue("gray.800", "gray.100");
  const tooltipSubText = useColorModeValue("gray.600", "gray.300");

  return (
    <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm">
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="bold">
          <HStack spacing={2}>
            <CalendarIcon color="blue.500" />
            <span>Vendas</span>
          </HStack>
        </Text>
        <HStack spacing={2}>
          <Select
            size="sm"
            w="130px"
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
          >
            <option value="month">Mensal</option>
            <option value="week">Semanal</option>
            <option value="day">Diário</option>
          </Select>
          <Button size="sm" onClick={() => downloadCsv(data, "vendas_por_periodo.csv")} colorScheme="blue">
            Exportar CSV
          </Button>
        </HStack>
      </Flex>
      <div className="chart">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" tickFormatter={formatXAxisLabel} fontSize={11} angle={-35} textAnchor="end" height={50} interval="preserveStartEnd" />
            <YAxis />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const { primary, secondary } = getPeriodTooltipLabel(label);
                return (
                  <Box bg={tooltipBg} border="1px solid" borderColor={tooltipBorder} borderRadius="md" p={3} boxShadow="md">
                    <Text fontWeight="semibold" color={tooltipText}>
                      {primary}
                    </Text>
                    {secondary && (
                      <Text fontSize="sm" color={tooltipSubText}>
                        {secondary}
                      </Text>
                    )}
                    <Text fontSize="sm" color={tooltipSubText}>
                      Total: {formatCurrency(payload[0].value)}
                    </Text>
                  </Box>
                );
              }}
            />
            <Line type="monotone" dataKey="total" stroke="#3182ce" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Box>
  );
};

export default SalesByPeriodChart;
