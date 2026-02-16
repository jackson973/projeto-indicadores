import { Box, Flex, FormControl, FormLabel, Select, Text } from "@chakra-ui/react";
import DatePicker from "react-datepicker";

const formatDateString = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateString = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const Filters = ({ filters, stores, states, onChange, variant = "panel" }) => {
  const isDrawer = variant === "drawer";
  return (
    <Box
      className={isDrawer ? undefined : "panel"}
      bg={isDrawer ? "transparent" : "white"}
      p={isDrawer ? 0 : 6}
      borderRadius={isDrawer ? "none" : "lg"}
      boxShadow={isDrawer ? "none" : "sm"}
    >
      {!isDrawer && (
        <Text fontSize="lg" fontWeight="bold" mb={4}>
          Filtros
        </Text>
      )}
      <Flex className="filters-row" flexWrap="wrap" gap={4}>
        <FormControl maxW="320px">
          <FormLabel>Período</FormLabel>
          <DatePicker
            selected={parseDateString(filters.start)}
            onChange={(dates) => {
              const [start, end] = dates || [];
              onChange({
                ...filters,
                start: start ? formatDateString(start) : "",
                end: end ? formatDateString(end) : ""
              });
            }}
            startDate={parseDateString(filters.start)}
            endDate={parseDateString(filters.end)}
            selectsRange
            isClearable
            dateFormat="yyyy-MM-dd"
            placeholderText="Selecione o intervalo"
            className="date-range-input"
          />
        </FormControl>
        <FormControl maxW="220px">
          <FormLabel>Loja</FormLabel>
          <Select value={filters.store} onChange={(event) => onChange({ ...filters, store: event.target.value })}>
            <option value="">Todas</option>
            {stores.map((store) => (
              <option key={store} value={store}>
                {store}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl maxW="220px">
          <FormLabel>Estado</FormLabel>
          <Select value={filters.state} onChange={(event) => onChange({ ...filters, state: event.target.value })}>
            <option value="">Todos</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
        </FormControl>
      </Flex>
    </Box>
  );
};

export default Filters;
