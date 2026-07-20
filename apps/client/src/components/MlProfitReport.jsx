import { useCallback, useEffect, useState } from "react";
import {
  Alert, AlertIcon, Badge, Box, Button, Flex, Heading, HStack, Input, Link,
  Select, SimpleGrid, Spinner, Table, Tbody, Td, Th, Thead, Tr, Text,
  useColorModeValue, VStack,
} from "@chakra-ui/react";
import { DownloadIcon, RepeatIcon } from "@chakra-ui/icons";
import useAppToast from "../hooks/useAppToast";
import {
  fetchMlProfitOptions, fetchMlProfitData, syncMlProfitFees, downloadMlProfitPdf,
} from "../api";

const brl = (v, { sign = false } = {}) => {
  if (v === null || v === undefined) return "-";
  const s = Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v < -1e-9) return `-${s}`;
  if (sign && v > 1e-9) return `+${s}`;
  return s;
};

const pct = (m) =>
  m === null || m === undefined
    ? "-"
    : `${m.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Faixas da margem (mesma regra do PDF)
const marginColors = (m) => {
  if (m === null || m === undefined) return { bg: "transparent", color: "inherit" };
  if (m < 10) return { bg: "#F6CFD3", color: "#A52834" };
  if (m > 13) return { bg: "#CFE0F5", color: "#1F4E78" };
  return { bg: "#CDEBD6", color: "#1B7A31" };
};

const MarginBadge = ({ value }) => {
  const c = marginColors(value);
  return (
    <Badge px={2} py={0.5} borderRadius="md" bg={c.bg} color={c.color} fontSize="xs">
      {pct(value)}
    </Badge>
  );
};

export default function MlProfitReport() {
  const [options, setOptions] = useState(null);
  const [store, setStore] = useState("");
  const [date, setDate] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const toast = useAppToast();

  const subtle = useColorModeValue("gray.500", "gray.400");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const headBg = useColorModeValue("#1F4E78", "gray.700");
  const zebra = useColorModeValue("#F6F9FC", "whiteAlpha.50");
  const red = "#C0392B";
  const green = "#1E7E34";

  useEffect(() => {
    fetchMlProfitOptions()
      .then((opts) => {
        setOptions(opts);
        if (opts.stores?.length) setStore(opts.stores[0].store);
        setDate(opts.defaultDate);
      })
      .catch((e) => toast({ status: "error", title: "Erro ao carregar opções", description: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (s = store, d = date) => {
    if (!s || !d) return;
    setLoading(true);
    try {
      setData(await fetchMlProfitData(s, d));
    } catch (e) {
      toast({ status: "error", title: "Erro ao montar o relatório", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [store, date, toast]);

  useEffect(() => { load(); }, [store, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = async () => {
    setSyncing(true);
    try {
      // force=true: o botão manual sempre rebusca o dia inteiro (atualiza valores antigos)
      const r = await syncMlProfitFees(store, date, true);
      const firstErr = r.errors?.[0]
        ? ` · ex.: pedido ${r.errors[0].order_id}: ${r.errors[0].message}`
        : "";
      toast({
        status: r.errors?.length ? "warning" : "success",
        title: `Sincronização concluída`,
        description: `${r.ok}/${r.total} pedidos atualizados` +
          (r.errors?.length ? ` · ${r.errors.length} erros${firstErr}` : ""),
      });
      await load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao sincronizar com o ML", description: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadMlProfitPdf(store, date);
    } catch (e) {
      toast({ status: "error", title: "Erro ao baixar PDF", description: e.message });
    } finally {
      setDownloading(false);
    }
  };

  const t = data?.totals;
  const pendentesFees = t ? t.pedidos - t.comFees : 0;
  const pendentesCusto = t ? t.pedidos - t.comCusto : 0;

  const kpis = t ? [
    { label: "Faturamento", value: `R$ ${brl(t.fat)}` },
    { label: "Comissão ML", value: `R$ ${brl(t.comissao)}`, color: red },
    { label: "Frete ML", value: `R$ ${brl(t.frete)}`, color: red },
    { label: "Estorno ML", value: `R$ ${brl(t.estorno, { sign: true })}`, color: green },
    { label: "Líquido ML", value: `R$ ${brl(t.liquido)}` },
    { label: `NF ${Math.round((data.nfPct || 0.08) * 100)}%`, value: `R$ ${brl(-t.nf)}`, color: red },
    { label: "Custo", value: t.custo === null ? "-" : `R$ ${brl(-t.custo)}`, color: red },
    { label: "LUCRO", value: `R$ ${brl(t.lucro)}`, color: green, bg: "#E4F2E8" },
    { label: "Margem", value: pct(t.margem), color: marginColors(t.margem).color, bg: marginColors(t.margem).bg },
  ] : [];

  const numTd = { isNumeric: true, whiteSpace: "nowrap" };

  return (
    <VStack align="stretch" spacing={5}>
      <Box>
        <Heading size="lg">Lucro por Venda — Mercado Livre</Heading>
        <Text color={subtle} fontSize="sm" mt={1}>
          Comissão, frete e estorno reais da API do ML · NF {Math.round((data?.nfPct || 0.08) * 100)}% ·
          custo pelo vínculo anúncio → produto de estoque
        </Text>
      </Box>

      <Flex gap={3} wrap="wrap" align="flex-end">
        <Box>
          <Text fontSize="xs" color={subtle} mb={1}>Loja</Text>
          <Select value={store} onChange={(e) => setStore(e.target.value)} minW="260px" size="sm">
            {(options?.stores || []).map((s) => (
              <option key={s.store} value={s.store}>{s.store}</option>
            ))}
          </Select>
        </Box>
        <Box>
          <Text fontSize="xs" color={subtle} mb={1}>Dia das vendas</Text>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} size="sm" maxW="170px" />
        </Box>
        <Button
          size="sm" leftIcon={<RepeatIcon />} colorScheme="blue" variant="outline"
          onClick={handleSync} isLoading={syncing} loadingText="Sincronizando..."
        >
          Buscar valores no ML
        </Button>
        <Button
          size="sm" leftIcon={<DownloadIcon />} colorScheme="blue"
          onClick={handleDownload} isLoading={downloading}
          isDisabled={!t || !t.pedidos}
        >
          Baixar PDF
        </Button>
      </Flex>

      {loading && <Flex justify="center" py={10}><Spinner /></Flex>}

      {!loading && t && !t.pedidos && (
        <Alert status="info" borderRadius="md">
          <AlertIcon />Nenhuma venda do Mercado Livre encontrada para esse dia.
        </Alert>
      )}

      {!loading && t && t.pedidos > 0 && (
        <>
          {(pendentesFees > 0 || pendentesCusto > 0) && (
            <Alert status="warning" borderRadius="md" fontSize="sm">
              <AlertIcon />
              <Box>
                {pendentesFees > 0 && (
                  <Text>
                    {pendentesFees} de {t.pedidos} pedidos ainda sem os valores reais do ML —
                    clique em “Buscar valores no ML”.
                  </Text>
                )}
                {pendentesCusto > 0 && (
                  <Text>
                    {pendentesCusto} pedidos sem custo — vincule o anúncio ao produto de estoque
                    em Anúncios → Gerenciar Anúncios.
                  </Text>
                )}
              </Box>
            </Alert>
          )}

          <SimpleGrid columns={{ base: 3, md: 5, xl: 9 }} spacing={2}>
            {kpis.map((k) => (
              <Box
                key={k.label} bg={k.bg || cardBg} borderWidth="1px" borderColor={border}
                borderRadius="md" p={2} textAlign="center"
              >
                <Text fontSize="xs" color={subtle} noOfLines={1}>{k.label}</Text>
                <Text fontWeight="bold" fontSize="sm" color={k.color}>{k.value}</Text>
              </Box>
            ))}
          </SimpleGrid>

          <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="md" p={3} overflowX="auto">
            <Heading size="sm" mb={3} color="#1F4E78">Resumo por anúncio</Heading>
            <Table size="sm" variant="unstyled">
              <Thead>
                <Tr bg={headBg}>
                  <Th color="white">Anúncio</Th>
                  <Th color="white" textAlign="center">Qtd</Th>
                  <Th color="white" isNumeric>Faturam.</Th>
                  <Th color="white" isNumeric>Comissão</Th>
                  <Th color="white" isNumeric>Frete</Th>
                  <Th color="white" isNumeric>Estorno</Th>
                  <Th color="white" isNumeric>Líq. ML</Th>
                  <Th color="white" isNumeric>NF</Th>
                  <Th color="white" isNumeric>Custo</Th>
                  <Th color="white" isNumeric>Lucro</Th>
                  <Th color="white" textAlign="center">Margem</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.resumo.map((a, i) => (
                  <Tr key={a.ad} bg={i % 2 === 1 ? zebra : undefined}>
                    <Td maxW="360px">
                      <Text noOfLines={2} fontSize="xs">
                        {a.ad}{" "}
                        {a.adUrl && (
                          <Link href={a.adUrl} isExternal color="#1F4E78" textDecoration="underline">
                            ver anúncio
                          </Link>
                        )}
                      </Text>
                    </Td>
                    <Td textAlign="center">{Math.round(a.qty)}</Td>
                    <Td {...numTd}>{brl(a.fat)}</Td>
                    <Td {...numTd} color={red}>{brl(a.comissao)}</Td>
                    <Td {...numTd} color={red}>{brl(a.frete)}</Td>
                    <Td {...numTd} color={green}>{brl(a.estorno, { sign: true })}</Td>
                    <Td {...numTd}>{brl(a.liquido)}</Td>
                    <Td {...numTd} color={red}>{brl(-a.nf)}</Td>
                    <Td {...numTd} color={red}>{a.custo === null ? "-" : brl(-a.custo)}</Td>
                    <Td {...numTd} color={green} fontWeight="bold">{brl(a.lucro)}</Td>
                    <Td textAlign="center"><MarginBadge value={a.margem} /></Td>
                  </Tr>
                ))}
                <Tr fontWeight="bold" bg="#EEF4FA" _dark={{ bg: "whiteAlpha.100" }}>
                  <Td>TOTAL</Td>
                  <Td textAlign="center">{Math.round(t.qty)}</Td>
                  <Td {...numTd}>{brl(t.fat)}</Td>
                  <Td {...numTd}>{brl(t.comissao)}</Td>
                  <Td {...numTd}>{brl(t.frete)}</Td>
                  <Td {...numTd}>{brl(t.estorno, { sign: true })}</Td>
                  <Td {...numTd}>{brl(t.liquido)}</Td>
                  <Td {...numTd}>{brl(-t.nf)}</Td>
                  <Td {...numTd}>{t.custo === null ? "-" : brl(-t.custo)}</Td>
                  <Td {...numTd}>{brl(t.lucro)}</Td>
                  <Td textAlign="center"><MarginBadge value={t.margem} /></Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>

          <Box bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="md" p={3} overflowX="auto">
            <Heading size="sm" mb={3} color="#1F4E78">Detalhe por pedido</Heading>
            <Table size="sm" variant="unstyled">
              <Thead>
                <Tr bg={headBg}>
                  <Th color="white">Pedido ML</Th>
                  <Th color="white">Anúncio</Th>
                  <Th color="white" textAlign="center">Qtd</Th>
                  <Th color="white" isNumeric>Faturam.</Th>
                  <Th color="white" isNumeric>Comissão</Th>
                  <Th color="white" isNumeric>Frete</Th>
                  <Th color="white" isNumeric>Estorno</Th>
                  <Th color="white" isNumeric>Líq. ML</Th>
                  <Th color="white" isNumeric>NF</Th>
                  <Th color="white" isNumeric>Custo</Th>
                  <Th color="white" isNumeric>Lucro</Th>
                  <Th color="white" textAlign="center">Marg.</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.rows.map((r, i) => (
                  <Tr key={r.oid} bg={i % 2 === 1 ? zebra : undefined}>
                    <Td>
                      <Link
                        href={`https://www.mercadolivre.com.br/vendas/${r.oid}/detalhe`}
                        isExternal color="#1F4E78" textDecoration="underline" fontSize="xs"
                      >
                        {r.oid}
                      </Link>
                    </Td>
                    <Td maxW="260px">
                      <Text noOfLines={1} fontSize="xs">
                        {r.ad}{" "}
                        {r.adUrl && (
                          <Link href={r.adUrl} isExternal color="#1F4E78" textDecoration="underline">
                            (ver)
                          </Link>
                        )}
                      </Text>
                    </Td>
                    <Td textAlign="center">{Math.round(r.qty)}</Td>
                    <Td {...numTd}>{brl(r.fat)}</Td>
                    <Td {...numTd} color={red}>{brl(r.comissao)}</Td>
                    <Td {...numTd} color={red}>{brl(r.frete)}</Td>
                    <Td {...numTd} color={green}>{brl(r.estorno, { sign: true })}</Td>
                    <Td {...numTd}>{brl(r.liquido)}</Td>
                    <Td {...numTd} color={red}>{brl(-r.nf)}</Td>
                    <Td {...numTd} color={red}>{r.custo === null ? "-" : brl(-r.custo)}</Td>
                    <Td {...numTd} color={green} fontWeight="bold">{brl(r.lucro)}</Td>
                    <Td textAlign="center"><MarginBadge value={r.margem} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>

          <Text fontSize="xs" color={subtle}>
            Margem: <Badge bg="#F6CFD3" color="#A52834">&lt; 10%</Badge>{" "}
            <Badge bg="#CDEBD6" color="#1B7A31">10% a 13%</Badge>{" "}
            <Badge bg="#CFE0F5" color="#1F4E78">&gt; 13%</Badge> · Relatório diário gerado
            automaticamente às 05:30 com as vendas do dia anterior.
          </Text>
        </>
      )}
    </VStack>
  );
}
