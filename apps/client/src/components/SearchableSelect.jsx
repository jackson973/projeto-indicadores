import { useState, useRef, useEffect, useMemo } from "react";
import {
  Box,
  Input,
  InputGroup,
  InputLeftElement,
  List,
  ListItem,
  Text,
  useColorModeValue,
  useOutsideClick
} from "@chakra-ui/react";
import { SearchIcon, ChevronDownIcon } from "@chakra-ui/icons";

/**
 * Searchable select dropdown replacement.
 *
 * Props:
 *  - options: [{ value, label }]
 *  - value: selected value
 *  - onChange(value): callback
 *  - placeholder: input placeholder
 *  - size: "sm" | "md" (default "md")
 *  - isDisabled: boolean
 *  - w: width override
 */
const SearchableSelect = ({
  options = [],
  value,
  onChange,
  placeholder = "Selecione...",
  size = "md",
  isDisabled = false,
  w,
  ...rest
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const bg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const hoverBg = useColorModeValue("blue.50", "blue.900");
  const selectedBg = useColorModeValue("blue.100", "blue.800");

  useOutsideClick({ ref: containerRef, handler: () => setIsOpen(false) });

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const normalize = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const term = normalize(search);
    return options.filter((o) => normalize(o.label).includes(term));
  }, [options, search]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearch("");
  };

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const displayValue = selectedOption ? selectedOption.label : "";

  return (
    <Box ref={containerRef} position="relative" w={w || "100%"} {...rest}>
      {/* Closed state: looks like a select */}
      {!isOpen ? (
        <InputGroup size={size}>
          <Input
            readOnly
            cursor={isDisabled ? "not-allowed" : "pointer"}
            value={displayValue}
            placeholder={placeholder}
            onClick={() => !isDisabled && setIsOpen(true)}
            opacity={isDisabled ? 0.4 : 1}
            pr="2rem"
          />
          <Box
            position="absolute"
            right="0.5rem"
            top="50%"
            transform="translateY(-50%)"
            pointerEvents="none"
            color="gray.500"
          >
            <ChevronDownIcon />
          </Box>
        </InputGroup>
      ) : (
        /* Open state: search input + dropdown */
        <>
          <InputGroup size={size}>
            <InputLeftElement pointerEvents="none">
              <SearchIcon color="gray.400" />
            </InputLeftElement>
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsOpen(false);
                  setSearch("");
                } else if (e.key === "Enter" && filtered.length === 1) {
                  handleSelect(filtered[0].value);
                }
              }}
            />
          </InputGroup>
          <List
            position="absolute"
            zIndex={1400}
            bg={bg}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="md"
            mt={1}
            maxH="220px"
            overflowY="auto"
            w="100%"
            boxShadow="lg"
            py={1}
          >
            {filtered.length === 0 ? (
              <ListItem px={3} py={2}>
                <Text fontSize="sm" color="gray.500">Nenhum resultado</Text>
              </ListItem>
            ) : (
              filtered.map((o) => (
                <ListItem
                  key={o.value}
                  px={3}
                  py={1.5}
                  cursor="pointer"
                  fontSize={size === "sm" ? "sm" : "md"}
                  bg={String(o.value) === String(value) ? selectedBg : undefined}
                  _hover={{ bg: hoverBg }}
                  onClick={() => handleSelect(o.value)}
                >
                  {o.label}
                </ListItem>
              ))
            )}
          </List>
        </>
      )}
    </Box>
  );
};

export default SearchableSelect;
