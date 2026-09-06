import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, Box, Button, Checkbox, Code, Flex, FormControl, FormHelperText, FormLabel, HStack, Input,
  Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  SimpleGrid, Spinner, Switch, Tab, TabList, TabPanel, TabPanels, Table, Tabs, Tbody, Td, Text, Textarea,
  Th, Thead, Tr, Tooltip, useColorModeValue, useDisclosure, Wrap, WrapItem,
} from "@chakra-ui/react";
import useAppToast from "../hooks/useAppToast";
import {
  fetchApiRoutes, fetchApiClients, createApiClient, updateApiClient,
  rotateApiClientKey, deleteApiClient, fetchApiClientLogs,
} from "../api";

const EMPTY_DRAFT = { name: "", description: "", scopes: [], rate_limit_per_min: 120, expires_at: "", active: true };

const fmtDateTime = (v) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const toDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function ApiSettings() {
  const toast = useAppToast();
  const subtle = useColorModeValue("gray.500", "gray.400");
  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const codeBg = useColorModeValue("gray.50", "gray.900");

  const [loading, setLoading] = useState(true);
  const [registry, setRegistry] = useState({ base: "/api/v1", scopes: [] });
  const [clients, setClients] = useState([]);

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const editModal = useDisclosure();

  const [revealed, setRevealed] = useState(null); // { client, key }
  const keyModal = useDisclosure();

  const [logsFor, setLogsFor] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const logsModal = useDisclosure();

  const baseUrl = useMemo(() => `${window.location.origin}${registry.base || "/api/v1"}`, [registry.base]);
  const scopeLabel = useCallback((k) => (k === "*" ? "Todas as rotas" : registry.scopes.find((s) => s.key === k)?.label || k), [registry.scopes]);
  const selectableScopes = useMemo(() => registry.scopes.filter((s) => !s.always), [registry.scopes]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([fetchApiRoutes(), fetchApiClients()]);
      setRegistry(r);
      setClients(c);
    } catch (e) {
      toast({ status: "error", title: "Erro ao carregar", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ── Criar / editar ──────────────────────────────────────────────────────────

  const openNew = () => { setEditing(null); setDraft(EMPTY_DRAFT); editModal.onOpen(); };
  const openEdit = (c) => {
    setEditing(c);
    setDraft({
      name: c.name || "",
      description: c.description || "",
      scopes: c.scopes || [],
      rate_limit_per_min: c.rate_limit_per_min ?? 120,
      expires_at: toDateInput(c.expires_at),
      active: !!c.active,
    });
    editModal.onOpen();
  };

  const allSelected = draft.scopes.includes("*");
  const toggleAll = () => setDraft((d) => ({ ...d, scopes: d.scopes.includes("*") ? [] : ["*"] }));
  const toggleScope = (k) => setDraft((d) => {
    const without = d.scopes.filter((x) => x !== "*");
    return { ...d, scopes: without.includes(k) ? without.filter((x) => x !== k) : [...without, k] };
  });

  const save = async () => {
    if (!draft.name.trim()) { toast({ status: "warning", title: "Informe o nome da credencial" }); return; }
    if (!draft.scopes.length) { toast({ status: "warning", title: "Selecione ao menos uma rota" }); return; }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        scopes: draft.scopes,
        rate_limit_per_min: Number(draft.rate_limit_per_min) || 0,
        expires_at: draft.expires_at ? `${draft.expires_at}T23:59:59` : null,
      };
      if (editing) {
        await updateApiClient(editing.id, { ...payload, active: draft.active });
        editModal.onClose();
        toast({ status: "success", title: "Credencial atualizada" });
      } else {
        const result = await createApiClient(payload);
        editModal.onClose();
        setRevealed(result);
        keyModal.onOpen();
      }
      load();
    } catch (e) {
      toast({ status: "error", title: "Erro ao salvar", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c) => {
    try {
      await updateApiClient(c.id, { active: !c.active });
      toast({ status: "success", title: c.active ? "Credencial desativada" : "Credencial ativada" });
      load();
    } catch (e) { toast({ status: "error", title: "Erro", description: e.message }); }
  };

  const rotate = async (c) => {
    if (!window.confirm(`Gerar uma nova chave para "${c.name}"?\n\nA chave atual deixa de funcionar imediatamente.`)) return;
    try {
      const result = await rotateApiClientKey(c.id);
      setRevealed(result);
      keyModal.onOpen();
      load();
    } catch (e) { toast({ status: "error", title: "Erro ao gerar chave", description: e.message }); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Excluir a credencial "${c.name}"?\n\nQuem usa esta chave perde o acesso na hora. O log de requisições também é apagado.`)) return;
    try {
      await deleteApiClient(c.id);
      toast({ status: "success", title: "Credencial excluída" });
      load();
    } catch (e) { toast({ status: "error", title: "Erro ao excluir", description: e.message }); }
  };

  const openLogs = async (c) => {
    setLogsFor(c);
    setLogs([]);
    setLogsLoading(true);
    logsModal.onOpen();
    try { setLogs(await fetchApiClientLogs(c.id, 200)); }
    catch (e) { toast({ status: "error", title: "Erro ao carregar log", description: e.message }); }
    finally { setLogsLoading(false); }
  };

  const copy = async (text, label = "Copiado") => {
    const ok = await copyText(text);
    toast({ status: ok ? "success" : "error", title: ok ? label : "Não foi possível copiar" });
  };

  if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;

  const curlFor = (key, path = "/health") => `curl -H "X-API-Key: ${key}" "${baseUrl}${path}"`;

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={1}>API externa</Text>
      <Text fontSize="sm" color={subtle} mb={4}>
        Credenciais para sistemas externos (BI, integrações) consumirem os dados do sistema. Cada credencial recebe uma chave
        e a lista de rotas que pode acessar. Endereço base: <Code fontSize="xs">{baseUrl}</Code>
      </Text>

      <Tabs variant="enclosed" colorScheme="blue" isLazy>
        <TabList>
          <Tab>Credenciais</Tab>
          <Tab>Documentação</Tab>
        </TabList>
        <TabPanels>
          {/* ── Credenciais ─────────────────────────────────────────────── */}
          <TabPanel px={0}>
            <Flex mb={3} align="center">
              <Text fontWeight="semibold">Credenciais cadastradas</Text>
              <Button size="sm" colorScheme="blue" ml="auto" onClick={openNew}>+ Nova credencial</Button>
            </Flex>

            {clients.length === 0 ? (
              <Box p={6} borderWidth="1px" borderColor={border} borderRadius="md" bg={cardBg} textAlign="center">
                <Text color={subtle}>Nenhuma credencial criada. Clique em “Nova credencial” para gerar a primeira chave.</Text>
              </Box>
            ) : (
              <Box overflowX="auto" borderWidth="1px" borderColor={border} borderRadius="md" bg={cardBg}>
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Nome</Th>
                      <Th>Chave</Th>
                      <Th>Rotas</Th>
                      <Th isNumeric>Limite/min</Th>
                      <Th>Expira</Th>
                      <Th>Último uso</Th>
                      <Th isNumeric>Req. 7d</Th>
                      <Th>Status</Th>
                      <Th isNumeric>Ações</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {clients.map((c) => {
                      const expired = c.expires_at && new Date(c.expires_at) < new Date();
                      return (
                        <Tr key={c.id}>
                          <Td>
                            <Text fontWeight="semibold">{c.name}</Text>
                            {c.description && <Text fontSize="xs" color={subtle} noOfLines={1}>{c.description}</Text>}
                          </Td>
                          <Td><Code fontSize="xs">{c.key_prefix}…</Code></Td>
                          <Td maxW="260px">
                            <Wrap spacing={1}>
                              {(c.scopes || []).map((k) => (
                                <WrapItem key={k}><Badge colorScheme={k === "*" ? "purple" : "blue"} fontSize="0.65rem">{scopeLabel(k)}</Badge></WrapItem>
                              ))}
                              {!c.scopes?.length && <Text fontSize="xs" color={subtle}>nenhuma</Text>}
                            </Wrap>
                          </Td>
                          <Td isNumeric>{c.rate_limit_per_min || "∞"}</Td>
                          <Td>
                            <Text fontSize="sm" color={expired ? "red.400" : undefined}>{fmtDate(c.expires_at)}</Text>
                          </Td>
                          <Td><Text fontSize="sm">{fmtDateTime(c.last_used_at)}</Text></Td>
                          <Td isNumeric>
                            <Tooltip label={`${c.usage_7d?.errors || 0} erros · média ${c.usage_7d?.avg_ms ?? "—"} ms · total ${c.request_count}`}>
                              <Text as="span">{c.usage_7d?.requests || 0}</Text>
                            </Tooltip>
                          </Td>
                          <Td>
                            {expired ? <Badge colorScheme="red">Expirada</Badge>
                              : c.active ? <Badge colorScheme="green">Ativa</Badge>
                                : <Badge colorScheme="gray">Inativa</Badge>}
                          </Td>
                          <Td isNumeric whiteSpace="nowrap">
                            <Button size="xs" variant="outline" mr={1} onClick={() => openEdit(c)}>Editar</Button>
                            <Button size="xs" variant="outline" mr={1} onClick={() => rotate(c)}>Nova chave</Button>
                            <Button size="xs" variant="outline" mr={1} onClick={() => openLogs(c)}>Log</Button>
                            <Button size="xs" variant="outline" mr={1} onClick={() => toggleActive(c)}>{c.active ? "Desativar" : "Ativar"}</Button>
                            <Button size="xs" variant="outline" colorScheme="red" onClick={() => remove(c)}>Excluir</Button>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            )}
          </TabPanel>

          {/* ── Documentação ────────────────────────────────────────────── */}
          <TabPanel px={0}>
            <Docs registry={registry} baseUrl={baseUrl} curlFor={curlFor} copy={copy} subtle={subtle} border={border} cardBg={cardBg} codeBg={codeBg} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* ── Modal criar/editar ───────────────────────────────────────────── */}
      <Modal isOpen={editModal.isOpen} onClose={editModal.onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? `Editar credencial — ${editing.name}` : "Nova credencial"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4}>
              <FormControl isRequired>
                <FormLabel fontSize="sm">Nome</FormLabel>
                <Input size="sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex: Power BI, Integração X" />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Limite de requisições por minuto</FormLabel>
                <Input size="sm" type="number" min={0} value={draft.rate_limit_per_min} onChange={(e) => setDraft({ ...draft, rate_limit_per_min: e.target.value })} />
                <FormHelperText fontSize="xs">0 = sem limite</FormHelperText>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">Expira em</FormLabel>
                <Input size="sm" type="date" value={draft.expires_at} onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })} />
                <FormHelperText fontSize="xs">Em branco = não expira</FormHelperText>
              </FormControl>
              {editing && (
                <FormControl display="flex" alignItems="center" pt={6}>
                  <Switch id="api-active" isChecked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} mr={2} />
                  <FormLabel htmlFor="api-active" fontSize="sm" mb={0}>Credencial ativa</FormLabel>
                </FormControl>
              )}
            </SimpleGrid>

            <FormControl mb={4}>
              <FormLabel fontSize="sm">Descrição</FormLabel>
              <Textarea size="sm" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Quem usa e para quê" />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm">Rotas liberadas</FormLabel>
              <Box borderWidth="1px" borderColor={border} borderRadius="md" p={3}>
                <Checkbox isChecked={allSelected} onChange={toggleAll} mb={2} fontWeight="semibold">Todas as rotas (inclui rotas futuras)</Checkbox>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                  {selectableScopes.map((s) => (
                    <Checkbox key={s.key} isChecked={allSelected || draft.scopes.includes(s.key)} isDisabled={allSelected} onChange={() => toggleScope(s.key)}>
                      <Text as="span" fontSize="sm">{s.label}</Text>
                      <Text as="span" fontSize="xs" color={subtle} ml={1}>/{s.key}</Text>
                    </Checkbox>
                  ))}
                </SimpleGrid>
                <Text fontSize="xs" color={subtle} mt={2}>A rota /health fica liberada para qualquer credencial válida.</Text>
              </Box>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={2} onClick={editModal.onClose}>Cancelar</Button>
            <Button colorScheme="blue" onClick={save} isLoading={saving}>{editing ? "Salvar" : "Gerar chave"}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Modal chave gerada (mostrada uma vez) ────────────────────────── */}
      <Modal isOpen={keyModal.isOpen} onClose={keyModal.onClose} size="xl" closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Chave gerada — {revealed?.client?.name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Box bg="orange.50" _dark={{ bg: "orange.900", color: "orange.100" }} color="orange.800" p={3} borderRadius="md" mb={4} fontSize="sm">
              Esta chave é exibida <b>somente agora</b>. Copie e guarde em local seguro. Se perder, gere uma nova em “Nova chave”.
            </Box>
            <Text fontSize="sm" fontWeight="semibold" mb={1}>Chave</Text>
            <Flex gap={2} mb={4} align="center">
              <Code p={2} fontSize="sm" flex="1" wordBreak="break-all">{revealed?.key}</Code>
              <Button size="sm" onClick={() => copy(revealed?.key, "Chave copiada")}>Copiar</Button>
            </Flex>
            <Text fontSize="sm" fontWeight="semibold" mb={1}>Teste rápido</Text>
            <Flex gap={2} align="center">
              <Code p={2} fontSize="xs" flex="1" whiteSpace="pre-wrap" wordBreak="break-all">{curlFor(revealed?.key || "")}</Code>
              <Button size="sm" onClick={() => copy(curlFor(revealed?.key || ""), "Comando copiado")}>Copiar</Button>
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={keyModal.onClose}>Já copiei</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Modal log de requisições ─────────────────────────────────────── */}
      <Modal isOpen={logsModal.isOpen} onClose={logsModal.onClose} size="4xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Log de requisições — {logsFor?.name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {logsLoading ? <Flex justify="center" py={6}><Spinner /></Flex> : logs.length === 0 ? (
              <Text color={subtle} fontSize="sm">Nenhuma requisição registrada.</Text>
            ) : (
              <Box overflowX="auto" maxH="60vh" overflowY="auto">
                <Table size="sm">
                  <Thead><Tr><Th>Quando</Th><Th>Método</Th><Th>Caminho</Th><Th>Rota</Th><Th isNumeric>Status</Th><Th isNumeric>ms</Th><Th>IP</Th></Tr></Thead>
                  <Tbody>
                    {logs.map((l) => (
                      <Tr key={l.id}>
                        <Td whiteSpace="nowrap">{fmtDateTime(l.created_at)}</Td>
                        <Td>{l.method}</Td>
                        <Td><Code fontSize="xs">{l.path}</Code></Td>
                        <Td>{l.route_key || "—"}</Td>
                        <Td isNumeric><Badge colorScheme={l.status_code >= 500 ? "red" : l.status_code >= 400 ? "orange" : "green"}>{l.status_code}</Badge></Td>
                        <Td isNumeric>{l.duration_ms}</Td>
                        <Td>{l.ip || "—"}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </ModalBody>
          <ModalFooter><Button onClick={logsModal.onClose}>Fechar</Button></ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

// ── Documentação ──────────────────────────────────────────────────────────────

function Docs({ registry, baseUrl, curlFor, copy, subtle, border, cardBg, codeBg }) {
  const example = curlFor("SUA_CHAVE", "/sales/summary?group_by=month&start=2026-01-01&end=2026-12-31");
  return (
    <Box>
      <Box borderWidth="1px" borderColor={border} borderRadius="md" bg={cardBg} p={4} mb={4}>
        <Text fontWeight="semibold" mb={2}>Como autenticar</Text>
        <Text fontSize="sm" mb={2}>
          Envie a chave em todas as requisições no header <Code fontSize="xs">X-API-Key</Code> (ou <Code fontSize="xs">Authorization: Bearer &lt;chave&gt;</Code>).
          Endereço base: <Code fontSize="xs">{baseUrl}</Code>
        </Text>
        <Flex gap={2} align="center" mb={3}>
          <Code p={2} fontSize="xs" flex="1" whiteSpace="pre-wrap" wordBreak="break-all" bg={codeBg}>{example}</Code>
          <Button size="sm" onClick={() => copy(example, "Exemplo copiado")}>Copiar</Button>
        </Flex>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} fontSize="sm">
          <Box>
            <Text fontWeight="semibold" fontSize="xs" color={subtle} mb={1}>RESPOSTA</Text>
            <Code display="block" p={2} fontSize="xs" whiteSpace="pre" bg={codeBg}>{`{ "data": [...], "meta": { "total": 120, "limit": 500, ... } }`}</Code>
          </Box>
          <Box>
            <Text fontWeight="semibold" fontSize="xs" color={subtle} mb={1}>ERRO</Text>
            <Code display="block" p={2} fontSize="xs" whiteSpace="pre" bg={codeBg}>{`{ "error": { "code": "scope_denied", "message": "..." } }`}</Code>
          </Box>
        </SimpleGrid>
        <Text fontSize="xs" color={subtle} mt={3}>
          Códigos: 401 chave ausente/inválida · 403 credencial inativa, expirada ou sem a rota · 429 limite por minuto (headers X-RateLimit-*) · 404 recurso não encontrado.
          Datas no formato YYYY-MM-DD (fuso de São Paulo). Valores monetários em reais, número decimal.
        </Text>
      </Box>

      {registry.scopes.map((s) => (
        <Box key={s.key} borderWidth="1px" borderColor={border} borderRadius="md" bg={cardBg} p={4} mb={3}>
          <HStack mb={1} spacing={2}>
            <Text fontWeight="semibold">{s.label}</Text>
            <Badge colorScheme="blue" fontSize="0.65rem">{s.key}</Badge>
            {s.always && <Badge colorScheme="green" fontSize="0.65rem">sempre liberada</Badge>}
          </HStack>
          <Text fontSize="sm" color={subtle} mb={3}>{s.description}</Text>
          {s.endpoints.map((ep) => (
            <Box key={ep.method + ep.path} mb={3} pl={3} borderLeftWidth="3px" borderLeftColor="blue.300">
              <Flex align="center" gap={2} mb={1} wrap="wrap">
                <Badge colorScheme="green">{ep.method}</Badge>
                <Code fontSize="xs">{registry.base}{ep.path}</Code>
                <Button size="xs" variant="ghost" onClick={() => copy(`${baseUrl}${ep.path}`, "URL copiada")}>copiar URL</Button>
              </Flex>
              <Text fontSize="sm" mb={1}>{ep.summary}</Text>
              {ep.params?.length > 0 && (
                <Box overflowX="auto">
                  <Table size="sm" variant="simple" fontSize="xs">
                    <Thead><Tr><Th>Parâmetro</Th><Th>Tipo</Th><Th>Descrição</Th></Tr></Thead>
                    <Tbody>
                      {ep.params.map((p) => (
                        <Tr key={p.name}><Td><Code fontSize="xs">{p.name}</Code></Td><Td>{p.type}</Td><Td>{p.description}</Td></Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
