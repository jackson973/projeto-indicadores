import { useEffect, useState, useCallback } from "react";
import {
  Alert, AlertIcon, Badge, Box, Button, Flex, SimpleGrid, Spinner, Stat, StatLabel, StatNumber,
  Table, Tbody, Td, Th, Thead, Tr, Tfoot, Text, Tooltip, useBreakpointValue, useColorModeValue, VStack,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverArrow, PopoverHeader, IconButton,
} from "@chakra-ui/react";
import { InfoIcon } from "@chakra-ui/icons";
import useAppToast from "../hooks/useAppToast";
import CardStat from "./CardStat";
import { fetchValuation } from "../api";

const BRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BRL2 = BRL;
const MPLABEL = { mercadolivre: "Mercado Livre", shopee: "Shopee", shein: "Shein", tiktok: "TikTok" };

// Cabeçalho de coluna com ícone de informação (tooltip)
function ThI({ label, tip, isNumeric }) {
  return (
    <Th isNumeric={isNumeric}>
      <Tooltip label={tip} hasArrow placement="top" openDelay={150} maxW="260px">
        <Box as="span" display="inline-flex" alignItems="center" gap={1} cursor="help"
          justifyContent={isNumeric ? "flex-end" : "flex-start"}>
          {label}<InfoIcon boxSize={2.5} color="gray.400" />
        </Box>
      </Tooltip>
    </Th>
  );
}

// Memória de cálculo do lucro líquido por loja (mesma lógica do Simulador)
function LucroPopover({ r, avgCost, border, subtle }) {
  const Row = ({ l, v, ded, tot }) => (
    <Flex justify="space-between" fontSize="xs" fontWeight={tot ? "bold" : "normal"}
      borderTopWidth={tot ? "1px" : 0} borderColor={border} pt={tot ? 1 : 0} mt={tot ? 1 : 0}>
      <Text as="span" color={ded ? "red.500" : (tot ? undefined : subtle)}>{l}</Text>
      <Text as="span" color={ded ? "red.500" : (tot ? (r.lucro >= 0 ? "green.600" : "red.500") : undefined)}>{v}</Text>
    </Flex>
  );
  const kit = Math.max(1, Number(r.kit_qty) || 1);
  const freteLbl = r.frete_type === "pct" ? `− Frete ${r.frete_value || 0}% do faturamento`
    : r.frete_type === "fix" ? `− Frete ${BRL(r.frete_value || 0)} × ${r.vendas}`
    : "− Frete (sem)";
  return (
    <Popover placement="left" isLazy>
      <PopoverTrigger>
        <IconButton aria-label="Ver cálculo" icon={<InfoIcon />} size="xs" variant="ghost" ml={1} />
      </PopoverTrigger>
      <PopoverContent w="290px">
        <PopoverArrow />
        <PopoverHeader fontSize="xs" fontWeight="semibold">Memória de cálculo (potencial do estoque)</PopoverHeader>
        <PopoverBody>
          {!r.vendas ? (
            <Text fontSize="xs" color={subtle}>Sem kits no estoque (0) — nada a apurar.</Text>
          ) : (
            <Box>
              <Row l={`Faturamento (${r.vendas} × ${BRL(r.kitPrice)})`} v={BRL(r.fat)} />
              <Row l={`− Comissão ${r.commission_pct || 0}%`} v={`− ${BRL(r.comV)}`} ded />
              <Row l={`− Taxa fixa (${r.vendas} × ${BRL(r.fixed_per_sale || 0)})`} v={`− ${BRL(r.fixV)}`} ded />
              <Row l={freteLbl} v={`− ${BRL(r.freteV)}`} ded />
              <Row l={`− NF ${r.nf_pct || 0}%`} v={`− ${BRL(r.nfV)}`} ded />
              <Row l={`− Custo (${r.vendas * kit} pç × ${BRL(avgCost)})`} v={`− ${BRL(r.cost)}`} ded />
              <Row l="= Lucro líquido" v={BRL(r.lucro)} tot />
              <Text fontSize="xs" color={subtle} mt={2}>Margem: {r.fat ? (r.lucro / r.fat * 100).toFixed(0) : 0}%</Text>
            </Box>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

export default function Valuation() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState(null);
  const [prodFilter, setProdFilter] = useState(null); // product_id selecionado na tabela de produtos
  const toast = useAppToast();

  const subtle = useColorModeValue("gray.500", "gray.400");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const selBg = useColorModeValue("blue.50", "blue.900");
  const infoBg = useColorModeValue("blue.50", "blue.900");
  const infoBorder = useColorModeValue("blue.200", "blue.700");
  const isMobile = useBreakpointValue({ base: true, md: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchValuation();
      setData(d);
      if (d.stores?.length && storeId == null) setStoreId(d.stores[0].store_id);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar valorização", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;
  if (!data) return null;

  const store = data.byStore.find(s => s.store_id === storeId);
  const rows = data.items
    .map(it => ({ ...it, r: it.perStore[storeId] }))
    .filter(it => it.r);

  // Quantos produtos entram na visão por loja (têm ao menos 1 preço salvo por loja)
  const missing = data.items.filter(it => !it.perStore || !Object.keys(it.perStore).length);
  const configured = data.items.length - missing.length;

  // Filtro por produto (clique na linha da tabela de produtos)
  const selItem = prodFilter ? data.items.find(i => i.product_id === prodFilter) : null;
  // Linhas da tabela "Resultado líquido por loja": se filtrado, mostra só o produto por loja; senão o agregado
  const storeRows = selItem
    ? data.stores
        .filter(s => selItem.perStore[s.store_id])
        .map(s => {
          const r = selItem.perStore[s.store_id];
          return { store_id: s.store_id, name: s.name, platform: s.platform, vendas: r.vendas, fat: r.fat, lucro: r.lucro };
        })
    : data.byStore;
  // Detalhe por loja embaixo: se filtrado, só o produto selecionado
  const detailRows = prodFilter ? rows.filter(it => it.product_id === prodFilter) : rows;

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>Valorização do estoque</Text>
      <Text fontSize="sm" color={subtle} mb={4}>
        Quanto o seu estoque atual vale — a custo, a preço de venda e o lucro potencial por loja (já com as taxas de cada canal).
        São projeções sobre o estoque parado, não vendas realizadas. Para testar cenários, use o Simulador.
      </Text>

      {/* Resumo (nível produto — custo médio + preço de venda do cadastro) */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={5}>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Estoque a custo</StatLabel><StatNumber fontSize="lg">{BRL(data.estoque_custo)}</StatNumber>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Estoque a preço de venda</StatLabel><StatNumber fontSize="lg" color="green.500">{BRL(data.estoque_venda)}</StatNumber>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Lucro bruto potencial</StatLabel><StatNumber fontSize="lg" color={(data.lucro_bruto || 0) < 0 ? "red.500" : "blue.500"}>{BRL(data.lucro_bruto)}</StatNumber>
        </Stat>
        <Stat bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
          <StatLabel fontSize="xs">Margem bruta</StatLabel><StatNumber fontSize="lg">{data.estoque_venda ? Math.round(data.lucro_bruto / data.estoque_venda * 100) : 0}%</StatNumber>
        </Stat>
      </SimpleGrid>

      {/* Nível produto */}
      <Text fontWeight="semibold" mb={1}>Estoque valorizado por produto</Text>
      <Text fontSize="xs" color={subtle} mb={2}>
        Custo médio × saldo e preço de venda × saldo (do cadastro do produto). Lucro bruto não inclui comissão/frete/NF — isso é o detalhe por loja abaixo.
        {" "}<b>Clique numa linha</b> para filtrar as seções de baixo só por aquele produto.
      </Text>
      {isMobile ? (
        <Box mb={6}>
          {!data.items.length ? (
            <Text fontSize="sm" color={subtle}>Nenhum produto com saldo.</Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {data.items.map(it => {
                const marg = it.valor_venda ? it.lucro_bruto / it.valor_venda * 100 : 0;
                const isSel = it.product_id === prodFilter;
                return (
                  <Box key={it.product_id} bg={isSel ? selBg : cardBg} borderWidth="1px"
                    borderColor={isSel ? "blue.400" : border} borderRadius="lg" p={3} cursor="pointer"
                    onClick={() => setProdFilter(isSel ? null : it.product_id)}>
                    <Text fontSize="sm" fontWeight="semibold" noOfLines={2} mb={2}>{it.codigo} · {it.descricao}</Text>
                    <SimpleGrid columns={3} spacingX={2} spacingY={3}>
                      <CardStat label="Saldo">{it.saldo}</CardStat>
                      <CardStat label="Custo médio">{BRL2(it.avg_cost)}</CardStat>
                      <CardStat label="Valor a custo">{BRL(it.valor_custo)}</CardStat>
                      <CardStat label="Preço venda/pç">{it.sale_price == null ? "—" : BRL2(it.sale_price)}</CardStat>
                      <CardStat label="Preço kit">{it.preco_kit == null ? "—" : BRL2(it.preco_kit)}</CardStat>
                      <CardStat label="Valor a venda">{it.sale_price == null ? "—" : BRL(it.valor_venda)}</CardStat>
                      <CardStat label="Lucro bruto">
                        {it.sale_price == null ? "—" : <Badge colorScheme={it.lucro_bruto >= 0 ? "green" : "red"}>{BRL(it.lucro_bruto)}</Badge>}
                      </CardStat>
                      <CardStat label="Margem">{it.sale_price == null ? "—" : `${marg.toFixed(0)}%`}</CardStat>
                    </SimpleGrid>
                  </Box>
                );
              })}
              <Box borderWidth="1px" borderColor={border} borderRadius="lg" p={3} bg={cardBg}>
                <Text fontSize="sm" fontWeight="bold" mb={2}>Total</Text>
                <SimpleGrid columns={3} spacingX={2} spacingY={3}>
                  <CardStat label="Valor a custo">{BRL(data.estoque_custo)}</CardStat>
                  <CardStat label="Valor a venda">{BRL(data.estoque_venda)}</CardStat>
                  <CardStat label="Lucro bruto">{BRL(data.lucro_bruto)}</CardStat>
                </SimpleGrid>
              </Box>
            </VStack>
          )}
        </Box>
      ) : (
      <Box overflowX="auto" mb={6}>
        <Table size="sm">
          <Thead><Tr>
            <ThI label="Produto" tip="Código e descrição do produto." />
            <ThI label="Saldo" tip="Quantidade em estoque (peças), somando todos os tamanhos." isNumeric />
            <ThI label="Custo médio" tip="Custo médio por peça — média móvel ponderada, semeada pelo preço de compra inicial e ajustada a cada entrada." isNumeric />
            <ThI label="Valor a custo" tip="Custo médio × saldo — quanto você tem investido neste produto." isNumeric />
            <ThI label="Preço venda/pç" tip="Preço de venda POR PEÇA, do cadastro do produto." isNumeric />
            <ThI label="Preço kit" tip="Preço do kit = preço por peça × kit padrão do produto. É o preço do anúncio (o que você vende de fato)." isNumeric />
            <ThI label="Valor a venda" tip="Preço por peça × saldo — faturamento potencial vendendo todo o saldo (preço de tabela)." isNumeric />
            <ThI label="Lucro bruto" tip="Valor a venda − Valor a custo. NÃO inclui comissão, frete e NF — isso aparece no detalhe por loja abaixo." isNumeric />
            <ThI label="Margem" tip="Lucro bruto ÷ Valor a venda." isNumeric />
          </Tr></Thead>
          <Tbody>
            {!data.items.length ? (
              <Tr><Td colSpan={8}><Text fontSize="sm" color={subtle}>Nenhum produto com saldo.</Text></Td></Tr>
            ) : data.items.map(it => {
              const marg = it.valor_venda ? it.lucro_bruto / it.valor_venda * 100 : 0;
              const isSel = it.product_id === prodFilter;
              return (
                <Tr key={it.product_id} bg={isSel ? selBg : undefined} cursor="pointer"
                  onClick={() => setProdFilter(isSel ? null : it.product_id)}>
                  <Td>{it.codigo} · {it.descricao}</Td>
                  <Td isNumeric>{it.saldo}</Td>
                  <Td isNumeric>{BRL2(it.avg_cost)}</Td>
                  <Td isNumeric>{BRL(it.valor_custo)}</Td>
                  <Td isNumeric>{it.sale_price == null ? <Text as="span" color={subtle}>—</Text> : BRL2(it.sale_price)}</Td>
                  <Td isNumeric>{it.preco_kit == null ? <Text as="span" color={subtle}>—</Text> : BRL2(it.preco_kit)}</Td>
                  <Td isNumeric>{it.sale_price == null ? "—" : BRL(it.valor_venda)}</Td>
                  <Td isNumeric>{it.sale_price == null ? "—" : <Badge colorScheme={it.lucro_bruto >= 0 ? "green" : "red"}>{BRL(it.lucro_bruto)}</Badge>}</Td>
                  <Td isNumeric>{it.sale_price == null ? "—" : `${marg.toFixed(0)}%`}</Td>
                </Tr>
              );
            })}
          </Tbody>
          <Tfoot><Tr><Th>Total</Th><Th /><Th /><Th isNumeric>{BRL(data.estoque_custo)}</Th><Th /><Th /><Th isNumeric>{BRL(data.estoque_venda)}</Th><Th isNumeric>{BRL(data.lucro_bruto)}</Th><Th /></Tr></Tfoot>
        </Table>
      </Box>
      )}

      {/* Resultado líquido por loja/marketplace (avançado) */}
      <Text fontWeight="semibold" mb={1}>Resultado líquido por loja</Text>
      <Text fontSize="xs" color={subtle} mb={2}>
        Projeção de liquidar <b>todo o estoque atual</b> como kits, já com comissão, frete e NF de cada loja.
        Não é venda real — é potencial. Só aparecem os pares (produto, loja) com preço salvo para a loja.
      </Text>

      {prodFilter && selItem && (
        <Flex align="center" gap={2} mb={3} bg={selBg} borderRadius="md" px={3} py={2} fontSize="sm" wrap="wrap">
          <Text>Filtrando por <b>{selItem.codigo} · {selItem.descricao}</b></Text>
          <Button size="xs" variant="ghost" colorScheme="blue" onClick={() => setProdFilter(null)}>Limpar filtro ✕</Button>
        </Flex>
      )}

      {missing.length > 0 && !prodFilter && (
        <Alert status={configured === 0 ? "warning" : "info"} borderRadius="md" mb={3} fontSize="sm" alignItems="flex-start">
          <AlertIcon />
          <Box>
            <Text>
              Esta seção considera <b>{configured} de {data.items.length}</b> produtos — só os que já têm
              preço salvo por loja. Os outros <b>{missing.length}</b> aparecem na tabela de cima (a custo/preço de tabela),
              mas ainda não entram aqui.
            </Text>
            <Text mt={1} color={subtle}>
              Falta configurar: {missing.slice(0, 12).map(m => m.codigo).join(", ")}
              {missing.length > 12 ? ` +${missing.length - 12}` : ""}.
              {" "}Configure em <b>Custos &amp; Preços → abrir o produto → “Preço de venda por loja” → Salvar</b>.
            </Text>
          </Box>
        </Alert>
      )}

      <Box bg={infoBg} borderWidth="1px" borderColor={infoBorder} borderRadius="md" p={3} mb={3} fontSize="xs">
        <Text fontWeight="semibold" mb={1}>ℹ️ Para os valores aparecerem por loja, faça:</Text>
        <Box as="ol" pl={4} sx={{ listStyleType: "decimal" }} color={subtle} lineHeight="1.7">
          <li><b>Sincronize as lojas</b> e defina o <b>marketplace</b> + <b>NF %</b> de cada uma — em <b>Canais & Taxas</b>.</li>
          <li>Confira as <b>faixas de comissão/taxa fixa</b> do marketplace — em <b>Canais & Taxas</b> (já vêm pré-preenchidas).</li>
          <li>Garanta o <b>custo médio</b> do produto — via <b>Custo de Abertura</b> ou o <b>preço de compra inicial</b> no cadastro do produto.</li>
          <li><b>Salve o preço do produto na loja</b> — em <b>Custos & Preços → abrir o produto → “Preço de venda por loja” → Salvar</b> na linha da loja. O preço vem sugerido do cadastro, mas só entra nesta visão depois de Salvar.</li>
        </Box>
      </Box>
      {isMobile ? (
        <Box mb={5}>
          {!storeRows.some(s => s.fat) ? (
            <Text fontSize="sm" color={subtle}>Nenhum preço por loja cadastrado ainda. Cadastre em Custos & Preços → produto → Preço de venda por loja.</Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {storeRows.map(s => {
                const m = s.fat ? s.lucro / s.fat * 100 : 0;
                const isSel = s.store_id === storeId;
                return (
                  <Box key={s.store_id} bg={isSel ? selBg : cardBg} borderWidth="1px"
                    borderColor={isSel ? "blue.400" : border} borderRadius="lg" p={3} cursor="pointer"
                    onClick={() => setStoreId(s.store_id)}>
                    <Flex justify="space-between" align="start" gap={2} mb={2}>
                      <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>{s.name}</Text>
                      <Badge colorScheme="blue" flexShrink={0}>{MPLABEL[s.platform] || s.platform}</Badge>
                    </Flex>
                    <SimpleGrid columns={2} spacingX={2} spacingY={3}>
                      <CardStat label="Kits (estoque)">{s.vendas}</CardStat>
                      <CardStat label="Fat. potencial">{BRL(s.fat)}</CardStat>
                      <CardStat label="Lucro líq. pot.">
                        <Badge colorScheme={s.lucro >= 0 ? "green" : "red"}>{BRL(s.lucro)}</Badge>
                      </CardStat>
                      <CardStat label="Margem">{m.toFixed(0)}%</CardStat>
                    </SimpleGrid>
                  </Box>
                );
              })}
            </VStack>
          )}
        </Box>
      ) : (
      <Box overflowX="auto" mb={5}>
        <Table size="sm">
          <Thead><Tr>
            <Th>Loja</Th><Th>Marketplace</Th>
            <ThI label="Kits (estoque)" tip="Quantos kits cabem no saldo atual = saldo ÷ kit padrão. NÃO é venda real — é o potencial do estoque." isNumeric />
            <ThI label="Fat. potencial" tip="Preço do kit × kits do estoque. Faturamento SE você vendesse todo o estoque atual como kits nesta loja." isNumeric />
            <ThI label="Lucro líq. pot." tip="Faturamento potencial − comissão − taxa fixa − frete − NF − custo do estoque. Potencial, não realizado." isNumeric />
            <ThI label="Margem" tip="Lucro líquido potencial ÷ faturamento potencial." isNumeric />
          </Tr></Thead>
          <Tbody>
            {!storeRows.some(s => s.fat) ? (
              <Tr><Td colSpan={6}><Text fontSize="sm" color={subtle}>Nenhum preço por loja cadastrado ainda. Cadastre em Custos & Preços → produto → Preço de venda por loja.</Text></Td></Tr>
            ) : storeRows.map(s => {
              const m = s.fat ? s.lucro / s.fat * 100 : 0;
              return (
                <Tr key={s.store_id} bg={s.store_id === storeId ? selBg : undefined} cursor="pointer" onClick={() => setStoreId(s.store_id)}>
                  <Td>{s.name}</Td>
                  <Td><Badge colorScheme="blue">{MPLABEL[s.platform] || s.platform}</Badge></Td>
                  <Td isNumeric>{s.vendas}</Td>
                  <Td isNumeric>{BRL(s.fat)}</Td>
                  <Td isNumeric><Badge colorScheme={s.lucro >= 0 ? "green" : "red"}>{BRL(s.lucro)}</Badge></Td>
                  <Td isNumeric>{m.toFixed(0)}%</Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
      )}

      {/* Detalhe por produto da loja selecionada */}
      {data.stores.length > 0 && (
        <>
          <Flex align="center" gap={2} mb={2} wrap="wrap">
            <Text fontWeight="semibold">Estoque valorizado —</Text>
            {data.stores.map(s => (
              <Button key={s.store_id} size="xs" variant={s.store_id === storeId ? "solid" : "outline"} colorScheme="blue" onClick={() => setStoreId(s.store_id)}>{s.name}</Button>
            ))}
          </Flex>
          {isMobile ? (
            !detailRows.length ? (
              <Text fontSize="sm" color={subtle}>Nenhum produto com preço nesta loja.</Text>
            ) : (
              <VStack spacing={2} align="stretch">
                {detailRows.map(it => (
                  <Box key={it.product_id} bg={cardBg} borderWidth="1px" borderColor={border} borderRadius="lg" p={3}>
                    <Text fontSize="sm" fontWeight="semibold" noOfLines={2} mb={2}>{it.codigo} · {it.descricao}</Text>
                    <SimpleGrid columns={3} spacingX={2} spacingY={3}>
                      <CardStat label="Saldo">{it.saldo}</CardStat>
                      <CardStat label="Custo médio">{BRL(it.avg_cost)}</CardStat>
                      <CardStat label="Valor a custo">{BRL(it.valor_custo)}</CardStat>
                      <CardStat label="Preço kit">{BRL(it.r.kitPrice)}</CardStat>
                      <CardStat label="Kits (estoque)">{it.r.vendas}</CardStat>
                      <CardStat label="Fat. potencial">{BRL(it.r.fat)}</CardStat>
                      <CardStat label="Lucro líq. pot.">
                        <Flex align="center">
                          <Badge colorScheme={it.r.lucro >= 0 ? "green" : "red"}>{BRL(it.r.lucro)}</Badge>
                          <LucroPopover r={it.r} avgCost={it.avg_cost} border={border} subtle={subtle} />
                        </Flex>
                      </CardStat>
                      <CardStat label="Margem">{it.r.margem.toFixed(0)}%</CardStat>
                    </SimpleGrid>
                  </Box>
                ))}
                <Box borderWidth="1px" borderColor={border} borderRadius="lg" p={3} bg={cardBg}>
                  <Text fontSize="sm" fontWeight="bold" mb={2}>Total</Text>
                  <SimpleGrid columns={2} spacingX={2} spacingY={3}>
                    <CardStat label="Valor a custo">{BRL(detailRows.reduce((s, i) => s + i.valor_custo, 0))}</CardStat>
                    <CardStat label="Kits (estoque)">{detailRows.reduce((s, i) => s + i.r.vendas, 0)}</CardStat>
                    <CardStat label="Fat. potencial">{BRL(detailRows.reduce((s, i) => s + i.r.fat, 0))}</CardStat>
                    <CardStat label="Lucro líq. pot.">{BRL(detailRows.reduce((s, i) => s + i.r.lucro, 0))}</CardStat>
                  </SimpleGrid>
                </Box>
              </VStack>
            )
          ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead><Tr>
                <Th>Produto</Th><Th isNumeric>Saldo</Th><Th isNumeric>Custo médio</Th><Th isNumeric>Valor a custo</Th><Th isNumeric>Preço kit</Th>
                <ThI label="Kits (estoque)" tip="Quantos kits cabem no saldo = saldo ÷ kit padrão. NÃO é venda real — é potencial." isNumeric />
                <ThI label="Fat. potencial" tip="Preço do kit × kits do estoque. Faturamento SE vendesse todo o saldo como kits." isNumeric />
                <ThI label="Lucro líq. pot." tip="Faturamento potencial − comissão − taxa fixa − frete − NF − custo. Potencial, não realizado." isNumeric />
                <Th isNumeric>Margem</Th>
              </Tr></Thead>
              <Tbody>
                {!detailRows.length ? (
                  <Tr><Td colSpan={9}><Text fontSize="sm" color={subtle}>Nenhum produto com preço nesta loja.</Text></Td></Tr>
                ) : detailRows.map(it => (
                  <Tr key={it.product_id}>
                    <Td>{it.codigo} · {it.descricao}</Td>
                    <Td isNumeric>{it.saldo}</Td>
                    <Td isNumeric>{BRL(it.avg_cost)}</Td>
                    <Td isNumeric>{BRL(it.valor_custo)}</Td>
                    <Td isNumeric>{BRL(it.r.kitPrice)}</Td>
                    <Td isNumeric>{it.r.vendas}</Td>
                    <Td isNumeric>{BRL(it.r.fat)}</Td>
                    <Td isNumeric>
                      <Flex align="center" justify="flex-end">
                        <Badge colorScheme={it.r.lucro >= 0 ? "green" : "red"}>{BRL(it.r.lucro)}</Badge>
                        <LucroPopover r={it.r} avgCost={it.avg_cost} border={border} subtle={subtle} />
                      </Flex>
                    </Td>
                    <Td isNumeric>{it.r.margem.toFixed(0)}%</Td>
                  </Tr>
                ))}
              </Tbody>
              <Tfoot><Tr>
                <Th>Total</Th><Th /><Th /><Th isNumeric>{BRL(detailRows.reduce((s, i) => s + i.valor_custo, 0))}</Th><Th />
                <Th isNumeric>{detailRows.reduce((s, i) => s + i.r.vendas, 0)}</Th>
                <Th isNumeric>{BRL(detailRows.reduce((s, i) => s + i.r.fat, 0))}</Th>
                <Th isNumeric>{BRL(detailRows.reduce((s, i) => s + i.r.lucro, 0))}</Th><Th />
              </Tr></Tfoot>
            </Table>
          </Box>
          )}
        </>
      )}
    </Box>
  );
}
