import { Box, Button, Flex, Text, Tooltip, HStack, useColorModeValue } from "@chakra-ui/react";
import { InfoIcon } from "@chakra-ui/icons";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
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

const GEO_URL =
  "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

const stateNameToUf = {
  Acre: "AC",
  Alagoas: "AL",
  Amapa: "AP",
  Amazonas: "AM",
  Bahia: "BA",
  Ceara: "CE",
  "Distrito Federal": "DF",
  "Espirito Santo": "ES",
  Goias: "GO",
  Maranhao: "MA",
  "Mato Grosso": "MT",
  "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG",
  Para: "PA",
  Paraiba: "PB",
  Parana: "PR",
  Pernambuco: "PE",
  Piaui: "PI",
  "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS",
  Rondonia: "RO",
  Roraima: "RR",
  "Santa Catarina": "SC",
  "Sao Paulo": "SP",
  Sergipe: "SE",
  Tocantins: "TO"
};

const normalizeState = (value) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const hexToRgb = (hex) => {
  const sanitized = hex.replace("#", "");
  const value = sanitized.length === 3
    ? sanitized.split("").map((char) => char + char).join("")
    : sanitized;
  const intValue = parseInt(value, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255
  };
};

const mixColor = (start, end, t) => {
  const clamp = Math.min(1, Math.max(0, t));
  const r = Math.round(start.r + (end.r - start.r) * clamp);
  const g = Math.round(start.g + (end.g - start.g) * clamp);
  const b = Math.round(start.b + (end.b - start.b) * clamp);
  return `rgb(${r}, ${g}, ${b})`;
};

const SalesByStateChart = ({ data }) => {
  const panelBg = useColorModeValue("white", "gray.800");
  const tooltipBg = useColorModeValue("white", "gray.800");
  const tooltipColor = useColorModeValue("gray.800", "gray.100");
  const grandTotal = data.reduce((sum, item) => sum + item.total, 0) || 1;
  const shares = data.map((item) => item.total / grandTotal).filter((value) => value > 0);
  const maxShare = Math.max(...shares, 0);
  const minShare = Math.min(...shares, maxShare || 0);
  const lightBlue = hexToRgb("#dbeafe");
  const darkBlue = hexToRgb("#1d4ed8");

  const values = data.reduce((acc, item) => {
    acc[item.state] = item.total;
    return acc;
  }, {});
  const shareByState = data.reduce((acc, item) => {
    acc[item.state] = item.total / grandTotal;
    return acc;
  }, {});

  return (
    <Box className="panel" bg={panelBg} p={6} borderRadius="lg" boxShadow="sm">
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="lg" fontWeight="bold">
          <HStack spacing={2}>
            <InfoIcon color="blue.500" />
            <span>Vendas por estado</span>
          </HStack>
        </Text>
        <Button size="sm" onClick={() => downloadCsv(data, "vendas_por_estado.csv")} colorScheme="blue">
          Exportar CSV
        </Button>
      </Flex>
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 700, center: [-54, -15] }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const rawName = geo.properties.name || geo.properties.NAME_1 || "";
              const normalized = normalizeState(rawName);
              const uf = geo.properties.sigla || stateNameToUf[normalized] || rawName;
              const value = values[uf] || values[rawName] || 0;
              const share = shareByState[uf] || shareByState[rawName] || value / grandTotal;
              const tooltipLabel = `UF: ${uf}\nValor vendido: ${formatCurrency(value)}\n% de participação: ${formatPercent(share)}`;

              const normalizedShare = maxShare > minShare
                ? (share - minShare) / (maxShare - minShare)
                : share > 0
                  ? 1
                  : 0;
              const fillColor = share > 0 ? mixColor(lightBlue, darkBlue, normalizedShare) : "transparent";
              const strokeColor = value > 0 ? "#ffffff" : "#94a3b8";

              return (
                <Tooltip
                  key={geo.rsmKey}
                  label={<Text whiteSpace="pre-line">{tooltipLabel}</Text>}
                  bg={tooltipBg}
                  color={tooltipColor}
                >
                  <Geography
                    geography={geo}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={0.6}
                  />
                </Tooltip>
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </Box>
  );
};

export default SalesByStateChart;
