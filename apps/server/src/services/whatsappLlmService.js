const salesRepo = require('../db/salesRepository');
const cashflowRepo = require('../db/cashflowRepository');
const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[WhatsApp LLM]';

// --- Conversation History (in-memory, per user) ---
const HISTORY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY_TURNS = 6; // keep last 6 user+assistant pairs
const conversationHistory = new Map(); // userId -> { messages: [], lastActivity: Date }

function getHistory(userId) {
  const entry = conversationHistory.get(userId);
  if (!entry) return [];
  // Expire stale conversations
  if (Date.now() - entry.lastActivity > HISTORY_TTL_MS) {
    conversationHistory.delete(userId);
    return [];
  }
  return entry.messages;
}

function saveHistory(userId, userMsg, assistantMsg) {
  let entry = conversationHistory.get(userId);
  if (!entry) {
    entry = { messages: [], lastActivity: Date.now() };
    conversationHistory.set(userId, entry);
  }
  entry.messages.push({ role: 'user', content: userMsg });
  entry.messages.push({ role: 'assistant', content: assistantMsg });
  entry.lastActivity = Date.now();
  // Trim to keep only last N turns (each turn = user + assistant)
  while (entry.messages.length > MAX_HISTORY_TURNS * 2) {
    entry.messages.shift();
    entry.messages.shift();
  }
}

// --- Helper: filter out canceled/returned sales ---
function filterActiveSales(sales) {
  return sales.filter(s => {
    if (!s.status) return true;
    const normalized = s.status.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ');
    return !['cancelado', 'para devolver', 'pos-venda', 'pos venda'].some(t => normalized.includes(t));
  });
}

// --- Tool Definitions ---
// Keep tool count low (max 6) for Groq/Llama compatibility
const TOOL_DEFINITIONS = {
  get_sales_summary: {
    description: 'Buscar resumo/total de vendas por periodo. USE ESTA FERRAMENTA para perguntas sobre "quanto vendeu", "total de vendas", "faturamento", valores totais. Retorna clientes atendidos, itens, receita e ticket medio. Filtra por loja, estado ou produto.',
    parameters: {
      start_date: { type: 'string', description: 'Data inicio YYYY-MM-DD' },
      end_date: { type: 'string', description: 'Data fim YYYY-MM-DD' },
      store: { type: 'string', description: 'Filtrar por loja (opcional)' },
      state: { type: 'string', description: 'Filtrar por estado/UF (opcional)' },
      group_by: { type: 'string', description: 'Agrupar por: "state" para ranking por estado, "product" para ranking por produto (opcional)' }
    },
    required: ['start_date', 'end_date'],
    requiredFeature: 'featureSales'
  },
  get_orders: {
    description: 'Listar/buscar vendas individuais com detalhes: cliente, data, loja, produtos, valor. Use para lista de vendas, detalhes, buscar pedido/cliente por codigo ou nome. NAO use para totais.',
    parameters: {
      start_date: { type: 'string', description: 'Data inicio YYYY-MM-DD (opcional se search fornecido)' },
      end_date: { type: 'string', description: 'Data fim YYYY-MM-DD (opcional se search fornecido)' },
      store: { type: 'string', description: 'Filtrar por loja (opcional)' },
      state: { type: 'string', description: 'Filtrar por estado/UF (opcional)' },
      search: { type: 'string', description: 'Buscar por numero do pedido, codigo do cliente ou nome do cliente (opcional)' }
    },
    required: [],
    requiredFeature: 'featureSales'
  },
  get_cashflow_summary: {
    description: 'Resumo do fluxo de caixa: entradas, saidas, saldo. Pode listar lancamentos individuais.',
    parameters: {
      year: { type: 'number', description: 'Ano (ex: 2026)' },
      month: { type: 'number', description: 'Mes 1-12' },
      show_entries: { type: 'boolean', description: 'true para listar lancamentos individuais (opcional)' }
    },
    required: ['year', 'month'],
    requiredFeature: 'featureCashflow'
  },
  find_boleto: {
    description: 'Buscar PDF de boleto por nome ou numero.',
    parameters: {
      search_term: { type: 'string', description: 'Termo de busca' }
    },
    required: ['search_term'],
    requiredFeature: 'featureBoleto'
  },
  find_nota_fiscal: {
    description: 'Buscar PDF de nota fiscal por numero ou nome.',
    parameters: {
      search_term: { type: 'string', description: 'Termo de busca' }
    },
    required: ['search_term'],
    requiredFeature: 'featureNf'
  }
};

// --- Tool Execution ---
async function executeTool(toolName, args, settings) {
  console.log(`${LOG_PREFIX} Executing tool: ${toolName}`, JSON.stringify(args));

  switch (toolName) {
    case 'get_sales_summary': {
      const sales = await salesRepo.getSales({
        start: args.start_date,
        end: args.end_date,
        store: args.store || undefined,
        state: args.state || undefined
      });
      const activeSales = filterActiveSales(sales);
      const totalRevenue = activeSales.reduce((sum, s) => sum + s.total, 0);
      const totalQuantity = activeSales.reduce((sum, s) => sum + (s.quantity || 0), 0);
      const uniqueClients = new Set(
        activeSales.map(s => s.orderId || `${s.date}-${s.store}-${s.product}`)
      ).size;
      const avgTicket = uniqueClients > 0 ? totalRevenue / uniqueClients : 0;

      const result = {
        periodo: `${args.start_date} a ${args.end_date}`,
        loja: args.store || 'Todas',
        estado: args.state || 'Todos',
        clientesAtendidos: uniqueClients,
        totalItens: totalQuantity,
        receitaTotal: `R$ ${totalRevenue.toFixed(2)}`,
        ticketMedio: `R$ ${avgTicket.toFixed(2)}`
      };

      // Group by state or product if requested
      if (args.group_by === 'state') {
        const groupMap = new Map();
        for (const s of activeSales) {
          const key = s.state || 'Nao informado';
          if (!groupMap.has(key)) groupMap.set(key, { receita: 0, itens: 0 });
          const e = groupMap.get(key);
          e.receita += s.total;
          e.itens += s.quantity || 0;
        }
        result.rankingPorEstado = Array.from(groupMap.entries())
          .map(([estado, e]) => `${estado}: R$ ${e.receita.toFixed(2)} (${e.itens} itens)`)
          .sort()
          .slice(0, 15);
      } else if (args.group_by === 'product') {
        const groupMap = new Map();
        for (const s of activeSales) {
          const key = s.product || 'Nao informado';
          if (!groupMap.has(key)) groupMap.set(key, { receita: 0, qtd: 0 });
          const e = groupMap.get(key);
          e.receita += s.total;
          e.qtd += s.quantity || 0;
        }
        result.rankingPorProduto = Array.from(groupMap.entries())
          .map(([produto, e]) => ({ produto, receita: e.receita, qtd: e.qtd }))
          .sort((a, b) => b.receita - a.receita)
          .slice(0, 15)
          .map(e => `${e.produto}: R$ ${e.receita.toFixed(2)} (${e.qtd} un)`);
      }

      return result;
    }

    case 'get_orders': {
      let activeSales;

      if (args.search) {
        // Search by order_id, codcli, client_name, nome_fantasia, cnpj_cpf
        const allResults = await salesRepo.searchSales(args.search.trim());
        activeSales = filterActiveSales(allResults);
        // Further filter by date if provided
        if (args.start_date) {
          const startD = new Date(args.start_date);
          activeSales = activeSales.filter(s => new Date(s.date) >= startD);
        }
        if (args.end_date) {
          const endD = new Date(args.end_date + 'T23:59:59');
          activeSales = activeSales.filter(s => new Date(s.date) <= endD);
        }
      } else {
        // Date-based query
        const filters = {
          start: args.start_date,
          end: args.end_date,
          store: args.store || undefined,
          state: args.state || undefined
        };
        const sales = await salesRepo.getSales(filters);
        activeSales = filterActiveSales(sales);
      }

      if (activeSales.length === 0) {
        return { periodo: args.start_date && args.end_date ? `${args.start_date} a ${args.end_date}` : 'todos', busca: args.search || null, totalClientes: 0, mensagem: 'Nenhuma venda encontrada com os filtros informados.' };
      }

      // Group line items by client code (order_id)
      const orderMap = new Map();
      for (const s of activeSales) {
        const key = s.orderId || `${s.date}-${s.store}-${s.product}`;
        if (!orderMap.has(key)) {
          const dateStr = typeof s.date === 'object'
            ? s.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : String(s.date).split('T')[0];
          orderMap.set(key, {
            codigo: s.orderId || 'N/A',
            codcli: s.codcli || '',
            cliente: s.clientName || '',
            nomeFantasia: s.nomeFantasia || '',
            cnpjCpf: s.cnpjCpf || '',
            data: dateStr,
            loja: s.store,
            estado: s.state || 'N/A',
            produtos: [],
            valorTotal: 0
          });
        }
        const order = orderMap.get(key);
        order.produtos.push(`${s.product}${s.variation ? ` (${s.variation})` : ''} x${s.quantity}`);
        order.valorTotal += s.total;
      }
      // Sort by value desc, limit to 30
      const orders = Array.from(orderMap.values())
        .sort((a, b) => b.valorTotal - a.valorTotal)
        .slice(0, 30);
      // Build pre-formatted text
      const linhas = orders.map((o, i) => {
        const prods = o.produtos.length > 3
          ? [...o.produtos.slice(0, 3), `+${o.produtos.length - 3} itens`].join(', ')
          : o.produtos.join(', ');
        const nomeExibicao = o.cliente || o.nomeFantasia || '';
        const nomeCliente = nomeExibicao ? ` (${nomeExibicao})` : '';
        const docCliente = o.cnpjCpf ? ` | CPF/CNPJ: ${o.cnpjCpf}` : '';
        const codCliInfo = o.codcli ? ` | Cod.Cliente: ${o.codcli}` : '';
        return `${i + 1}. Pedido #${o.codigo}${nomeCliente} | ${o.data} | ${o.loja} | ${o.estado} | R$ ${o.valorTotal.toFixed(2)}${codCliInfo}${docCliente}\n   Produtos: ${prods}`;
      });
      const totalReceita = orders.reduce((s, o) => s + o.valorTotal, 0);
      return {
        periodo: `${args.start_date} a ${args.end_date}`,
        totalClientes: orderMap.size,
        mostrados: orders.length,
        receitaTotal: `R$ ${totalReceita.toFixed(2)}`,
        detalhes: linhas.join('\n\n')
      };
    }

    case 'get_cashflow_summary': {
      const boxes = await cashflowRepo.getBoxes();
      const boxId = boxes[0]?.id;
      if (!boxId) return { erro: 'Nenhum caixa encontrado.' };

      const entries = await cashflowRepo.getEntries(args.year, args.month, boxId);
      const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
      const balance = await cashflowRepo.getBalance(args.year, args.month, boxId);

      const result = {
        ano: args.year,
        mes: args.month,
        totalEntradas: `R$ ${income.toFixed(2)}`,
        totalSaidas: `R$ ${expense.toFixed(2)}`,
        resultado: `R$ ${(income - expense).toFixed(2)}`,
        saldoInicial: balance ? `R$ ${parseFloat(balance.openingBalance || 0).toFixed(2)}` : 'N/A'
      };

      if (args.show_entries) {
        result.lancamentos = entries.slice(0, 20).map(e => ({
          data: e.date,
          descricao: e.description,
          tipo: e.type === 'income' ? 'Entrada' : 'Saida',
          valor: `R$ ${e.amount.toFixed(2)}`,
          categoria: e.categoryName
        }));
      }

      return result;
    }

    case 'find_boleto': {
      return findPdfFile(settings.boletoPath, args.search_term);
    }

    case 'find_nota_fiscal': {
      return findPdfFile(settings.nfPath, args.search_term);
    }

    default:
      return { erro: `Ferramenta desconhecida: ${toolName}` };
  }
}

function findPdfFile(basePath, searchTerm) {
  if (!basePath) {
    return { found: false, message: 'Caminho da pasta nao configurado.' };
  }

  try {
    if (!fs.existsSync(basePath)) {
      return { found: false, message: 'Pasta nao encontrada no servidor.' };
    }

    const files = fs.readdirSync(basePath)
      .filter(f => f.toLowerCase().endsWith('.pdf'));

    const term = searchTerm.toLowerCase();
    const matches = files.filter(f => f.toLowerCase().includes(term));

    if (matches.length === 0) {
      return { found: false, message: `Nenhum arquivo encontrado para "${searchTerm}".` };
    }

    if (matches.length > 5) {
      return {
        found: true,
        multiple: true,
        message: `Encontrados ${matches.length} arquivos. Refine a busca.`,
        arquivos: matches.slice(0, 5).map(f => f)
      };
    }

    return {
      found: true,
      files: matches.map(f => ({
        fileName: f,
        filePath: path.join(basePath, f)
      }))
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Error searching PDFs:`, err);
    return { found: false, message: `Erro ao buscar arquivos: ${err.message}` };
  }
}

// --- Provider Adapters ---
function getEnabledTools(settings) {
  return Object.entries(TOOL_DEFINITIONS)
    .filter(([, def]) => settings[def.requiredFeature])
    .map(([name, def]) => ({ name, ...def }));
}

function formatToolsForGroq(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: t.required || []
      }
    }
  }));
}

function formatToolsForClaude(tools) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
      ),
      required: t.required || []
    }
  }));
}

// --- Message Formatting per Provider ---
function formatMessagesForOpenAI(messages) {
  return messages.map(m => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls };
    }
    return { role: m.role, content: m.content };
  });
}

function formatMessagesForClaude(messages) {
  const result = [];
  for (const m of messages) {
    if (m.role === 'tool_result') {
      result.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_use_id, content: m.content }]
      });
    } else if (m.role === 'assistant' && m.content_blocks) {
      result.push({ role: 'assistant', content: m.content_blocks });
    } else if (m.role !== 'system') {
      result.push({ role: m.role, content: m.content });
    }
  }
  return result;
}

// --- Parse malformed Groq/Llama tool calls ---
// Llama generates tool calls in various broken formats:
//   <function=tool_name={"arg":"val"}</function>
//   <function=tool_name,{"arg":"val"}</function>
//   <function=tool_name>{"arg":"val"}</function>
//   <function=tool_name({"arg":"val"})></function>
//   <function=tool_name({"arg":"val"})  (without closing tag)
function parseFailedToolCall(failedGeneration) {
  if (!failedGeneration) return null;
  try {
    // Strategy 1: Match <function=NAME + separator + JSON + </function>
    const match1 = failedGeneration.match(/<function=(\w+)[^a-zA-Z0-9]([\s\S]*?)<\/function>/);
    if (match1) {
      const name = match1[1];
      let jsonStr = match1[2].trim();
      // Remove wrapping parentheses from function-call style
      if (jsonStr.startsWith('{') === false && jsonStr.startsWith('(')) {
        jsonStr = jsonStr.slice(1);
      }
      if (jsonStr.endsWith(')')) {
        jsonStr = jsonStr.slice(0, -1).trim();
      }
      const args = JSON.parse(jsonStr);
      return { name, arguments: args };
    }
    // Strategy 2: No closing tag - extract function name and find JSON block
    const match2 = failedGeneration.match(/<function=(\w+)/);
    if (match2) {
      const name = match2[1];
      const afterName = failedGeneration.slice(match2.index + match2[0].length);
      const jsonMatch = afterName.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const args = JSON.parse(jsonMatch[0]);
        return { name, arguments: args };
      }
    }
  } catch (e) {
    console.warn(`${LOG_PREFIX} Could not parse failed_generation:`, e.message);
  }
  return null;
}

// --- LLM API Calls ---
async function callLlm(settings, messages, tools) {
  const { llmProvider, llmApiKey, llmModel, llmBaseUrl } = settings;

  if (llmProvider === 'groq') {
    const body = {
      model: llmModel || 'llama-3.3-70b-versatile',
      messages: formatMessagesForOpenAI(messages),
      max_tokens: 1024
    };
    if (tools.length > 0) {
      body.tools = formatToolsForGroq(tools);
      body.parallel_tool_calls = false;
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llmApiKey}` },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errMsg = err.error?.message || `Groq API error ${res.status}`;
      if (errMsg.includes('Failed to call a function')) {
        const failedGen = err.error?.failed_generation || '';
        console.warn(`${LOG_PREFIX} Groq tool calling failed. Details:`, failedGen);
        // Try to parse the malformed tool call from failed_generation
        const parsed = parseFailedToolCall(failedGen);
        if (parsed) {
          console.log(`${LOG_PREFIX} Recovered tool call from failed_generation: ${parsed.name}`, JSON.stringify(parsed.arguments));
          return {
            provider: 'groq',
            recoveredToolCall: parsed,
            data: { choices: [{ message: { content: null, tool_calls: [{
              id: `recovered_${Date.now()}`,
              function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments) }
            }] } }] }
          };
        }
        // Could not recover - return text response instead of throwing
        console.warn(`${LOG_PREFIX} Could not recover tool call. Returning fallback response.`);
        return {
          provider: 'groq',
          data: { choices: [{ message: { content: 'Desculpe, tive um problema ao processar sua consulta. Pode reformular a pergunta de forma mais simples?', tool_calls: null } }] }
        };
      }
      throw new Error(errMsg);
    }
    return { provider: 'groq', data: await res.json() };
  }

  if (llmProvider === 'claude') {
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    const body = {
      model: llmModel || 'claude-sonnet-4-5-20250929',
      system: systemMsg,
      messages: formatMessagesForClaude(nonSystemMsgs),
      max_tokens: 1024
    };
    if (tools.length > 0) body.tools = formatToolsForClaude(tools);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': llmApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API error ${res.status}`);
    }
    return { provider: 'claude', data: await res.json() };
  }

  if (llmProvider === 'ollama') {
    const baseUrl = llmBaseUrl || 'http://localhost:11434';
    const body = {
      model: llmModel || 'llama3.1',
      messages: formatMessagesForOpenAI(messages),
      stream: false
    };
    if (tools.length > 0) body.tools = formatToolsForGroq(tools);

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Ollama error ${res.status}`);
    }
    return { provider: 'ollama', data: await res.json() };
  }

  throw new Error(`Provedor LLM nao suportado: ${llmProvider}`);
}

// --- Response Parsing ---
function extractToolCalls(provider, response) {
  const { data } = response;

  if (provider === 'groq' || provider === 'ollama') {
    const msg = provider === 'ollama' ? data.message : data.choices?.[0]?.message;
    if (!msg?.tool_calls || msg.tool_calls.length === 0) return null;
    return msg.tool_calls.map(tc => ({
      id: tc.id || `call_${Date.now()}`,
      name: tc.function.name,
      arguments: typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments
    }));
  }

  if (provider === 'claude') {
    const toolBlocks = (data.content || []).filter(b => b.type === 'tool_use');
    if (toolBlocks.length === 0) return null;
    return toolBlocks.map(b => ({
      id: b.id,
      name: b.name,
      arguments: b.input
    }));
  }

  return null;
}

function extractTextResponse(provider, response) {
  const { data } = response;

  if (provider === 'groq' || provider === 'ollama') {
    const msg = provider === 'ollama' ? data.message : data.choices?.[0]?.message;
    return msg?.content || '';
  }

  if (provider === 'claude') {
    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    return textBlocks.map(b => b.text).join('\n');
  }

  return '';
}

function appendAssistantMessage(provider, messages, response) {
  const { data } = response;

  if (provider === 'groq' || provider === 'ollama') {
    const msg = provider === 'ollama' ? data.message : data.choices?.[0]?.message;
    messages.push({
      role: 'assistant',
      content: msg?.content || null,
      tool_calls: msg?.tool_calls
    });
  }

  if (provider === 'claude') {
    messages.push({
      role: 'assistant',
      content_blocks: data.content
    });
  }
}

function appendToolResults(provider, messages, toolCalls, results) {
  if (provider === 'groq' || provider === 'ollama') {
    for (let i = 0; i < toolCalls.length; i++) {
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[i].id,
        content: JSON.stringify(results[i])
      });
    }
  }

  if (provider === 'claude') {
    const resultBlocks = toolCalls.map((tc, i) => ({
      type: 'tool_result',
      tool_use_id: tc.id,
      content: JSON.stringify(results[i])
    }));
    messages.push({
      role: 'user',
      content: resultBlocks
    });
  }
}

// --- Main Message Processing ---
async function processMessage(messageText, user, settings) {
  const enabledTools = getEnabledTools(settings);
  console.log(`${LOG_PREFIX} Processing message from ${user.name}. Provider: ${settings.llmProvider}, Model: ${settings.llmModel}, Tools: ${enabledTools.length} (${enabledTools.map(t => t.name).join(', ')})`);

  const today = new Date().toISOString().split('T')[0];
  const systemMessage = {
    role: 'system',
    content: `${settings.systemPrompt}\n\nData de hoje: ${today}\nUsuario: ${user.name} (${user.role})\n\nInstrucoes de formatacao:\n- Seja conciso, maximo 1500 caracteres por resposta.\n- Ao listar pedidos, SEMPRE mostre cada pedido com: numero, data, loja, valor e produtos. Use o campo "detalhes" da ferramenta diretamente.\n- Ao mostrar resumos de vendas, inclua periodo, total de pedidos, receita e ticket medio.\n- Formate valores monetarios com R$ e duas casas decimais.`
  };

  // Build messages with conversation history for context
  const history = getHistory(user.id);
  const messages = [
    systemMessage,
    ...history,
    { role: 'user', content: messageText }
  ];

  const filesToSend = [];

  try {
    for (let i = 0; i < 5; i++) {
      const response = await callLlm(settings, messages, enabledTools);
      const toolCalls = extractToolCalls(response.provider, response);

      if (!toolCalls || toolCalls.length === 0) {
        const text = extractTextResponse(response.provider, response);
        const finalText = text || 'Desculpe, nao consegui gerar uma resposta.';
        // Save this exchange to history
        saveHistory(user.id, messageText, finalText);
        return { text: finalText, files: filesToSend };
      }

      // Execute all tool calls
      const results = [];
      for (const tc of toolCalls) {
        const result = await executeTool(tc.name, tc.arguments, settings);
        results.push(result);

        // Collect PDF files to send
        if ((tc.name === 'find_boleto' || tc.name === 'find_nota_fiscal') && result.found && result.files) {
          filesToSend.push(...result.files);
        }
      }

      // Append assistant + tool results to conversation
      appendAssistantMessage(response.provider, messages, response);
      appendToolResults(response.provider, messages, toolCalls, results);
    }

    const fallback = 'Desculpe, nao consegui processar sua solicitacao. Tente reformular.';
    saveHistory(user.id, messageText, fallback);
    return { text: fallback, files: filesToSend };
  } catch (err) {
    console.error(`${LOG_PREFIX} Error processing message:`, err);
    return { text: `Erro ao processar: ${err.message}`, files: [] };
  }
}

module.exports = {
  processMessage
};
