const db = require('../db/connection');
const cashflowRepo = require('../db/cashflowRepository');
const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[WhatsApp LLM]';

// --- Conversation File Logger ---
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = () => {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return path.join(LOG_DIR, `llm-${d}.log`);
};

function logConversation({ user, question, toolCalls, response, error }) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const lines = [`\n[${ now }] Usuario: ${user}`, `Pergunta: ${question}`];

    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        lines.push(`Tool: ${tc.name}`);
        if (tc.sql) lines.push(`SQL: ${tc.sql}`);
        if (tc.args) lines.push(`Args: ${JSON.stringify(tc.args)}`);
        if (tc.rowCount !== undefined) lines.push(`Linhas retornadas: ${tc.rowCount}`);
        if (tc.error) lines.push(`Erro: ${tc.error}`);
      }
    }

    if (response) lines.push(`Resposta: ${response}`);
    if (error) lines.push(`ERRO: ${error}`);
    lines.push('---');

    fs.appendFileSync(LOG_FILE(), lines.join('\n') + '\n', 'utf8');
  } catch (e) {
    console.error(`${LOG_PREFIX} Failed to write log:`, e.message);
  }
}

// --- Conversation History (in-memory, per user) ---
const HISTORY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY_TURNS = 6; // keep last 6 user+assistant pairs
const conversationHistory = new Map(); // userId -> { messages: [], lastActivity: Date, lastQueryContext: string|null }

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

function getLastQueryContext(userId) {
  const entry = conversationHistory.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.lastActivity > HISTORY_TTL_MS) return null;
  return entry.lastQueryContext || null;
}

function saveLastQueryContext(userId, userQuestion, queryResult) {
  let entry = conversationHistory.get(userId);
  if (!entry) {
    entry = { messages: [], lastActivity: Date.now(), lastQueryContext: null };
    conversationHistory.set(userId, entry);
  }

  if (!queryResult || !queryResult.dados || queryResult.dados.length === 0) {
    entry.lastQueryContext = null;
    return;
  }

  const rows = queryResult.dados.slice(0, 15); // max 15 rows for context
  const keys = Object.keys(rows[0]);

  // Build compact readable summary — truncate long values
  const lines = rows.map(row => {
    return keys.map(k => {
      let v = row[k];
      if (v === null || v === undefined) return null;
      v = String(v);
      if (v.length > 60) v = v.slice(0, 57) + '...';
      return `${k}: ${v}`;
    }).filter(Boolean).join(', ');
  });

  const totalRows = queryResult.linhas || rows.length;
  const summary = lines.join('\n');
  // Cap total context to ~2500 chars to avoid bloating system prompt
  entry.lastQueryContext = `Pergunta: "${userQuestion}"\nResultado (${totalRows} linhas):\n${summary.slice(0, 2500)}`;
}

function saveHistory(userId, userMsg, assistantMsg) {
  let entry = conversationHistory.get(userId);
  if (!entry) {
    entry = { messages: [], lastActivity: Date.now(), lastQueryContext: null };
    conversationHistory.set(userId, entry);
  }
  entry.messages.push({ role: 'user', content: userMsg });
  // Only save the natural language response — raw tool data in history
  // confuses Groq/Llama into regurgitating JSON instead of calling tools
  entry.messages.push({ role: 'assistant', content: assistantMsg });
  entry.lastActivity = Date.now();
  while (entry.messages.length > MAX_HISTORY_TURNS * 2) {
    entry.messages.shift();
    entry.messages.shift();
  }
}

// --- Database Schema for LLM ---
const DB_SCHEMA = `
SCHEMA DO BANCO (PostgreSQL):

Tabela: sales (vendas - cada linha e um item de pedido)
  order_id VARCHAR - codigo do pedido
  date TIMESTAMP - data da venda
  store VARCHAR - nome da loja
  product VARCHAR - nome do produto
  ad_name VARCHAR - nome do anuncio
  variation VARCHAR - variacao (cor, tamanho, etc)
  sku VARCHAR - codigo SKU
  quantity NUMERIC - quantidade vendida
  total NUMERIC - valor total do item
  unit_price NUMERIC - preco unitario
  state VARCHAR - estado/UF (ex: SP, RJ, MG)
  platform VARCHAR - plataforma (Mercado Livre, Shopee, Shein, TikTok, Sisplan)
  status VARCHAR - status (vazio=ativo, contendo "cancelado"/"para devolver"/"pos-venda"=cancelado)
  cancel_reason TEXT - motivo do cancelamento
  cancel_by VARCHAR - cancelado por quem
  client_name VARCHAR - nome do cliente
  codcli VARCHAR - codigo do cliente
  nome_fantasia VARCHAR - nome fantasia do cliente
  cnpj_cpf VARCHAR - CPF ou CNPJ
  sale_channel VARCHAR - canal (online, sisplan)

Tabela: cashflow_entries (lancamentos financeiros)
  date DATE - data do lancamento
  category_id BIGINT - FK para cashflow_categories
  description VARCHAR - descricao
  type VARCHAR - 'income' ou 'expense'
  amount NUMERIC - valor
  status VARCHAR - 'ok' ou 'pending'
  box_id BIGINT - FK para cashflow_boxes

Tabela: cashflow_categories (categorias)
  id BIGINT, name VARCHAR, preset BOOLEAN, active BOOLEAN

Tabela: cashflow_boxes (caixas)
  id BIGINT, name VARCHAR, active BOOLEAN

REGRAS OBRIGATORIAS DE SQL:

1. DATAS: O campo "date" e TIMESTAMP. SEMPRE use date::date para comparar datas.
   CORRETO: WHERE date::date = '2026-02-18'
   CORRETO: WHERE date::date BETWEEN '2026-02-01' AND '2026-02-28'
   ERRADO:  WHERE date = '2026-02-18' (NAO funciona com timestamp!)

2. CANCELADOS: Um pedido e cancelado quando status contem 'cancelado', 'para devolver' ou 'pos-venda'.
   Para EXCLUIR cancelados (so vendas ativas):
   WHERE (status IS NULL OR status = '' OR (LOWER(status) NOT LIKE '%cancelado%' AND LOWER(status) NOT LIKE '%devolver%' AND LOWER(status) NOT LIKE '%pos-venda%'))
   IMPORTANTE: SEMPRE envolva a condicao de status em parenteses!

3. PEDIDOS: Um pedido (order_id) pode ter VARIOS itens (linhas).
   Para contar pedidos unicos: COUNT(DISTINCT order_id)
   Para receita total: SUM(total)

4. PARENTESES: Quando combinar AND com OR, SEMPRE use parenteses explicitos.
   CORRETO: WHERE date::date = '2026-02-18' AND (status IS NULL OR status = '')
   ERRADO:  WHERE date::date = '2026-02-18' AND status IS NULL OR status = ''

5. BUSCA TEXTUAL: Use ILIKE com %termo% para busca case-insensitive.

6. DATAS RELATIVAS: Para "ate agora", "ate hoje", "neste mes", use a data de hoje fornecida acima.
   NUNCA use 2026-02-29 — fevereiro de 2026 tem 28 dias (NAO e ano bissexto).
   Para "este mes": BETWEEN '2026-02-01' AND a data de hoje.
   Para "mes passado inteiro": BETWEEN '2026-01-01' AND '2026-01-31'.

8. AGREGACAO: O resultado e limitado a 200 linhas. NUNCA some ou conte linhas manualmente.
   Para totais, SEMPRE use funcoes SQL: SUM(total), COUNT(*), COUNT(DISTINCT order_id), AVG(total).
   ERRADO: SELECT * FROM sales WHERE ... (e depois tentar somar na resposta)
   CORRETO: SELECT COUNT(DISTINCT order_id) as pedidos, SUM(total) as receita FROM sales WHERE ...
   Se o usuario pedir detalhes E totais, faca DUAS consultas: uma com agregacao e outra com detalhes.

9. LOJAS: O campo store contem o nome da loja COM a plataforma entre parenteses.
   Exemplos reais: "Kids 2 (Shopee)", "Kids Dois (Shein)", "Pula Pula Pipoquinha Moda Kids (Mercado Livre)".
   NUNCA use igualdade exata (store = 'nome'). O usuario nunca digita o nome completo.
   Quando o usuario mencionar uma loja, PRIMEIRO faca uma consulta para descobrir o nome exato:
     SELECT DISTINCT store FROM sales WHERE store ILIKE '%termo%'
   - Se retornar 1 loja: use o nome exato retornado na consulta seguinte.
   - Se retornar varias lojas: pergunte ao usuario qual loja ele quer e liste as opcoes.
   - Se retornar 0: informe que nao encontrou loja com esse nome.

EXEMPLOS DE QUERIES:
-- Vendas ativas de uma data:
SELECT order_id, client_name, product, total FROM sales WHERE date::date = '2026-02-18' AND (status IS NULL OR status = '' OR (LOWER(status) NOT LIKE '%cancelado%' AND LOWER(status) NOT LIKE '%devolver%' AND LOWER(status) NOT LIKE '%pos-venda%'))

-- Top 10 produtos mais vendidos:
SELECT product, SUM(quantity) as qtd, SUM(total) as receita FROM sales WHERE date::date BETWEEN '2026-01-01' AND '2026-01-31' AND (status IS NULL OR status = '' OR (LOWER(status) NOT LIKE '%cancelado%' AND LOWER(status) NOT LIKE '%devolver%' AND LOWER(status) NOT LIKE '%pos-venda%')) GROUP BY product ORDER BY receita DESC LIMIT 10

-- Buscar cliente por nome:
SELECT DISTINCT client_name, nome_fantasia, cnpj_cpf FROM sales WHERE client_name ILIKE '%termo%' OR nome_fantasia ILIKE '%termo%'
`.trim();

// --- SQL Validation ---
const ALLOWED_TABLES = ['sales', 'cashflow_entries', 'cashflow_categories', 'cashflow_boxes', 'cashflow_balances'];
const FORBIDDEN_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|EXEC)\b/i,
  /\b(INTO)\s+\w/i,
  /;\s*\w/i, // multiple statements
  /--/,       // SQL comments (possible injection)
  /\/\*/      // block comments
];
const MAX_ROWS = 200;
const QUERY_TIMEOUT_MS = 5000;

function validateSql(sql) {
  const trimmed = sql.trim().replace(/;+$/, '');

  // Must start with SELECT or WITH (CTE)
  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    return { valid: false, error: 'Apenas consultas SELECT sao permitidas.' };
  }

  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: `Consulta contem operacao nao permitida.` };
    }
  }

  // Extract CTE aliases (WITH name AS ...)
  const cteNames = (trimmed.match(/\bWITH\s+(\w+)\s+AS\b/gi) || [])
    .map(m => m.replace(/^WITH\s+/i, '').replace(/\s+AS$/i, '').toLowerCase());

  // Check that only allowed tables are referenced (simple heuristic)
  const allowedWithCtes = [...ALLOWED_TABLES, ...cteNames];
  const fromMatches = trimmed.match(/\b(?:FROM|JOIN)\s+(\w+)/gi) || [];
  for (const match of fromMatches) {
    const tableName = match.replace(/^(FROM|JOIN)\s+/i, '').toLowerCase();
    if (!allowedWithCtes.includes(tableName)) {
      return { valid: false, error: `Tabela "${tableName}" nao permitida. Tabelas disponiveis: ${ALLOWED_TABLES.join(', ')}` };
    }
  }

  // Add LIMIT if not present
  let finalSql = trimmed;
  if (!/\bLIMIT\s+\d+/i.test(finalSql)) {
    finalSql += ` LIMIT ${MAX_ROWS}`;
  } else {
    // Enforce max LIMIT
    finalSql = finalSql.replace(/\bLIMIT\s+(\d+)/i, (match, n) => {
      return `LIMIT ${Math.min(parseInt(n), MAX_ROWS)}`;
    });
  }

  return { valid: true, sql: finalSql };
}

async function executeReadOnlyQuery(sql) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${QUERY_TIMEOUT_MS}'`);
    const result = await client.query(sql);
    await client.query('COMMIT');
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// --- Tool Definitions ---
const TOOL_DEFINITIONS = {
  query_database: {
    description: `Executar consulta SQL SELECT no banco de dados para responder perguntas sobre vendas, clientes, produtos, financeiro, etc. Voce tem acesso total de leitura aos dados. Escreva a query SQL baseado no schema fornecido no contexto. SEMPRE use esta ferramenta para qualquer pergunta sobre dados - NUNCA responda sobre dados sem consultar primeiro.`,
    parameters: {
      sql: { type: 'string', description: 'Consulta SQL SELECT. Apenas SELECT permitido. Max 50 linhas retornadas.' },
      description: { type: 'string', description: 'Breve descricao do que a query faz (para log)' }
    },
    required: ['sql'],
    requiredFeature: 'featureSales'
  },
  get_cashflow_summary: {
    description: 'Resumo do fluxo de caixa com saldo calculado: entradas, saidas, saldo inicial e final. Pode listar lancamentos individuais.',
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
    case 'query_database': {
      const validation = validateSql(args.sql);
      if (!validation.valid) {
        return { erro: validation.error };
      }

      console.log(`${LOG_PREFIX} SQL: ${validation.sql}`);
      try {
        const result = await executeReadOnlyQuery(validation.sql);
        // Format results for the LLM
        if (result.rowCount === 0) {
          return { resultado: 'Nenhum registro encontrado.', linhas: 0 };
        }

        // For small result sets, return all data
        const rows = result.rows.map(row => {
          // Convert numeric strings and format dates
          const formatted = {};
          for (const [key, value] of Object.entries(row)) {
            if (value instanceof Date) {
              formatted[key] = value.toLocaleDateString('pt-BR');
            } else if (value !== null && value !== undefined) {
              formatted[key] = value;
            }
          }
          return formatted;
        });

        const response = {
          linhas: result.rowCount,
          dados: rows
        };

        // Warn LLM when results are truncated by LIMIT
        if (result.rowCount >= MAX_ROWS) {
          response.aviso = `ATENCAO: Resultado limitado a ${MAX_ROWS} linhas. Os dados estao INCOMPLETOS. Para totais precisos, use funcoes de agregacao: SUM(total), COUNT(*), COUNT(DISTINCT order_id).`;
        }

        return response;
      } catch (error) {
        console.error(`${LOG_PREFIX} SQL error:`, error.message);
        if (error.message.includes('statement timeout')) {
          return { erro: 'Consulta muito lenta (timeout de 5s). Tente simplificar.' };
        }
        return { erro: `Erro na consulta: ${error.message}` };
      }
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
function parseFailedToolCall(failedGeneration) {
  if (!failedGeneration) return null;

  const strategies = [
    // Strategy 1: <function=name>JSON</function>
    (text) => {
      const m = text.match(/<function=(\w+)[^a-zA-Z0-9]([\s\S]*?)<\/function>/);
      if (!m) return null;
      let jsonStr = m[2].trim();
      if (!jsonStr.startsWith('{') && jsonStr.startsWith('(')) jsonStr = jsonStr.slice(1);
      if (jsonStr.endsWith(')')) jsonStr = jsonStr.slice(0, -1).trim();
      return { name: m[1], arguments: JSON.parse(jsonStr) };
    },
    // Strategy 2: <function=name> followed by JSON somewhere
    (text) => {
      const m = text.match(/<function=(\w+)/);
      if (!m) return null;
      const after = text.slice(m.index + m[0].length);
      const jsonMatch = after.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return { name: m[1], arguments: JSON.parse(jsonMatch[0]) };
    },
    // Strategy 3: JSON with "name" and "arguments"/"parameters" keys
    (text) => {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const obj = JSON.parse(jsonMatch[0]);
      if (obj.name && (obj.arguments || obj.parameters)) {
        return { name: obj.name, arguments: obj.arguments || obj.parameters };
      }
      return null;
    },
    // Strategy 4: tool name mentioned + JSON with sql key (most common case)
    (text) => {
      const nameMatch = text.match(/query_database|get_cashflow_summary|find_boleto|find_nota_fiscal/);
      if (!nameMatch) return null;
      const jsonMatch = text.match(/\{[\s\S]*"sql"[\s\S]*\}/);
      if (!jsonMatch) return null;
      return { name: nameMatch[0], arguments: JSON.parse(jsonMatch[0]) };
    }
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy(failedGeneration);
      if (result) return result;
    } catch (_) { /* try next strategy */ }
  }

  console.warn(`${LOG_PREFIX} Could not parse failed_generation:`, failedGeneration.slice(0, 300));
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
      // Handle Groq tool call failures (malformed tool calls from Llama)
      if (errMsg.includes('Failed to call a function') || errMsg.includes('tool call validation failed')) {
        const failedGen = err.error?.failed_generation || '';
        logConversation({ user: 'SYSTEM', question: '[Groq tool call failed]', toolCalls: [{ name: 'failed_generation', args: { raw: (failedGen || errMsg).slice(0, 1000) } }] });
        const parsed = parseFailedToolCall(failedGen);
        if (parsed) {
          // Fix common Llama issue: object values instead of strings
          if (parsed.arguments) {
            for (const [k, v] of Object.entries(parsed.arguments)) {
              if (typeof v === 'object' && v !== null) {
                parsed.arguments[k] = v.value || v.text || JSON.stringify(v);
              }
            }
          }
          console.log(`${LOG_PREFIX} Recovered tool call: ${parsed.name}`);
          return {
            provider: 'groq',
            recoveredToolCall: parsed,
            data: { choices: [{ message: { content: null, tool_calls: [{
              id: `recovered_${Date.now()}`,
              function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments) }
            }] } }] }
          };
        }
        console.warn(`${LOG_PREFIX} Could not recover tool call.`);
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

// Detect SQL in text response (LLM wrote SQL instead of calling tool)
// When multiple SQL blocks exist, pick the last one (usually the most complete)
function extractSqlFromText(text) {
  if (!text) return null;
  const allBlocks = [...text.matchAll(/```(?:sql)?\s*\n?([\s\S]*?)```/gi)];
  if (allBlocks.length === 0) return null;
  // Iterate from last to first, return the first valid SELECT
  for (let i = allBlocks.length - 1; i >= 0; i--) {
    const sql = allBlocks[i][1].trim();
    if (/^\s*(SELECT|WITH)\b/i.test(sql)) return sql;
  }
  return null;
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

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const systemMessage = {
    role: 'system',
    content: `${settings.systemPrompt}

Data de hoje: ${today}
Usuario: ${user.name} (${user.role})

${DB_SCHEMA}

Regras OBRIGATORIAS:
- SEMPRE use a ferramenta query_database para responder QUALQUER pergunta sobre dados, vendas, clientes, produtos, financeiro. NUNCA invente dados. NUNCA responda sobre dados de memoria ou contexto anterior sem consultar o banco. Mesmo que voce ache que sabe a resposta, SEMPRE consulte o banco.
- NUNCA escreva SQL na resposta ao usuario. NUNCA mostre codigo SQL. SEMPRE use a ferramenta query_database para executar consultas.
- NUNCA diga "vou consultar" ou "aguarde". Execute a ferramenta diretamente e responda com os dados.
- Se um campo esta vazio ou NULL no resultado, diga "nao informado" ou "nao disponivel".
- Se a consulta retornar 0 resultados, diga claramente que nao encontrou.
- Voce pode fazer varias consultas em sequencia se precisar.
- Seja conciso, maximo 1500 caracteres por resposta.
- Formate valores monetarios com R$ e duas casas decimais.
- Para listar pedidos, mostre: numero, data, loja, cliente, valor e produtos.
- Para resumos, mostre: periodo, total de pedidos, receita e ticket medio.
- REFERENCIAS CONTEXTUAIS: Quando o usuario usar "esses", "estes", "aqueles", "eles", "deles", "os mesmos" referindo-se a dados de uma consulta anterior, use o CONTEXTO DA CONSULTA ANTERIOR (fornecido abaixo) para filtrar com precisao. Exemplo: se a consulta anterior listou 10 clientes com cnpj_cpf, e o usuario perguntar "quanto esses compraram", use WHERE cnpj_cpf IN ('valor1', 'valor2', ...) para filtrar apenas esses registros.`
  };

  // Inject last query context so LLM can resolve references like "esses clientes"
  const lastCtx = getLastQueryContext(user.id);
  if (lastCtx) {
    systemMessage.content += `\n\nCONTEXTO DA CONSULTA ANTERIOR (use para referencias como "esses", "estes", "aqueles"):\n${lastCtx}`;
  }

  const history = getHistory(user.id);
  const messages = [
    systemMessage,
    ...history,
    { role: 'user', content: messageText }
  ];

  const filesToSend = [];
  const loggedTools = []; // collect tool calls for file log

  try {
    for (let i = 0; i < 5; i++) {
      const response = await callLlm(settings, messages, enabledTools);
      const toolCalls = extractToolCalls(response.provider, response);

      if (!toolCalls || toolCalls.length === 0) {
        const text = extractTextResponse(response.provider, response);

        // Detect SQL written as text instead of tool call — auto-execute it
        const embeddedSql = extractSqlFromText(text);
        if (embeddedSql && i < 4) {
          console.log(`${LOG_PREFIX} Detected SQL in text response, auto-executing...`);
          loggedTools.push({ name: 'query_database (auto-recovered)', sql: embeddedSql });
          const validation = validateSql(embeddedSql);
          if (validation.valid) {
            try {
              const result = await executeReadOnlyQuery(validation.sql);
              const toolResult = result.rowCount === 0
                ? { resultado: 'Nenhum registro encontrado.', linhas: 0 }
                : { linhas: result.rowCount, dados: result.rows };
              // Save context for follow-up references
              if (toolResult.dados) {
                saveLastQueryContext(user.id, messageText, toolResult);
              }
              // Feed result back to LLM for natural language response
              messages.push({ role: 'assistant', content: text });
              messages.push({ role: 'user', content: `Resultado da consulta SQL: ${JSON.stringify(toolResult).slice(0, 3000)}\n\nAgora responda ao usuario com base nesses dados. NAO mostre SQL.` });
              continue; // next iteration will get the natural language answer
            } catch (e) {
              console.error(`${LOG_PREFIX} Auto-execute SQL failed:`, e.message);
            }
          }
        }

        const finalText = text || 'Desculpe, nao consegui gerar uma resposta.';
        saveHistory(user.id, messageText, finalText);
        logConversation({ user: user.name, question: messageText, toolCalls: loggedTools, response: finalText });
        return { text: finalText, files: filesToSend };
      }

      const results = [];
      for (const tc of toolCalls) {
        const result = await executeTool(tc.name, tc.arguments, settings);
        results.push(result);

        // Save last query context for follow-up references ("esses clientes", etc.)
        if (tc.name === 'query_database' && result.dados) {
          saveLastQueryContext(user.id, messageText, result);
        }

        // Collect for file log
        const logEntry = { name: tc.name, args: tc.arguments };
        if (tc.name === 'query_database') {
          logEntry.sql = tc.arguments.sql;
          logEntry.rowCount = result.linhas ?? result.erro ? 0 : undefined;
          if (result.erro) logEntry.error = result.erro;
        }
        loggedTools.push(logEntry);

        if ((tc.name === 'find_boleto' || tc.name === 'find_nota_fiscal') && result.found && result.files) {
          filesToSend.push(...result.files);
        }
      }

      appendAssistantMessage(response.provider, messages, response);
      appendToolResults(response.provider, messages, toolCalls, results);
    }

    const fallback = 'Desculpe, nao consegui processar sua solicitacao. Tente reformular.';
    saveHistory(user.id, messageText, fallback);
    logConversation({ user: user.name, question: messageText, toolCalls: loggedTools, response: fallback });
    return { text: fallback, files: filesToSend };
  } catch (err) {
    console.error(`${LOG_PREFIX} Error processing message:`, err);
    logConversation({ user: user.name, question: messageText, toolCalls: loggedTools, error: err.message });
    return { text: `Erro ao processar: ${err.message}`, files: [] };
  }
}

module.exports = {
  processMessage,
  // Exported for testing
  validateSql,
  DB_SCHEMA
};
