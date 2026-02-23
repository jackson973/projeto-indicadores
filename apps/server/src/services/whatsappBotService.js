// Baileys is ESM-only, use dynamic import (cached after first load)
let _baileys = null;
async function getBaileys() {
  if (!_baileys) {
    _baileys = await import('@whiskeysockets/baileys');
  }
  return _baileys;
}
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const whatsappRepo = require('../db/whatsappRepository');
const usersRepo = require('../db/usersRepository');
const { processMessage } = require('./whatsappLlmService');

const AUTH_DIR = path.join(__dirname, '..', '..', '.whatsapp-auth');
const LID_MAP_FILE = path.join(AUTH_DIR, 'lid-map.json');
const LOG_PREFIX = '[WhatsApp Bot]';

// Module-level state
let sock = null;
let currentQr = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimer = null;

// LID (Linked ID) to phone number mapping
// WhatsApp uses internal LIDs instead of phone numbers for privacy
const lidToPhoneMap = new Map();

function loadLidMap() {
  try {
    if (fs.existsSync(LID_MAP_FILE)) {
      const data = JSON.parse(fs.readFileSync(LID_MAP_FILE, 'utf8'));
      for (const [lid, phone] of Object.entries(data)) {
        lidToPhoneMap.set(lid, phone);
      }
      console.log(`${LOG_PREFIX} Loaded ${lidToPhoneMap.size} LID mappings from disk`);
    }
  } catch { /* ignore */ }
}

function saveLidMap() {
  try {
    const data = Object.fromEntries(lidToPhoneMap);
    fs.writeFileSync(LID_MAP_FILE, JSON.stringify(data, null, 2));
  } catch { /* ignore */ }
}

function storeLidMapping(lid, phone) {
  if (!lid || !phone) return;
  const cleanLid = lid.includes('@') ? lid : `${lid}@lid`;
  const cleanPhone = phone.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  if (lidToPhoneMap.get(cleanLid) !== cleanPhone) {
    lidToPhoneMap.set(cleanLid, cleanPhone);
    console.log(`${LOG_PREFIX} Stored LID mapping: ${cleanLid} -> ${cleanPhone}`);
    saveLidMap();
  }
}

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

  // Load persisted LID mappings
  loadLidMap();

  try {
    const baileys = await getBaileys();
    const { state, saveCreds } = await baileys.useMultiFileAuthState(AUTH_DIR);
    const { version } = await baileys.fetchLatestBaileysVersion();

    console.log(`${LOG_PREFIX} Starting with Baileys v${version.join('.')}`);

    sock = baileys.default({
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
        // Save phone to history
        await whatsappRepo.savePhone(phone);
        broadcastSse('status', { status: 'connected', phone });

        // Build LID-to-phone mapping for whitelisted users
        buildLidMapping().catch(err => {
          console.error(`${LOG_PREFIX} Error building LID mapping:`, err.message);
        });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const { DisconnectReason } = await getBaileys();
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

    // Capture LID mappings from contact updates
    sock.ev.on('contacts.update', (updates) => {
      for (const contact of updates) {
        // Contact may have both id (@lid) and notify/phone info
        if (contact.id && contact.id.endsWith('@lid') && contact.lid) {
          storeLidMapping(contact.id, contact.lid);
        }
      }
    });

    sock.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        if (contact.id && contact.id.endsWith('@lid') && contact.lid) {
          storeLidMapping(contact.id, contact.lid);
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

        // Capture LID mapping from message metadata if available
        if (msg.key.remoteJid?.endsWith('@lid') && msg.key.remoteJidAlt?.endsWith('@s.whatsapp.net')) {
          storeLidMapping(msg.key.remoteJid, msg.key.remoteJidAlt);
        }

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
      await sock.logout();
    } catch { /* ignore */ }
    try {
      sock.end(undefined);
    } catch { /* ignore */ }
    sock = null;
  }

  connectionStatus = 'disconnected';
  currentQr = null;

  // Clear auth state so next connect shows a fresh QR code
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch { /* ignore */ }

  await whatsappRepo.updateConnectionStatus(false, null);
  broadcastSse('status', { status: 'disconnected' });
  console.log(`${LOG_PREFIX} Stopped and cleared auth state.`);
}

async function restartWhatsappBot() {
  await stopWhatsappBot();
  reconnectAttempts = 0;
  await startWhatsappBot();
}

// --- LID Mapping ---
async function buildLidMapping() {
  const users = await usersRepo.findAll();
  const whatsappUsers = users.filter(u => u.whatsapp && u.active);

  console.log(`${LOG_PREFIX} Building LID mapping for ${whatsappUsers.length} whitelisted users...`);

  for (const user of whatsappUsers) {
    const digits = user.whatsapp.replace(/\D/g, '');
    const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
    try {
      const results = await sock.onWhatsApp(`${fullNumber}@s.whatsapp.net`);
      console.log(`${LOG_PREFIX} onWhatsApp(${fullNumber}):`, JSON.stringify(results));
      if (results?.[0]?.exists) {
        // Store mapping using the LID (used for incoming messages)
        if (results[0].lid) {
          storeLidMapping(results[0].lid, fullNumber);
        }
        // Also store by phone JID (some messages may use @s.whatsapp.net)
        if (results[0].jid) {
          storeLidMapping(results[0].jid, fullNumber);
        }
      }
    } catch (err) {
      console.log(`${LOG_PREFIX} Could not resolve ${fullNumber}: ${err.message}`);
    }
  }
  console.log(`${LOG_PREFIX} LID mapping complete: ${lidToPhoneMap.size} entries`);
}

// Resolve a JID (LID or phone) to a phone number for whitelist lookup
function resolvePhone(msg) {
  const jid = msg.key.remoteJid;

  // 1. Standard @s.whatsapp.net format - phone number is in the JID
  if (jid.endsWith('@s.whatsapp.net')) {
    return jid.replace('@s.whatsapp.net', '');
  }

  // 2. LID format - try multiple resolution strategies
  if (jid.endsWith('@lid')) {
    // Strategy A: Check remoteJidAlt (Baileys v6.7+ may include phone JID here)
    if (msg.key.remoteJidAlt?.endsWith('@s.whatsapp.net')) {
      return msg.key.remoteJidAlt.replace('@s.whatsapp.net', '');
    }

    // Strategy B: Check participantAlt (sometimes available)
    if (msg.key.participantAlt?.endsWith('@s.whatsapp.net')) {
      return msg.key.participantAlt.replace('@s.whatsapp.net', '');
    }

    // Strategy C: Use our persisted LID-to-phone map
    const mapped = lidToPhoneMap.get(jid);
    if (mapped) {
      return mapped;
    }

    // Strategy D: Check if signalRepository has the mapping (Baileys internal)
    try {
      if (sock?.authState?.keys?.get) {
        // Some Baileys versions store LID mappings in auth state
      }
    } catch { /* ignore */ }
  }

  // Fallback: strip suffix
  return jid.replace('@lid', '').replace('@s.whatsapp.net', '');
}

// --- Message Handler ---
async function handleIncomingMessage(msg) {
  const jid = msg.key.remoteJid;
  const phone = resolvePhone(msg);

  // Debug: log full key to help diagnose LID issues
  if (jid.endsWith('@lid')) {
    console.log(`${LOG_PREFIX} LID message key:`, JSON.stringify(msg.key));
  }

  console.log(`${LOG_PREFIX} Message from ${phone} (jid: ${jid})`);

  try {
    // Check whitelist - silently ignore non-whitelisted numbers
    const user = await usersRepo.findByWhatsapp(phone);
    if (!user) {
      console.log(`${LOG_PREFIX} Ignoring message from non-whitelisted number: ${phone}`);
      return;
    }

    // If this was a LID and we found the user, store the mapping for next time
    if (jid.endsWith('@lid') && user.whatsapp) {
      const userDigits = user.whatsapp.replace(/\D/g, '');
      const userFull = userDigits.startsWith('55') ? userDigits : `55${userDigits}`;
      storeLidMapping(jid, userFull);
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
