const storesRepo = require('../db/storesRepository');

// Refresh proactively if token expires within 5 minutes
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Exchange a refresh_token for a new access_token.
 * Updates the DB and returns the new access_token.
 *
 * @param {object} store - result of storesRepo.getStoreCredentials()
 */
async function refreshMlToken(store) {
  if (!store.client_id || !store.client_secret) {
    throw new Error(`[ML Token] Store ${store.id}: client_id/client_secret not set — cannot refresh`);
  }
  if (!store.refresh_token) {
    throw new Error(`[ML Token] Store ${store.id}: no refresh_token — user must re-authorize`);
  }

  console.log(`[ML Token] Refreshing token for store ${store.id} (${store.name})...`);

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     store.client_id,
      client_secret: store.client_secret,
      refresh_token: store.refresh_token,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data.error_description || data.message || `HTTP ${res.status}`;
    throw new Error(`[ML Token] Refresh failed for store ${store.id}: ${msg}`);
  }

  const expiresAt = new Date(Date.now() + (data.expires_in || 21600) * 1000);

  await storesRepo.updateStoreTokens(store.id, {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    token_expires_at: expiresAt,
  });

  console.log(`[ML Token] Token refreshed for store ${store.id} — expires ${expiresAt.toISOString()}`);
  return data.access_token;
}

/**
 * Returns a valid access_token for the given store, refreshing if needed.
 * Pass the store object already loaded via storesRepo.getStoreCredentials().
 *
 * @param {object} store - result of storesRepo.getStoreCredentials()
 * @returns {Promise<string>} valid access_token
 */
async function getValidMlToken(store) {
  if (!store.access_token) {
    throw new Error(`Store ${store.id} (${store.name}) sem access token — autorize via OAuth.`);
  }

  // If we know the expiry, check proactively
  if (store.token_expires_at) {
    const expiresAt = new Date(store.token_expires_at).getTime();
    if (Date.now() + REFRESH_MARGIN_MS >= expiresAt) {
      return refreshMlToken(store);
    }
  }

  return store.access_token;
}

module.exports = { refreshMlToken, getValidMlToken };
