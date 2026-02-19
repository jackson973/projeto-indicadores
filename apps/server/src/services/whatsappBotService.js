const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const whatsappRepo = require('../db/whatsappRepository');
const usersRepo = require('../db/usersRepository');
const { processMessage } = require('./whatsappLlmService');

const AUTH_DIR = path.join(__dirname, '..', '..', '.whatsapp-auth');
const LOG_PREFIX = '[WhatsApp Bot]';

// Module-level state
let sock = null;
let currentQr = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimer = null;

// SSE client management
const sseClients = [];

function addSseClient(res) {
  sseClients.push(res);
  console.log(`${LOG_PREFIX} SSE client connected (total: ${sseClients.length})`);
}

function removeSseClient(res) {
  const idx = sseClients.indexOf(res);
  if (idx !== -1) {
    sseClients.splice(idx, 1);
    console.log(`${LOG_PREFIX} SSE client disconnected (total: ${sseClients.length})`);
  }
}

function broadcastSse(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      // Client disconnected, will be cleaned up
    }
  }
}

// --- Connection Lifecycle ---
async function startWhatsappBot() {
  if (sock) {
    console.log(`${LOG_PREFIX} Already connected or connecting, skipping start.`);
    return;
  }

  const settings = await whatsappRepo.getSettings();
  if (!settings || !settings.active) {
    console.log(`${LOG_PREFIX} Bot is not active, skipping start.`);
    return;
  }

  connectionStatus = 'connecting';
  currentQr = null;
  broadcastSse('status', { status: 'connecting' });

  // Ensure auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`${LOG_PREFIX} Starting with Baileys v${version.join('.')}`);

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      defaultQueryTimeoutMs: undefined,
      getMessage: async () => undefined
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Connection status updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`${LOG_PREFIX} QR Code received`);
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          currentQr = qrDataUrl;
          broadcastSse('qr', { qr: qrDataUrl });
        } catch (err) {
          console.error(`${LOG_PREFIX} QR generation error:`, err);
        }
      }

      if (connection === 'open') {
        console.log(`${LOG_PREFIX} Connected!`);
        connectionStatus = 'connected';
        currentQr = null;
        reconnectAttempts = 0;

        const phone = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0] || '';
        await whatsappRepo.updateConnectionStatus(true, phone);
        broadcastSse('status', { status: 'connected', phone });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(`${LOG_PREFIX} Disconnected. Status code: ${statusCode}, Logged out: ${loggedOut}`);

        sock = null;
        connectionStatus = 'disconnected';
        currentQr = null;

        await whatsappRepo.updateConnectionStatus(false, null);
        broadcastSse('status', { status: 'disconnected' });

        if (loggedOut) {
          // Clear auth state on logout
          console.log(`${LOG_PREFIX} Logged out, clearing auth state.`);
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch { /* ignore */ }
        } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          // Attempt reconnect with exponential backoff
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          console.log(`${LOG_PREFIX} Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimer = setTimeout(() => startWhatsappBot(), delay);
        } else {
          console.log(`${LOG_PREFIX} Max reconnect attempts reached. Manual restart required.`);
        }
      }
    });

    // Message handling
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return;

      for (const msg of msgs) {
        // Skip own messages, status broadcasts, and protocol messages
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;
        if (!msg.message) continue;

        // Skip group messages
        if (msg.key.remoteJid.endsWith('@g.us')) continue;

        await handleIncomingMessage(msg);
      }
    });

  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to start:`, err);
    sock = null;
    connectionStatus = 'disconnected';
    broadcastSse('status', { status: 'disconnected', error: err.message });
  }
}

async function stopWhatsappBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect

  if (sock) {
    try {
      sock.end(undefined);
    } catch { /* ignore */ }
    sock = null;
  }

  connectionStatus = 'disconnected';
  currentQr = null;

  await whatsappRepo.updateConnectionStatus(false, null);
  broadcastSse('status', { status: 'disconnected' });
  console.log(`${LOG_PREFIX} Stopped.`);
}

async function restartWhatsappBot() {
  await stopWhatsappBot();
  reconnectAttempts = 0;
  await startWhatsappBot();
}

// --- Message Handler ---
async function handleIncomingMessage(msg) {
  const jid = msg.key.remoteJid;
  const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');

  console.log(`${LOG_PREFIX} Message from ${phone}`);

  try {
    // Check whitelist
    const user = await usersRepo.findByWhatsapp(phone);
    if (!user) {
      console.log(`${LOG_PREFIX} Unauthorized number: ${phone}`);
      await sock.sendMessage(jid, {
        text: 'Desculpe, seu numero nao esta autorizado a usar este servico. Contate o administrador.'
      });
      return;
    }

    // Extract message text
    const messageText = msg.message.conversation
      || msg.message.extendedTextMessage?.text
      || msg.message.imageMessage?.caption
      || '';

    if (!messageText.trim()) {
      await sock.sendMessage(jid, {
        text: 'Desculpe, por enquanto so consigo processar mensagens de texto.'
      });
      return;
    }

    // Get settings
    const settings = await whatsappRepo.getSettings();
    if (!settings || !settings.active) {
      return;
    }

    // Send typing indicator
    await sock.presenceSubscribe(jid);
    await sock.sendPresenceUpdate('composing', jid);

    // Process with LLM
    const result = await processMessage(messageText, user, settings);

    // Send text response
    if (result.text) {
      await sock.sendMessage(jid, { text: result.text });
    }

    // Send PDF files if any
    for (const file of result.files || []) {
      try {
        if (fs.existsSync(file.filePath)) {
          const fileBuffer = fs.readFileSync(file.filePath);
          await sock.sendMessage(jid, {
            document: fileBuffer,
            mimetype: 'application/pdf',
            fileName: file.fileName
          });
        }
      } catch (fileErr) {
        console.error(`${LOG_PREFIX} Error sending file:`, fileErr);
        await sock.sendMessage(jid, {
          text: `Erro ao enviar arquivo ${file.fileName}: ${fileErr.message}`
        });
      }
    }

    // Clear typing indicator
    await sock.sendPresenceUpdate('paused', jid);

    // Increment interactions
    await whatsappRepo.incrementInteractions();

  } catch (err) {
    console.error(`${LOG_PREFIX} Error handling message:`, err);
    try {
      await sock.sendMessage(jid, {
        text: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.'
      });
    } catch { /* ignore */ }
  }
}

// --- Exported API ---
function getStatus() {
  return {
    status: connectionStatus,
    qr: currentQr
  };
}

module.exports = {
  startWhatsappBot,
  stopWhatsappBot,
  restartWhatsappBot,
  getStatus,
  addSseClient,
  removeSseClient
};
