const express = require('express');
const jwt = require('jsonwebtoken');
const { authenticate, requireAdmin } = require('../middleware/auth');
const whatsappRepo = require('../db/whatsappRepository');
const {
  startWhatsappBot, stopWhatsappBot, restartWhatsappBot,
  getStatus, addSseClient, removeSseClient
} = require('../services/whatsappBotService');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const router = express.Router();

// GET /api/whatsapp/events - SSE stream para QR code e status em tempo real
// Definido ANTES do middleware authenticate pois EventSource não suporta headers
// Auth via query param token
router.get('/events', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ message: 'Token não fornecido.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ message: 'Acesso restrito.' });
    }
  } catch {
    return res.status(401).json({ message: 'Token inválido.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send current status immediately
  const currentStatus = getStatus();
  res.write(`event: status\ndata: ${JSON.stringify({ status: currentStatus.status })}\n\n`);
  if (currentStatus.qr) {
    res.write(`event: qr\ndata: ${JSON.stringify({ qr: currentStatus.qr })}\n\n`);
  }

  addSseClient(res);

  req.on('close', () => {
    removeSseClient(res);
  });
});

// All routes below require JWT auth + admin role
router.use(authenticate, requireAdmin);

// GET /api/whatsapp - Retorna configurações (API key mascarada)
router.get('/', async (req, res) => {
  try {
    const settings = await whatsappRepo.getSettings();
    if (!settings) {
      return res.json({ active: false });
    }

    return res.json({
      ...settings,
      llmApiKey: settings.llmApiKey ? '********' : ''
    });
  } catch (error) {
    console.error('Get whatsapp settings error:', error);
    return res.status(500).json({ message: 'Erro ao buscar configurações.' });
  }
});

// PUT /api/whatsapp - Salvar configurações
router.put('/', async (req, res) => {
  try {
    const {
      active, llmProvider, llmApiKey, llmModel, llmBaseUrl,
      systemPrompt, featureSales, featureCashflow, featureBoleto, featureNf,
      boletoPath, nfPath
    } = req.body;

    const result = await whatsappRepo.updateSettings({
      active: active || false,
      llmProvider: (llmProvider || 'groq').trim(),
      llmApiKey: llmApiKey || '',
      llmModel: (llmModel || '').trim(),
      llmBaseUrl: (llmBaseUrl || '').trim(),
      systemPrompt: (systemPrompt || '').trim(),
      featureSales,
      featureCashflow,
      featureBoleto,
      featureNf,
      boletoPath: (boletoPath || '').trim(),
      nfPath: (nfPath || '').trim()
    });

    return res.json(result);
  } catch (error) {
    console.error('Update whatsapp settings error:', error);
    return res.status(500).json({ message: 'Erro ao salvar configurações.' });
  }
});

// POST /api/whatsapp/test-llm - Testar conexão com a LLM
router.post('/test-llm', async (req, res) => {
  try {
    const { llmProvider, llmApiKey, llmModel, llmBaseUrl } = req.body;

    if (!llmProvider) {
      return res.status(400).json({ message: 'Selecione um provedor de LLM.' });
    }

    // Buscar API key real se estiver mascarada
    let realApiKey = llmApiKey;
    if (llmApiKey === '********') {
      const settings = await whatsappRepo.getSettings();
      realApiKey = settings?.llmApiKey || '';
    }

    if (llmProvider !== 'ollama' && !realApiKey) {
      return res.status(400).json({ message: 'Informe a API Key.' });
    }

    let response;
    const testMessage = 'Responda apenas: "Conexão OK! Estou funcionando."';

    if (llmProvider === 'groq') {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${realApiKey}`
        },
        body: JSON.stringify({
          model: llmModel || 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: testMessage }],
          max_tokens: 50
        })
      });
    } else if (llmProvider === 'claude') {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': realApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: llmModel || 'claude-sonnet-4-5-20250929',
          max_tokens: 50,
          messages: [{ role: 'user', content: testMessage }]
        })
      });
    } else if (llmProvider === 'ollama') {
      const baseUrl = llmBaseUrl || 'http://localhost:11434';
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: llmModel || 'llama3.1',
          messages: [{ role: 'user', content: testMessage }],
          stream: false
        })
      });
    } else {
      return res.status(400).json({ message: 'Provedor não suportado.' });
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Erro HTTP ${response.status}`);
    }

    const data = await response.json();

    let llmResponse = '';
    if (llmProvider === 'claude') {
      llmResponse = data.content?.[0]?.text || '';
    } else if (llmProvider === 'ollama') {
      llmResponse = data.message?.content || '';
    } else {
      llmResponse = data.choices?.[0]?.message?.content || '';
    }

    return res.json({
      success: true,
      message: 'LLM conectada com sucesso!',
      response: llmResponse
    });
  } catch (error) {
    console.error('Test LLM error:', error);
    return res.status(400).json({
      success: false,
      message: `Falha na conexão: ${error.message}`
    });
  }
});

// POST /api/whatsapp/connect - Iniciar conexão do bot
router.post('/connect', async (req, res) => {
  try {
    await startWhatsappBot();
    res.json({ success: true, message: 'Conexão iniciada. Aguarde o QR Code.' });
  } catch (error) {
    console.error('WhatsApp connect error:', error);
    res.status(500).json({ message: `Erro ao conectar: ${error.message}` });
  }
});

// POST /api/whatsapp/disconnect - Desconectar bot
router.post('/disconnect', async (req, res) => {
  try {
    await stopWhatsappBot();
    res.json({ success: true, message: 'Desconectado com sucesso.' });
  } catch (error) {
    console.error('WhatsApp disconnect error:', error);
    res.status(500).json({ message: `Erro ao desconectar: ${error.message}` });
  }
});

module.exports = router;
