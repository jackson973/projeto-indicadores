const express = require('express');
const { authenticate, requireModule } = require('../middleware/auth');
const requireAdmin = requireModule('lojas');
const repo = require('../db/storesRepository');

const router = express.Router();
router.use(authenticate, requireAdmin);

// ── List all stores ───────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const stores = await repo.listStores();
    return res.json(stores);
  } catch (error) {
    console.error('[Stores] List error:', error);
    return res.status(500).json({ message: 'Erro ao buscar lojas.' });
  }
});

// ── Create store ──────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { name, platform, client_id, client_secret, access_token, refresh_token, platform_user_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Nome da loja é obrigatório.' });
    }
    if (!platform) {
      return res.status(400).json({ message: 'Plataforma é obrigatória.' });
    }

    const store = await repo.createStore({
      name: name.trim(),
      platform,
      client_id,
      client_secret,
      access_token,
      refresh_token,
      platform_user_id,
    });

    return res.status(201).json(store);
  } catch (error) {
    console.error('[Stores] Create error:', error);
    return res.status(500).json({ message: 'Erro ao criar loja.' });
  }
});

// ── Update store ──────────────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const { name, client_id, client_secret, access_token, refresh_token, platform_user_id } = req.body;

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ message: 'Nome da loja não pode ser vazio.' });
    }

    const store = await repo.updateStore(req.params.id, {
      name: name?.trim(),
      client_id,
      client_secret,
      access_token,
      refresh_token,
      platform_user_id,
    });

    if (!store) return res.status(404).json({ message: 'Loja não encontrada.' });
    return res.json(store);
  } catch (error) {
    console.error('[Stores] Update error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar loja.' });
  }
});

// ── Delete store ──────────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const result = await repo.deleteStore(req.params.id);
    if (!result) return res.status(404).json({ message: 'Loja não encontrada.' });
    return res.json({ success: true });
  } catch (error) {
    console.error('[Stores] Delete error:', error);
    return res.status(500).json({ message: 'Erro ao excluir loja.' });
  }
});

// ── Test connection ───────────────────────────────────────────────────────────
// Pings the platform API to verify credentials and fetches basic store info

router.post('/:id/test', async (req, res) => {
  try {
    const store = await repo.getStoreCredentials(req.params.id);
    if (!store) return res.status(404).json({ message: 'Loja não encontrada.' });

    if (store.platform === 'mercadolivre') {
      return await testMercadoLivre(store, res);
    }

    return res.status(400).json({ message: `Teste de conexão para "${store.platform}" ainda não implementado.` });
  } catch (error) {
    console.error('[Stores] Test error:', error);
    return res.status(500).json({ message: 'Erro ao testar conexão.' });
  }
});

async function testMercadoLivre(store, res) {
  if (!store.access_token) {
    return res.status(400).json({ message: 'Access token não configurado para esta loja.' });
  }

  const userId = store.platform_user_id;
  const url = userId
    ? `https://api.mercadolibre.com/users/${userId}`
    : 'https://api.mercadolibre.com/users/me';

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${store.access_token}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.message || `Erro ${response.status} ao conectar no Mercado Livre.`;

    await repo.updateStoreSync(store.id, {
      status: 'error',
      platform_seller_name: store.platform_seller_name,
      platform_user_id: store.platform_user_id,
      total_listings: store.total_listings,
      token_expires_at: store.token_expires_at,
    });

    return res.status(400).json({ message });
  }

  const userData = await response.json();

  // Fetch listing count
  let totalListings = store.total_listings || 0;
  try {
    const listingsUrl = `https://api.mercadolibre.com/users/${userData.id}/items/search?limit=1`;
    const listingsRes = await fetch(listingsUrl, {
      headers: { Authorization: `Bearer ${store.access_token}` },
    });
    if (listingsRes.ok) {
      const listingsData = await listingsRes.json();
      totalListings = listingsData.paging?.total || 0;
    }
  } catch {
    // Non-critical — keep existing count
  }

  const updated = await repo.updateStoreSync(store.id, {
    status: 'connected',
    platform_seller_name: userData.nickname || userData.first_name,
    platform_user_id: String(userData.id),
    total_listings: totalListings,
    // Preservar a expiração gravada no OAuth — zerar aqui quebrava o refresh proativo
    token_expires_at: store.token_expires_at,
  });

  return res.json({
    success: true,
    message: `Conectado como ${userData.nickname || userData.first_name} (${totalListings} anúncios)`,
    store: updated,
  });
}

// ── OAuth: get authorization URL ─────────────────────────────────────────────

router.get('/:id/oauth/url', async (req, res) => {
  try {
    const store = await repo.getStoreCredentials(req.params.id);
    if (!store) return res.status(404).json({ message: 'Loja não encontrada.' });
    if (!store.client_id) return res.status(400).json({ message: 'Client ID não configurado para esta loja.' });

    if (store.platform !== 'mercadolivre') {
      return res.status(400).json({ message: 'OAuth disponível apenas para Mercado Livre por enquanto.' });
    }

    const redirectUri = process.env.ML_REDIRECT_URI || 'https://httpbin.org/get';
    // read = leitura de anúncios/itens públicos (necessário para APIs de preço/busca)
    // write + offline_access = gerenciamento de itens e refresh token
    const scope = 'read write offline_access';
    const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${store.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

    return res.json({ url, redirect_uri: redirectUri });
  } catch (error) {
    console.error('[Stores] OAuth URL error:', error);
    return res.status(500).json({ message: 'Erro ao gerar URL de autorização.' });
  }
});

// ── OAuth: exchange code for tokens ──────────────────────────────────────────

router.post('/:id/oauth/exchange', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ message: 'Código de autorização é obrigatório.' });
    }

    const store = await repo.getStoreCredentials(req.params.id);
    if (!store) return res.status(404).json({ message: 'Loja não encontrada.' });
    if (!store.client_id || !store.client_secret) {
      return res.status(400).json({ message: 'Client ID e Client Secret precisam estar configurados.' });
    }

    if (store.platform !== 'mercadolivre') {
      return res.status(400).json({ message: 'OAuth disponível apenas para Mercado Livre por enquanto.' });
    }

    const redirectUri = process.env.ML_REDIRECT_URI || 'https://httpbin.org/get';

    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: store.client_id,
        client_secret: store.client_secret,
        code: code.trim(),
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      const msg = tokenData.error_description || tokenData.message || `Erro ${tokenRes.status} ao trocar código.`;
      return res.status(400).json({ message: msg });
    }

    // Mesma conta ML já conectada em outra loja? Autorizar de novo faria o ML
    // revogar os tokens da loja existente (uma autorização por app+usuário) —
    // as duas ficariam quebradas sem o usuário entender o motivo.
    if (tokenData.user_id) {
      const all = await repo.listStores();
      const conflict = all.find(s =>
        s.id !== store.id &&
        s.platform === 'mercadolivre' &&
        String(s.platform_user_id || '') === String(tokenData.user_id)
      );
      if (conflict) {
        return res.status(400).json({
          message: `Este código pertence à mesma conta do Mercado Livre já conectada na loja "${conflict.name}". ` +
            `Autorizar aqui desconectaria a outra loja. Saia da conta ML no navegador, entre na conta correta e gere um novo código.`,
        });
      }
    }

    // Calculate expiry (ML access token lasts 6h)
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000);

    const updated = await repo.updateStoreTokens(store.id, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
    });

    // Also save the user_id from the token response
    if (tokenData.user_id) {
      await repo.updateStore(store.id, { platform_user_id: String(tokenData.user_id) });
    }

    // Sem refresh_token a conexão expira em 6h — quase sempre é o scope
    // offline_access desabilitado no aplicativo do ML DevCenter.
    if (!tokenData.refresh_token) {
      return res.json({
        success: true,
        warning: true,
        message: 'Autorizado, mas o Mercado Livre NÃO devolveu refresh token — a conexão vai expirar em ~6 horas. ' +
          'Habilite o scope "offline_access" no aplicativo (DevCenter do ML) e autorize novamente.',
        store: updated,
      });
    }

    return res.json({
      success: true,
      message: 'Autorização concluída! Clique em "Testar" para verificar a conexão.',
      store: updated,
    });
  } catch (error) {
    console.error('[Stores] OAuth exchange error:', error);
    return res.status(500).json({ message: 'Erro ao trocar código por token.' });
  }
});

module.exports = router;
