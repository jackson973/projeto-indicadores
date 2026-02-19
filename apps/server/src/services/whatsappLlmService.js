const salesRepo = require('../db/salesRepository');
const cashflowRepo = require('../db/cashflowRepository');
const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[WhatsApp LLM]';

// --- Tool Definitions ---
const TOOL_DEFINITIONS = {
  get_sales_summary: {
    description: 'Buscar resumo de vendas por periodo. Retorna total de vendas, receita total e ticket medio.',
    parameters: {
      start_date: { type: 'string', description: 'Data inicio no formato YYYY-MM-DD' },
      end_date: { type: 'string', description: 'Data fim no formato YYYY-MM-DD' },
      store: { type: 'string', description: 'Filtrar por loja (opcional)' }
    },
    required: ['start_date', 'end_date'],
    requiredFeature: 'featureSales'
  },
  get_stores: {
    description: 'Listar todas as lojas disponiveis.',
    parameters: {},
    required: [],
    requiredFeature: 'featureSales'
  },
  get_cashflow_summary: {
    description: 'Buscar resumo do fluxo de caixa de um mes: total de entradas, saidas e saldo.',
    parameters: {
      year: { type: 'number', description: 'Ano (ex: 2026)' },
      month: { type: 'number', description: 'Mes de 1 a 12' }
    },
    required: ['year', 'month'],
    requiredFeature: 'featureCashflow'
  },
  get_cashflow_entries: {
    description: 'Listar lancamentos do fluxo de caixa de um mes (maximo 20 registros).',
    parameters: {
      year: { type: 'number', description: 'Ano (ex: 2026)' },
      month: { type: 'number', description: 'Mes de 1 a 12' }
    },
    required: ['year', 'month'],
    requiredFeature: 'featureCashflow'
  },
  find_boleto: {
    description: 'Buscar arquivo PDF de boleto pelo nome do arquivo ou numero do cliente.',
    parameters: {
      search_term: { type: 'string', description: 'Termo de busca (nome, numero, etc.)' }
    },
    required: ['search_term'],
    requiredFeature: 'featureBoleto'
  },
  find_nota_fiscal: {
    description: 'Buscar arquivo PDF de nota fiscal pelo numero ou nome.',
    parameters: {
      search_term: { type: 'string', description: 'Termo de busca (numero da NF, nome, etc.)' }
    },
    required: ['search_term'],
    requiredFeature: 'featureNf'
  }
};

// --- Tool Execution ---
async function executeTool(toolName, args, settings) {
  console.log(`${LOG_PREFIX} Executing tool: ${toolName}`, args);

  switch (toolName) {
    case 'get_sales_summary': {
      const sales = await salesRepo.getSales({
        start: args.start_date,
        end: args.end_date,
        store: args.store || undefined
      });
      const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
      const count = sales.length;
      const avgTicket = count > 0 ? totalRevenue / count : 0;
      return {
        periodo: `${args.start_date} a ${args.end_date}`,
        loja: args.store || 'Todas',
        totalVendas: count,
        receitaTotal: `R$ ${totalRevenue.toFixed(2)}`,
        ticketMedio: `R$ ${avgTicket.toFixed(2)}`
      };
    }

    case 'get_stores': {
      const stores = await salesRepo.getStores();
      return { lojas: stores };
    }

    case 'get_cashflow_summary': {
      const boxes = await cashflowRepo.getBoxes();
      const boxId = boxes[0]?.id;
      if (!boxId) return { erro: 'Nenhum caixa encontrado.' };

      const entries = await cashflowRepo.getEntries(args.year, args.month, boxId);
      const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

      const balance = await cashflowRepo.getBalance(args.year, args.month, boxId);

      return {
        ano: args.year,
        mes: args.month,
        totalEntradas: `R$ ${income.toFixed(2)}`,
        totalSaidas: `R$ ${expense.toFixed(2)}`,
        resultado: `R$ ${(income - expense).toFixed(2)}`,
        saldoInicial: balance ? `R$ ${parseFloat(balance.openingBalance || 0).toFixed(2)}` : 'N/A'
      };
    }

    case 'get_cashflow_entries': {
      const boxes = await cashflowRepo.getBoxes();
      const boxId = boxes[0]?.id;
      if (!boxId) return { erro: 'Nenhum caixa encontrado.' };

      const entries = await cashflowRepo.getEntries(args.year, args.month, boxId);
      return entries.slice(0, 20).map(e => ({
        data: e.date,
        descricao: e.description,
        tipo: e.type === 'income' ? 'Entrada' : 'Saida',
        valor: `R$ ${e.amount.toFixed(2)}`,
        categoria: e.categoryName,
        status: e.status
      }));
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

// --- LLM API Calls ---
async function callLlm(settings, messages, tools) {
  const { llmProvider, llmApiKey, llmModel, llmBaseUrl } = settings;

  if (llmProvider === 'groq') {
    const body = {
      model: llmModel || 'llama-3.3-70b-versatile',
      messages: formatMessagesForOpenAI(messages),
      max_tokens: 1024
    };
    if (tools.length > 0) body.tools = formatToolsForGroq(tools);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llmApiKey}` },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq API error ${res.status}`);
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

  const today = new Date().toISOString().split('T')[0];
  const messages = [
    {
      role: 'system',
      content: `${settings.systemPrompt}\n\nData de hoje: ${today}\nUsuario: ${user.name} (${user.role})\n\nSeja conciso nas respostas, formatando os dados de forma clara. Use no maximo 1000 caracteres por resposta.`
    },
    { role: 'user', content: messageText }
  ];

  const filesToSend = [];

  try {
    for (let i = 0; i < 5; i++) {
      const response = await callLlm(settings, messages, enabledTools);
      const toolCalls = extractToolCalls(response.provider, response);

      if (!toolCalls || toolCalls.length === 0) {
        const text = extractTextResponse(response.provider, response);
        return { text: text || 'Desculpe, nao consegui gerar uma resposta.', files: filesToSend };
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

    return { text: 'Desculpe, nao consegui processar sua solicitacao. Tente reformular.', files: filesToSend };
  } catch (err) {
    console.error(`${LOG_PREFIX} Error processing message:`, err);
    return { text: `Erro ao processar: ${err.message}`, files: [] };
  }
}

module.exports = {
  processMessage
};
