import { useState, useEffect, useCallback, useRef } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";
import { SearchIcon, DownloadIcon, RepeatIcon } from "@chakra-ui/icons";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchCustomersRegistry, syncCustomersRegistry } from "../api";
import useAppToast from "../hooks/useAppToast";

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const SORT_OPTIONS = [
  { value: "codigo",        label: "Código" },
  { value: "razao",         label: "Razão Social" },
  { value: "fantasia",      label: "Fantasia" },
  { value: "ultimo_pedido", label: "Data último pedido" },
];

const fmtBRL = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const fmtPhone = (c) => {
  const ddd = (c.ddd_fone || "").trim();
  const fone = (c.telefone || "").trim();
  const compl = (c.fone_compl || "").trim();
  const main = fone ? (ddd ? `(${ddd}) ${fone}` : fone) : "";
  return [main, compl].filter(Boolean).join(" / ") || "—";
};

export default function OrdersCustomers() {
  const toast = useAppToast();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [sort, setSort] = useState("codigo");
  const debounceRef = useRef(null);

  const headerBg = useColorModeValue("gray.50", "gray.700");
  const rowHover = useColorModeValue("gray.50", "gray.700");

  const load = useCallback(async (params) => {
    setLoading(true);
    try {
      const data = await fetchCustomersRegistry(params);
      setCustomers(data);
    } catch (err) {
      toast({ title: "Erro ao carregar clientes", description: err.message, status: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load({ search, cidade, uf, sort });
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [search, cidade, uf, sort, load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncCustomersRegistry();
      toast({
        title: "Clientes sincronizados",
        description: `${result.count} cliente(s) atualizados do Sisplan.`,
        status: "success",
      });
      await load({ search, cidade, uf, sort });
    } catch (err) {
      toast({ title: "Erro na sincronização", description: err.message, status: "error" });
    } finally {
      setSyncing(false);
    }
  };

  const exportPdf = () => {
    if (!customers.length) {
      toast({ title: "Nada para exportar", status: "warning" });
      return;
    }
    const NAVY = [26, 54, 93];
    const M = 10;
    const generatedAt = new Date().toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    let y = M + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(20, 20, 20);
    doc.text("Clientes", M, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(85, 85, 85);
    const filters = [
      search && `Busca: ${search}`,
      cidade && `Cidade: ${cidade}`,
      uf && `UF: ${uf}`,
      `Ordenação: ${SORT_OPTIONS.find((o) => o.value === sort)?.label || sort}`,
    ].filter(Boolean).join(" · ");
    doc.text(`${customers.length} cliente(s) · ${filters} · Gerado em ${generatedAt}`, M, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 12 },
      head: [["Código", "Nome", "Cidade", "UF", "Último Pedido", "Valor (R$)", "Telefone/Contato"]],
      body: customers.map((c) => [
        c.codcli,
        c.company_name || c.fantasy_name || "",
        c.city || "",
        c.uf || "",
        fmtDate(c.last_order_date),
        c.last_order_date ? fmtBRL(c.last_order_value) : "—",
        fmtPhone(c),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: NAVY },
      columnStyles: {
        0: { cellWidth: 20 },
        2: { cellWidth: 45 },
        3: { halign: "center", cellWidth: 12 },
        4: { halign: "center", cellWidth: 26 },
        5: { halign: "right", cellWidth: 26 },
        6: { cellWidth: 55 },
      },
      didDrawPage: () => {
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Página ${doc.internal.getNumberOfPages()}`,
          doc.internal.pageSize.getWidth() - M,
          doc.internal.pageSize.getHeight() - 5,
          { align: "right" }
        );
      },
    });

    doc.save(`clientes_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Heading size="md">Clientes</Heading>
        <HStack>
          <Button
            leftIcon={<RepeatIcon />}
            size="sm"
            onClick={handleSync}
            isLoading={syncing}
            loadingText="Sincronizando..."
          >
            Sincronizar Sisplan
          </Button>
          <Button leftIcon={<DownloadIcon />} size="sm" colorScheme="blue" onClick={exportPdf}>
            Exportar PDF
          </Button>
        </HStack>
      </Flex>

      <Flex gap={2} mb={4} wrap="wrap">
        <InputGroup maxW="320px" size="sm">
          <InputLeftElement pointerEvents="none">
            <SearchIcon color="gray.400" />
          </InputLeftElement>
          <Input
            placeholder="Código, nome ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Input
          size="sm"
          maxW="200px"
          placeholder="Cidade"
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
        />
        <Select size="sm" maxW="100px" placeholder="UF" value={uf} onChange={(e) => setUf(e.target.value)}>
          {UFS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>
        <Select size="sm" maxW="220px" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>Ordenar por: {o.label}</option>
          ))}
        </Select>
      </Flex>

      {loading ? (
        <Flex justify="center" py={12}>
          <Spinner size="lg" />
        </Flex>
      ) : customers.length === 0 ? (
        <Box textAlign="center" py={12}>
          <Text color="gray.500">
            Nenhum cliente encontrado. Use "Sincronizar Sisplan" para importar o cadastro.
          </Text>
        </Box>
      ) : (
        <Box overflowX="auto" borderWidth="1px" borderRadius="md">
          <Table size="sm" variant="simple">
            <Thead bg={headerBg}>
              <Tr>
                <Th>Código</Th>
                <Th>Nome</Th>
                <Th>Cidade</Th>
                <Th>UF</Th>
                <Th>Último Pedido</Th>
                <Th isNumeric>Valor (R$)</Th>
                <Th>Telefone/Contato</Th>
              </Tr>
            </Thead>
            <Tbody>
              {customers.map((c) => (
                <Tr key={c.id} _hover={{ bg: rowHover }}>
                  <Td>{c.codcli}</Td>
                  <Td>
                    <Text fontWeight="medium">{c.company_name || c.fantasy_name}</Text>
                    {c.fantasy_name && c.fantasy_name !== c.company_name && (
                      <Text fontSize="xs" color="gray.500">{c.fantasy_name}</Text>
                    )}
                  </Td>
                  <Td>{c.city || "—"}</Td>
                  <Td>{c.uf ? <Badge>{c.uf}</Badge> : "—"}</Td>
                  <Td>{fmtDate(c.last_order_date)}</Td>
                  <Td isNumeric>{c.last_order_date ? fmtBRL(c.last_order_value) : "—"}</Td>
                  <Td>{fmtPhone(c)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      {!loading && customers.length > 0 && (
        <Text fontSize="sm" color="gray.500" mt={2}>
          {customers.length} cliente(s)
        </Text>
      )}
    </Box>
  );
}
