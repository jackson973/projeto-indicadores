import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { Box, Button, Flex, Select, Text, HStack, useColorModeValue, Checkbox, VStack } from "@chakra-ui/react";
import { useAnimationCycle } from "../hooks/useAnimationCycle";
import { CalendarIcon } from "@chakra-ui/icons";
import { formatCurrency } from "../utils/format";

const linearRegression = (points) => {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += points[i];
    sumXY += i * points[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
};

const MIN_POINTS_FOR_TREND = 4;

const buildTrendAndProjection = (data, showTrend, showProjection, period) => {
  if (!data || data.length < 2) return data || [];

  const hasTrend = (showTrend || showProjection) && data.length >= MIN_POINTS_FOR_TREND;

  if (!hasTrend) {
    return data.map((d) => ({ ...d }));
  }

  // Use median of neighboring points to reduce outlier impact from partial periods
  const values = data.map((d) => d.total);
  // Detect and dampen partial first/last periods for week/month
  // If the first value is less than 50% of the second, it's likely partial
  if ((period === "week" || period === "month") && values.length >= 3) {
    if (values[0] < values[1] * 0.5) {
      values[0] = values[1]; // Replace with next full period
    }
    const last = values.length - 1;
    if (values[last] < values[last - 1] * 0.5) {
      values[last] = values[last - 1]; // Replace with previous full period
    }
  }

  const { slope, intercept } = linearRegression(values);

  const projectionCount = period === "day" ? 7 : period === "week" ? 4 : 3;

  const result = data.map((d, i) => ({
    ...d,
    trend: showTrend ? Math.round(intercept + slope * i) : undefined
  }));

  if (showProjection) {
    const lastEntry = data[data.length - 1];
    result[result.length - 1].projection = lastEntry.total;

    for (let j = 1; j <= projectionCount; j++) {
      const idx = data.length - 1 + j;
      const projectedValue = Math.max(0, Math.round(intercept + slope * idx));
      const trendValue = showTrend ? projectedValue : undefined;
      result.push({
        period: `proj_${j}`,
        total: undefined,
        trend: trendValue,
        projection: projectedValue
      });
    }
  }

  return result;
};

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

const SalesByPeriodChart = ({ data, period, onPeriodChange, autoplay = true }) => {
  const cycle = useAnimationCycle(30000, 0, autoplay);
  const [showTrend, setShowTrend] = useState(false);
  const [showProjection, setShowProjection] = useState(false);
  const panelBg = useColorModeValue("white", "gray.800");
  const tooltipBg = useColorModeValue("white", "gray.800");
  const tooltipBorder = useColorModeValue("gray.100", "gray.700");
  const tooltipText = useColorModeValue("gray.800", "gray.100");
  const tooltipSubText = useColorModeValue("gray.600", "gray.300");

  const notEnoughData = (showTrend || showProjection) && (!data || data.length < MIN_POINTS_FOR_TREND);

  const chartData = useMemo(
    () => buildTrendAndProjection(data, showTrend, showProjection, period),
    [data, showTrend, showProjection, period]
  );

  const formatXAxisLabelWithProjection = (label) => {
    if (typeof label === "string" && label.startsWith("proj_")) {
      const idx = Number(label.replace("proj_", ""));
      if (period === "day") return `+${idx}d`;
      if (period === "week") return `+${idx}s`;
      return `+${idx}m`;
    }
    return formatXAxisLabel(label);
  };

  return (
    <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm">
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="bold">
          <HStack spacing={2}>
            <CalendarIcon color="blue.500" />
            <span>Vendas</span>
          </HStack>
        </Text>
        <HStack spacing={3}>
          <Checkbox size="sm" isChecked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} colorScheme="orange">
            Tendência
          </Checkbox>
          <Checkbox size="sm" isChecked={showProjection} onChange={(e) => setShowProjection(e.target.checked)} colorScheme="green">
            Projeção
          </Checkbox>
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
      {notEnoughData && (
        <Text fontSize="xs" color="orange.500" mb={2}>
          Mínimo de {MIN_POINTS_FOR_TREND} períodos necessários para tendência/projeção. Tente o modo Diário.
        </Text>
      )}
      <div className="chart">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart key={cycle} data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" tickFormatter={formatXAxisLabelWithProjection} fontSize={11} angle={-35} textAnchor="end" height={50} interval="preserveStartEnd" />
            <YAxis />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const isProjection = typeof label === "string" && label.startsWith("proj_");
                const { primary, secondary } = isProjection
                  ? { primary: "Projeção", secondary: undefined }
                  : getPeriodTooltipLabel(label);
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
                    {payload.map((entry) => (
                      <Text key={entry.dataKey} fontSize="sm" color={tooltipSubText}>
                        {entry.dataKey === "total" ? "Total" : entry.dataKey === "trend" ? "Tendência" : "Projeção"}:{" "}
                        {formatCurrency(entry.value)}
                      </Text>
                    ))}
                  </Box>
                );
              }}
            />
            <Line type="monotone" dataKey="total" stroke="#3182ce" strokeWidth={2} dot connectNulls={false} isAnimationActive animationDuration={1200} animationEasing="ease-in-out" />
            {showTrend && (
              <Line type="linear" dataKey="trend" stroke="#dd6b20" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls isAnimationActive animationDuration={800} />
            )}
            {showProjection && (
              <Line type="monotone" dataKey="projection" stroke="#38a169" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} connectNulls isAnimationActive animationDuration={800} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Box>
  );
};

export default SalesByPeriodChart;
