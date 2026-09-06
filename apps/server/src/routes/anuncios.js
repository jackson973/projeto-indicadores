const express = require('express');
const { authenticate, requireModule } = require('../middleware/auth');
const requireAdmin = requireModule('lojas');
const storesRepo = require('../db/storesRepository');
const db = require('../db/connection');
const { getValidMlToken, refreshMlToken } = require('../services/mlTokenService');

const router = express.Router();
router.use(authenticate, requireAdmin);

// ── GET /api/anuncios?store_id=X ──────────────────────────────────────────────

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Monta o relatório de anúncios de uma conta ML (mesmos dados da tela Anúncios).
 * Reutilizado pela API externa (/api/v1/marketplaces/ml/anuncios).
 * Erros de validação carregam `status` (400/404).
 */
async function buildAnunciosReport(store_id) {
  if (!store_id) throw httpError(400, 'store_id é obrigatório.');

  {
    const store = await storesRepo.getStoreCredentials(store_id);
    if (!store) throw httpError(404, 'Loja não encontrada.');
    if (!store.access_token) throw httpError(400, 'Loja sem token de acesso.');
    if (!store.platform_user_id) throw httpError(400, 'ID do vendedor não encontrado.');

    const userId  = store.platform_user_id;
    let   token   = await getValidMlToken(store);  // refresh if expired/close to expiry
    const storeId = store.id;

    // ── 1. Collect all item IDs ──────────────────────────────────────────────
    let allIds;
    try {
      allIds = await fetchAllItemIds(userId, token);
    } catch (err) {
      // If the token is invalid (expired without token_expires_at set), try one refresh
      if (err.message.includes('invalid access token') || err.message.includes('expired')) {
        console.log('[Anuncios] Token invalid — attempting refresh...');
        token = await refreshMlToken(store);
        allIds = await fetchAllItemIds(userId, token);
      } else {
        throw err;
      }
    }
    if (allIds.length === 0) {
      return { store_id: storeId, store_name: store.name, total: 0, items: [] };
    }

    // ── 2. Parallel fetch all data ───────────────────────────────────────────
    const [itemDetails, visitsData, ordersData, reviewsMap, questionsMap, adsMap, trendsMap, promoMap] = await Promise.all([
      batchFetchItems(allIds, token),
      fetchVisitsMultiPeriod(storeId, allIds, token),
      fetchOrdersSoldByPeriod(userId, token),  // real sales per item per period
      batchFetchReviews(allIds, token),
      batchFetchQuestions(allIds, token),
      fetchAdsMap(userId, token),
      fetchTrends(storeId, allIds),
      batchFetchItemPrices(allIds, token),
    ]);

    // ── 3. Merge and compute metrics ─────────────────────────────────────────
    const items = itemDetails.map((item) => {
      const visits     = visitsData.map_30d[item.id] || 0;
      const visits_7d  = visitsData.map_7d[item.id]  || 0;
      const visits_15d = visitsData.map_15d[item.id] || 0;
      const sold = item.sold_quantity || 0;

      // Period-specific sold + revenue from real orders (available immediately)
      const sold_30d = ordersData.sold_30d[item.id] ?? 0;
      const sold_15d = ordersData.sold_15d[item.id] ?? 0;
      const sold_7d  = ordersData.sold_7d[item.id]  ?? 0;
      const rev_30d  = ordersData.rev_30d[item.id]  ?? 0;
      const rev_15d  = ordersData.rev_15d[item.id]  ?? 0;
      const rev_7d   = ordersData.rev_7d[item.id]   ?? 0;

      // 30d conversion for health score
      const conversion = visits > 0 ? parseFloat(((sold_30d / visits) * 100).toFixed(1)) : 0;

      // Listing type + shipping (already present on item from ML batch response)
      const listingTypeLabel = mapListingType(item.listing_type_id);
      const freeShipping     = item.shipping?.free_shipping || false;
      const isFulfillment    = item.shipping?.logistic_type === 'fulfillment'
                               || (item.tags || []).includes('fulfillment');

      // Trend refs (still from snapshots — for visits trend)
      const prev = trendsMap[item.id] || {};

      // ML promo price detection — three sources in priority order:
      // 1. original_price on item (classic discount)
      // 2. sale_price object (deal/campaign)
      // 3. seller-promotions API (campaign promos not reflected in item fields)
      const salePrice = item.sale_price || null;
      let promoPrice, regularPrice, promoEnd, promoStart;

      if (item.original_price != null) {
        promoPrice   = item.price;
        regularPrice = item.original_price;
        promoEnd     = salePrice?.conditions?.end_time ?? null;
        promoStart   = salePrice?.conditions?.start_time ?? null;
      } else if (salePrice?.amount != null && salePrice.amount < (item.price || Infinity)) {
        promoPrice   = salePrice.amount;
        regularPrice = salePrice.regular_amount ?? item.price;
        promoEnd     = salePrice?.conditions?.end_time ?? null;
        promoStart   = salePrice?.conditions?.start_time ?? null;
      } else if (promoMap[item.id]) {
        const pm     = promoMap[item.id];
        promoPrice   = pm.promo_price;
        regularPrice = pm.regular_price ?? item.price;
        promoEnd     = pm.promo_end ?? null;
        promoStart   = pm.promo_start ?? null;
      } else {
        promoPrice   = null;
        regularPrice = item.price;
        promoEnd     = null;
        promoStart   = null;
      }

      const activePrice = promoPrice ?? regularPrice ?? 0;

      // Dias de estoque usando taxa dos últimos 30d de pedidos reais
      const dailyRate = sold_30d > 0 ? sold_30d / 30 : 0;
      const stockDays = dailyRate > 0
        ? Math.round((item.available_quantity || 0) / dailyRate)
        : null;

      const healthScore = computeHealthScore({ item, visits, sold: sold_30d, conversion });
      const fichaScore  = computeFichaScore(item);

      // Multi-period trend — visits (from snapshots) + sold (from orders comparison)
      const trend = {
        visits_pct:     pct(visits,    prev.ref_visits_30d),
        visits_pct_7d:  pct(visits_7d,  prev.ref_visits_7d),
        visits_pct_15d: pct(visits_15d, prev.ref_visits_15d),
        sold_pct_30d:   pct(sold_30d, ordersData.sold_prev_30d[item.id]),
        sold_pct_15d:   pct(sold_15d, ordersData.sold_prev_15d[item.id]),
        sold_pct_7d:    pct(sold_7d,  ordersData.sold_prev_7d[item.id]),
      };

      return {
        id:                 item.id,
        title:              item.title,
        price:              activePrice,
        regular_price:      regularPrice,
        promo_price:        promoPrice,
        promo_end:          promoEnd,
        promo_start:        promoStart,
        currency_id:        item.currency_id,
        status:             item.status,
        thumbnail:          item.thumbnail,
        permalink:          item.permalink,
        sold_quantity:      sold,   // acumulado total (lifetime)
        sold_30d,                   // unidades vendidas nos últimos 30d (pedidos reais)
        sold_15d,                   // últimos 15d
        sold_7d,                    // últimos 7d
        revenue_30d:        rev_30d, // receita real dos últimos 30d
        revenue_15d:        rev_15d,
        revenue_7d:         rev_7d,
        available_quantity: item.available_quantity,
        visits,
        visits_7d,
        visits_15d,
        conversion,
        stock_days:         stockDays,
        condition:          item.condition,
        listing_type_id:    item.listing_type_id,
        listing_type_label: listingTypeLabel,
        free_shipping:      freeShipping,
        fulfillment:        isFulfillment,
        date_created:       item.date_created,
        last_updated:       item.last_updated,
        // Health score
        score:         healthScore.score,
        score_label:   healthScore.label,
        score_details: healthScore.details,
        alerts:        healthScore.alerts,
        // Ficha quality
        ficha_score:   fichaScore.score,
        ficha_label:   fichaScore.label,
        ficha_details: fichaScore.details,
        // Reviews & questions
        reviews:   reviewsMap[item.id]   || null,
        questions: questionsMap[item.id] || null,
        // Ads
        ads: adsMap._unavailable ? 'unavailable' : (adsMap[item.id] || null),
        // Trend (multi-period)
        trend,
      };
    });

    // ── 4. Save snapshot (fire-and-forget) ───────────────────────────────────
    saveSnapshots(storeId, items).catch((err) =>
      console.error('[Anuncios] Snapshot save error:', err.message)
    );

    return { store_id: storeId, store_name: store.name, total: items.length, items };
  }
}

router.get('/', async (req, res) => {
  try {
    return res.json(await buildAnunciosReport(req.query.store_id));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('[Anuncios] Error:', error);
    return res.status(500).json({ message: 'Erro ao buscar anúncios.' });
  }
});

// ── GET /api/anuncios/:itemId/market?store_id=X ───────────────────────────────
// Compares item price against top competitors in the same ML category.

// ── ML website scraper for competitor prices ──────────────────────────────────

// Extract kit/pack quantity from title: "Kit 5 ...", "Pack 3 ..."
function extractKitQty(title) {
  const m = title.match(/\b(?:kit|pack|conjunto)\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

// Build focused search query from item title
function buildSearchQuery(title) {
  return title
    // Remove color/size/variant noise but KEEP kit+number (e.g. "Kit 5")
    .replace(/\b(tam|tamanho|cor|cores?\s+sortidas?|conjunto|set|pack)\b/gi, '')
    .replace(/\b\d+\s*(cm|mm|ml|l|kg|g|un|pcs?|par|pares)\b/gi, '')
    .replace(/\b[pP]\/[mMgG]\b|\b[xXgGpPmM]{1,3}\b(?=\s|$)/g, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 7)
    .join(' ');
}

async function scrapeMLSearch(query) {
  const encoded = encodeURIComponent(query);
  const url     = `https://lista.mercadolivre.com.br/${encoded}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  });

  if (!res.ok) {
    console.log(`[Anuncios] scrape: ${res.status} for query "${query}"`);
    return [];
  }

  const html = await res.text();

  // ML embeds product data as JSON-LD structured data
  const results = [];

  // Try JSON-LD first
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1]);
      // Flatten: handle top-level array, @graph wrapper, or single object
      let nodes = [];
      if (Array.isArray(data)) {
        nodes = data;
      } else if (data['@graph']) {
        nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data['@graph']];
      } else {
        nodes = [data];
      }
      for (const d of nodes) {
        if (d['@type'] === 'Product' && d.offers) {
          const offers = Array.isArray(d.offers) ? d.offers : [d.offers];
          for (const offer of offers) {
            // ML JSON-LD only exposes base price (sem desconto Pix)
            const price = parseFloat(offer.price || 0);
            if (price > 0) {
              results.push({
                title:     d.name || '',
                price,
                thumbnail: Array.isArray(d.image) ? d.image[0] : (d.image || null),
                url:       offer.url || null,
                brand:     d.brand?.name || null,
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  // Fallback: extract from __PRELOADED_STATE__ if JSON-LD gave nothing
  if (results.length === 0) {
    const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (stateMatch) {
      try {
        const state   = JSON.parse(stateMatch[1]);
        const itemList = state?.initialState?.results
          || state?.results
          || [];
        for (const r of itemList) {
          const price = r.price || r.prices?.price?.amount || 0;
          if (price > 0) {
            results.push({
              title:         r.title || '',
              price:         parseFloat(price),
              thumbnail:     r.thumbnail || null,
              sold_quantity: r.sold_quantity ?? null,
            });
          }
        }
      } catch (_) {}
    }
  }

  console.log(`[Anuncios] scrape: found ${results.length} results for "${query}"`);
  return results.slice(0, 20);
}

// Scrape individual ML product page for seller name + Pix price
async function scrapeMLProductPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    if (!res.ok) return {};
    const html = await res.text();

    let seller    = null;
    let pixPrice  = null;
    let cardPrice = null;
    let origPrice = null;

    // ── Seller name ──────────────────────────────────────────────────────────
    // <h2 class="...ui-seller-data-header__title..."><span>STORE NAME</span></h2>
    const sellerMatch = html.match(/ui-seller-data-header__title[^"]*"[^>]*>\s*<span>([^<]+)<\/span>/);
    if (sellerMatch) seller = sellerMatch[1].trim();

    // ── Prices ───────────────────────────────────────────────────────────────
    // 1. Pix price: <meta itemprop="price" content="78.70"> — most reliable
    const pixMetaMatch = html.match(/itemprop="price"\s+content="([\d.]+)"/);
    if (pixMetaMatch) pixPrice = parseFloat(pixMetaMatch[1]);

    // 2. Original/tabela price (riscado): aria-label="Antes: 89 reais com 90 centavos"
    const origMatch = html.match(/aria-label="Antes:\s*(\d+)\s*reais(?:\s*com\s*(\d+)\s*centavos)?"/);
    if (origMatch) origPrice = parseFloat(`${origMatch[1]}.${(origMatch[2] || '0').padStart(2, '0')}`);

    // 3. Card price (outros meios): price in #pricing_price_subtitle
    const subtitleIdx = html.indexOf('pricing_price_subtitle');
    if (subtitleIdx !== -1) {
      const subtitleArea = html.slice(subtitleIdx, subtitleIdx + 800);
      const cardMatch = subtitleArea.match(/aria-label="(\d+)\s*reais\s*com\s*(\d+)\s*centavos"/);
      if (cardMatch) cardPrice = parseFloat(`${cardMatch[1]}.${cardMatch[2].padStart(2, '0')}`);
    }

    return { seller, pix_price: pixPrice, card_price: cardPrice, orig_price: origPrice };
  } catch (_) {
    return {};
  }
}

router.get('/:itemId/market', async (req, res) => {
  const { store_id, our_price: ourPriceParam } = req.query;
  const { itemId } = req.params;

  if (!store_id) return res.status(400).json({ message: 'store_id é obrigatório.' });

  try {
    const store = await storesRepo.getStoreCredentials(store_id);
    if (!store) return res.status(404).json({ message: 'Loja não encontrada.' });

    const token = await getValidMlToken(store);

    // Fetch item details
    const itemRes = await fetch(
      `https://api.mercadolibre.com/items/${itemId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!itemRes.ok) return res.status(400).json({ message: 'Item não encontrado.' });
    const item = await itemRes.json();

    // Own store nickname to filter out our own listings from competitors
    const ownNickname = (item.seller?.nickname || '').toLowerCase();

    // Scrape ML website search with item title
    const query     = buildSearchQuery(item.title || '');
    const scraped   = await scrapeMLSearch(query);
    // Pre-filter: remove zero-price results (further seller filtering happens post-enrichment)
    const candidates = scraped.filter((r) => r.price > 0).slice(0, 20);

    if (candidates.length === 0) {
      return res.json({
        item_id:   itemId,
        our_price: item.price,
        query,
        stats:     null,
        top:       [],
        _note:     'Nenhum concorrente encontrado para esta busca.',
      });
    }

    // Enrich top 15 candidates in parallel
    const enriched = await Promise.all(
      candidates.map(async (c) => {
        if (!c.url) return c;
        const detail = await scrapeMLProductPage(c.url);
        return {
          ...c,
          seller:     detail.seller     || null,
          pix_price:  detail.pix_price  || null,
          card_price: detail.card_price || null,
          orig_price: detail.orig_price || null,
        };
      })
    );

    // Extract kit quantity from our item title for filtering
    const kitQty = extractKitQty(item.title || '');

    // Filter: remove own store + reject only when competitor qty is EXPLICITLY different
    const competitors = enriched.filter((c) => {
      if (c.seller && c.seller.toLowerCase() === ownNickname) return false;
      if (kitQty != null) {
        const cQty = extractKitQty(c.title || '');
        if (cQty != null && cQty !== kitQty) return false;
      }
      return true;
    }).slice(0, 10);

    console.log(`[Anuncios] query="${query}" kitQty=${kitQty} competitors=${competitors.length}`);

    console.log(`[Anuncios] competitors (filtered): ${competitors.length} | sellers: ${competitors.map(c => c.seller || '?').join(', ')}`);

    // Use pix_price when available for stats, fallback to base price
    const effectivePrices = competitors.map((r) => r.pix_price || r.price).sort((a, b) => a - b);
    const min    = effectivePrices[0];
    const max    = effectivePrices[effectivePrices.length - 1];
    const median = effectivePrices[Math.floor(effectivePrices.length / 2)];
    // Use price passed by frontend (already has promo/pix price), fallback to API price
    const ourPrice    = ourPriceParam ? parseFloat(ourPriceParam) : item.price;
    const pctVsMedian = Math.round(((ourPrice - median) / median) * 100);

    return res.json({
      item_id:   itemId,
      our_price: ourPrice,
      query,
      category_prices: { min_price: min, max_price: max, suggested: median },
      stats: {
        ref_price:  median,
        pct_vs_ref: pctVsMedian,
        source:     'ml_website_scrape',
      },
      top: competitors,
    });
  } catch (err) {
    console.error('[Anuncios] Market comparison error:', err.message);
    return res.status(500).json({ message: 'Erro ao buscar comparativo de mercado.' });
  }
});

// ── ML data fetching ──────────────────────────────────────────────────────────

async function fetchAllItemIds(userId, token) {
  const ids = [];
  const limit = 50;
  let offset = 0;
  let total  = null;

  do {
    const url = `https://api.mercadolibre.com/users/${userId}/items/search?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Erro ${res.status} ao buscar IDs.`);
    }
    const data = await res.json();
    if (total === null) total = data.paging?.total || 0;
    const results = data.results || [];
    ids.push(...results);
    offset += results.length;
  } while (ids.length < total && offset < total);

  return ids;
}

async function batchFetchItems(ids, token) {
  const BATCH = 20;
  const results = [];

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const url = `https://api.mercadolibre.com/items?ids=${chunk.join(',')}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) continue;
    const data = await res.json();
    for (const entry of data) {
      if (entry.code === 200 && entry.body) results.push(entry.body);
    }
  }

  return results;
}

// Fetch visits for a specific window (days). ML API only accepts 1 item at a time.
async function batchFetchVisits(ids, token, days = 30) {
  const visitsMap = {};
  const dateFrom  = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo    = new Date().toISOString().split('T')[0];

  await Promise.all(
    ids.map(async (id) => {
      try {
        const url = `https://api.mercadolibre.com/visits/items?ids=${id}&date_from=${dateFrom}&date_to=${dateTo}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        const val  = data[id];
        visitsMap[id] = val == null ? 0
          : typeof val === 'object' ? (val.total_visits ?? val.visits ?? 0)
          : val;
      } catch { /* Non-critical */ }
    })
  );

  return visitsMap;
}

// Hybrid: use today's cached snapshot if available, otherwise fetch 3 windows from ML API.
async function fetchVisitsMultiPeriod(storeId, itemIds, token) {
  try {
    const cached = await db.query(
      `SELECT item_id, visits, visits_7d, visits_15d
       FROM ml_anuncios_snapshots
       WHERE store_id = $1
         AND item_id = ANY($2)
         AND snapshot_date = CURRENT_DATE
         AND visits_7d IS NOT NULL`,
      [storeId, itemIds]
    );

    if (cached.rows.length === itemIds.length) {
      console.log('[Anuncios] Visits: serving from today\'s snapshot cache');
      const map_7d = {}, map_15d = {}, map_30d = {};
      for (const row of cached.rows) {
        map_7d[row.item_id]  = row.visits_7d  || 0;
        map_15d[row.item_id] = row.visits_15d || 0;
        map_30d[row.item_id] = row.visits     || 0;
      }
      return { map_7d, map_15d, map_30d };
    }
  } catch { /* fall through */ }

  console.log(`[Anuncios] Visits: fetching 3 windows from ML API (${itemIds.length} items × 3)`);
  const [map_7d, map_15d, map_30d] = await Promise.all([
    batchFetchVisits(itemIds, token, 7),
    batchFetchVisits(itemIds, token, 15),
    batchFetchVisits(itemIds, token, 30),
  ]);

  return { map_7d, map_15d, map_30d };
}

async function batchFetchReviews(ids, token) {
  const reviewsMap = {};

  await Promise.all(
    ids.map(async (id) => {
      try {
        const url = `https://api.mercadolibre.com/reviews/item/${id}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        reviewsMap[id] = {
          avg:   data.rating_average ?? null,
          total: data.paging?.total  ?? 0,
        };
      } catch { /* Non-critical */ }
    })
  );

  return reviewsMap;
}

async function batchFetchQuestions(ids, token) {
  const questionsMap = {};

  await Promise.all(
    ids.map(async (id) => {
      try {
        const url = `https://api.mercadolibre.com/questions/search?item_id=${id}&status=UNANSWERED`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        questionsMap[id] = { unanswered: data.total ?? 0 };
      } catch { /* Non-critical */ }
    })
  );

  return questionsMap;
}

async function batchFetchItemPrices(ids, token) {
  // GET /items/{id}/prices returns all price types including active promotions
  const map = {};

  await Promise.all(
    ids.map(async (id) => {
      try {
        const url = `https://api.mercadolibre.com/items/${id}/prices`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        const prices    = data.prices || [];
        const standard  = prices.find((p) => p.type === 'standard');
        const promotion = prices.find((p) => p.type === 'promotion' || p.type === 'deal');

        if (promotion && standard && promotion.amount < standard.amount) {
          map[id] = {
            promo_price:   promotion.amount,
            regular_price: standard.amount,
            promo_end:     promotion.conditions?.end_time   ?? null,
            promo_start:   promotion.conditions?.start_time ?? null,
          };
        } else {
          // Fallback: check reference_prices for before_promotion price
          const original = (data.reference_prices || [])
            .find((p) => p.type === 'original_price' || p.type === 'before_promotion');
          if (original && standard && original.amount > standard.amount) {
            map[id] = {
              promo_price:   standard.amount,
              regular_price: original.amount,
              promo_end:     null,
              promo_start:   null,
            };
          }
        }
      } catch { /* Non-critical */ }
    })
  );

  return map;
}

// Fetch paginated paid orders between two ISO date strings.
async function fetchOrdersInRange(userId, token, dateFrom, dateTo) {
  const orders    = [];
  const limit     = 50;
  const MAX_PAGES = 20; // ~1000 orders safety cap
  let   offset    = 0;
  let   total     = null;
  let   pages     = 0;

  try {
    do {
      const url = 'https://api.mercadolibre.com/orders/search'
        + `?seller=${userId}`
        + `&order.status=paid`
        + `&order.date_created.from=${encodeURIComponent(dateFrom)}`
        + `&order.date_created.to=${encodeURIComponent(dateTo)}`
        + `&sort=date_desc`
        + `&limit=${limit}&offset=${offset}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        console.warn(`[Anuncios] Orders API ${res.status} (${dateFrom.slice(0,10)}–${dateTo.slice(0,10)})`);
        break;
      }
      const data = await res.json();
      if (total === null) total = data.paging?.total || 0;
      orders.push(...(data.results || []));
      offset += (data.results || []).length;
      pages++;
    } while (offset < (total || 0) && pages < MAX_PAGES);
  } catch (err) {
    console.error('[Anuncios] Orders fetch error:', err.message);
  }

  return orders;
}

// Aggregate sold units + revenue per item_id for the given order array.
function aggregateOrders(orders) {
  const sold = {}, rev = {};
  for (const order of orders) {
    for (const oi of (order.order_items || [])) {
      const id  = oi.item?.id; if (!id) continue;
      const qty = oi.quantity        || 0;
      const r   = (oi.unit_price || 0) * qty;
      sold[id]  = (sold[id] || 0) + qty;
      rev[id]   = (rev[id]  || 0) + r;
    }
  }
  return { sold, rev };
}

// Fetch orders for 2 periods in parallel, then split current 30d into sub-windows.
// Returns current 7d/15d/30d + previous 7d/15d/30d for trend comparison.
async function fetchOrdersSoldByPeriod(userId, token) {
  const now  = Date.now();
  const ms7  =  7 * 24 * 60 * 60 * 1000;
  const ms15 = 15 * 24 * 60 * 60 * 1000;
  const ms30 = 30 * 24 * 60 * 60 * 1000;
  const ms60 = 60 * 24 * 60 * 60 * 1000;

  const [currentOrders, prevOrders] = await Promise.all([
    fetchOrdersInRange(userId, token,
      new Date(now - ms30).toISOString(), new Date(now).toISOString()),
    fetchOrdersInRange(userId, token,
      new Date(now - ms60).toISOString(), new Date(now - ms30).toISOString()),
  ]);

  console.log(`[Anuncios] Orders: ${currentOrders.length} (cur 30d) + ${prevOrders.length} (prev 30d)`);

  // Current period — split into 3 windows from the same fetch
  const sold_30d = {}, rev_30d = {};
  const sold_15d = {}, rev_15d = {};
  const sold_7d  = {}, rev_7d  = {};
  // Previous sub-windows derived from the same current-30d data
  const sold_prev_15d = {}, rev_prev_15d = {}; // 15–30d ago (compare against current 15d)
  const sold_prev_7d  = {}, rev_prev_7d  = {}; // 7–14d ago  (compare against current 7d)

  for (const order of currentOrders) {
    const age = now - new Date(order.date_created).getTime();
    for (const oi of (order.order_items || [])) {
      const id  = oi.item?.id; if (!id) continue;
      const qty = oi.quantity || 0;
      const r   = (oi.unit_price || 0) * qty;

      sold_30d[id] = (sold_30d[id] || 0) + qty; rev_30d[id] = (rev_30d[id] || 0) + r;

      if (age <= ms15) { sold_15d[id] = (sold_15d[id] || 0) + qty; rev_15d[id] = (rev_15d[id] || 0) + r; }
      if (age <= ms7)  { sold_7d[id]  = (sold_7d[id]  || 0) + qty; rev_7d[id]  = (rev_7d[id]  || 0) + r; }

      // Previous 15d window = orders between 15–30 days ago
      if (age > ms15) { sold_prev_15d[id] = (sold_prev_15d[id] || 0) + qty; rev_prev_15d[id] = (rev_prev_15d[id] || 0) + r; }
      // Previous 7d window  = orders between 7–14 days ago
      if (age > ms7 && age <= ms15) { sold_prev_7d[id] = (sold_prev_7d[id] || 0) + qty; rev_prev_7d[id] = (rev_prev_7d[id] || 0) + r; }
    }
  }

  // Previous 30d — separate fetch (30–60d ago)
  const { sold: sold_prev_30d, rev: rev_prev_30d } = aggregateOrders(prevOrders);

  return {
    sold_7d, sold_15d, sold_30d,
    rev_7d,  rev_15d,  rev_30d,
    sold_prev_7d,  sold_prev_15d,  sold_prev_30d,
    rev_prev_7d,   rev_prev_15d,   rev_prev_30d,
  };
}

async function fetchAdsMap(userId, token) {
  // ML Product Ads API endpoint not yet identified — returns unavailable marker
  void userId; void token;
  return { _unavailable: true };
}

// ── Snapshots & trends ────────────────────────────────────────────────────────

async function fetchTrends(storeId, itemIds) {
  try {
    const [ref30, ref7, ref15] = await Promise.all([
      // ~30d ago → trend for 30d window + sold delta base
      db.query(
        `SELECT DISTINCT ON (item_id) item_id, visits AS ref_visits, sold_quantity AS ref_sold
         FROM ml_anuncios_snapshots
         WHERE store_id = $1 AND item_id = ANY($2)
           AND snapshot_date BETWEEN CURRENT_DATE - 35 AND CURRENT_DATE - 25
         ORDER BY item_id, snapshot_date DESC`,
        [storeId, itemIds]
      ),
      // ~7d ago → trend for 7d window + sold delta base
      db.query(
        `SELECT DISTINCT ON (item_id) item_id, visits_7d AS ref_visits, sold_quantity AS ref_sold
         FROM ml_anuncios_snapshots
         WHERE store_id = $1 AND item_id = ANY($2)
           AND snapshot_date BETWEEN CURRENT_DATE - 14 AND CURRENT_DATE - 7
         ORDER BY item_id, snapshot_date DESC`,
        [storeId, itemIds]
      ),
      // ~15d ago → trend for 15d window + sold delta base
      db.query(
        `SELECT DISTINCT ON (item_id) item_id, visits_15d AS ref_visits, sold_quantity AS ref_sold
         FROM ml_anuncios_snapshots
         WHERE store_id = $1 AND item_id = ANY($2)
           AND snapshot_date BETWEEN CURRENT_DATE - 20 AND CURRENT_DATE - 15
         ORDER BY item_id, snapshot_date DESC`,
        [storeId, itemIds]
      ),
    ]);

    const map = {};
    for (const row of ref30.rows) {
      map[row.item_id] = { ...(map[row.item_id] || {}),
        ref_visits_30d: row.ref_visits, ref_sold_30d: row.ref_sold };
    }
    for (const row of ref7.rows) {
      map[row.item_id] = { ...(map[row.item_id] || {}),
        ref_visits_7d: row.ref_visits, ref_sold_7d: row.ref_sold };
    }
    for (const row of ref15.rows) {
      map[row.item_id] = { ...(map[row.item_id] || {}),
        ref_visits_15d: row.ref_visits, ref_sold_15d: row.ref_sold };
    }
    return map;
  } catch {
    return {};
  }
}

async function saveSnapshots(storeId, items) {
  for (const item of items) {
    await db.query(
      `INSERT INTO ml_anuncios_snapshots
         (store_id, item_id, snapshot_date, visits, visits_7d, visits_15d, sold_quantity, available_quantity, price)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (store_id, item_id, snapshot_date) DO UPDATE SET
         visits             = EXCLUDED.visits,
         visits_7d          = EXCLUDED.visits_7d,
         visits_15d         = EXCLUDED.visits_15d,
         sold_quantity      = EXCLUDED.sold_quantity,
         available_quantity = EXCLUDED.available_quantity,
         price              = EXCLUDED.price`,
      [storeId, item.id, item.visits, item.visits_7d || 0, item.visits_15d || 0,
       item.sold_quantity, item.available_quantity, item.price]
    );
  }
}

// ── Score computation ─────────────────────────────────────────────────────────

function pct(current, ref) {
  if (ref == null || ref === 0) return null;
  return Math.round(((current - ref) / ref) * 100);
}

function computeHealthScore({ item, visits, sold, conversion }) {
  const details = [];
  const alerts  = [];
  let score     = 0;

  // Status (30 pts)
  if (item.status === 'active') {
    score += 30;
    details.push({ factor: 'Status', pts: 30, max: 30, note: 'Ativo' });
  } else if (item.status === 'paused') {
    score += 10;
    details.push({ factor: 'Status', pts: 10, max: 30, note: 'Pausado' });
    alerts.push('Anúncio pausado');
  } else {
    details.push({ factor: 'Status', pts: 0, max: 30, note: item.status });
    alerts.push(`Anúncio ${item.status}`);
  }

  // Estoque (20 pts)
  const stock = item.available_quantity || 0;
  if (stock > 10) {
    score += 20;
    details.push({ factor: 'Estoque', pts: 20, max: 20, note: `${stock} unidades` });
  } else if (stock > 0) {
    score += 10;
    details.push({ factor: 'Estoque', pts: 10, max: 20, note: `Baixo (${stock} un.)` });
    alerts.push(`Estoque baixo: ${stock} unidade${stock > 1 ? 's' : ''}`);
  } else {
    details.push({ factor: 'Estoque', pts: 0, max: 20, note: 'Sem estoque' });
    alerts.push('Sem estoque');
  }

  // Visitas (25 pts)
  if (visits >= 100) {
    score += 25;
    details.push({ factor: 'Visitas', pts: 25, max: 25, note: `${visits} visitas` });
  } else if (visits >= 30) {
    score += 15;
    details.push({ factor: 'Visitas', pts: 15, max: 25, note: `${visits} visitas` });
  } else if (visits >= 5) {
    score += 8;
    details.push({ factor: 'Visitas', pts: 8, max: 25, note: `Poucas (${visits})` });
    alerts.push(`Poucas visitas (${visits} nos últ. 30 dias)`);
  } else {
    details.push({ factor: 'Visitas', pts: 0, max: 25, note: `Muito baixo (${visits})` });
    alerts.push('Quase sem visitas — revise título e fotos');
  }

  // Conversão (25 pts)
  if (conversion >= 5) {
    score += 25;
    details.push({ factor: 'Conversão', pts: 25, max: 25, note: `${conversion}%` });
  } else if (conversion >= 2) {
    score += 15;
    details.push({ factor: 'Conversão', pts: 15, max: 25, note: `${conversion}%` });
  } else if (conversion >= 0.5) {
    score += 8;
    details.push({ factor: 'Conversão', pts: 8, max: 25, note: `Baixa (${conversion}%)` });
    alerts.push(`Conversão baixa (${conversion}%) — verifique preço e descrição`);
  } else {
    details.push({ factor: 'Conversão', pts: 0, max: 25, note: `Muito baixa (${conversion}%)` });
    if (visits > 0) alerts.push(`Conversão muito baixa (${conversion}%) — produto pode estar caro`);
  }

  const total = Math.min(score, 100);
  const label = total >= 70 ? 'Ótimo' : total >= 50 ? 'Bom' : total >= 30 ? 'Regular' : 'Ruim';
  return { score: total, label, details, alerts };
}

function computeFichaScore(item) {
  const details = [];
  let score     = 0;

  // Fotos (25 pts)
  const photoCount = item.pictures?.length || 0;
  if (photoCount >= 7) {
    score += 25;
    details.push({ factor: 'Fotos', pts: 25, max: 25, note: `${photoCount} fotos` });
  } else if (photoCount >= 4) {
    score += 15;
    details.push({ factor: 'Fotos', pts: 15, max: 25, note: `${photoCount} fotos (ideal: 7+)` });
  } else if (photoCount >= 1) {
    score += 8;
    details.push({ factor: 'Fotos', pts: 8, max: 25, note: `Poucas fotos (${photoCount})` });
  } else {
    details.push({ factor: 'Fotos', pts: 0, max: 25, note: 'Sem fotos' });
  }

  // Título (25 pts) — ML recomenda 60–80 chars
  const titleLen = item.title?.length || 0;
  if (titleLen >= 60 && titleLen <= 80) {
    score += 25;
    details.push({ factor: 'Título', pts: 25, max: 25, note: `${titleLen} chars (ideal)` });
  } else if (titleLen >= 40) {
    score += 15;
    details.push({ factor: 'Título', pts: 15, max: 25, note: `${titleLen} chars` });
  } else {
    score += 8;
    details.push({ factor: 'Título', pts: 8, max: 25, note: `Título curto (${titleLen} chars)` });
  }

  // Atributos (25 pts)
  const attrCount = item.attributes?.filter((a) => a.value_name && a.value_name !== 'N/A').length || 0;
  if (attrCount >= 15) {
    score += 25;
    details.push({ factor: 'Atributos', pts: 25, max: 25, note: `${attrCount} preenchidos` });
  } else if (attrCount >= 8) {
    score += 15;
    details.push({ factor: 'Atributos', pts: 15, max: 25, note: `${attrCount} preenchidos` });
  } else if (attrCount >= 3) {
    score += 8;
    details.push({ factor: 'Atributos', pts: 8, max: 25, note: `Poucos (${attrCount})` });
  } else {
    details.push({ factor: 'Atributos', pts: 0, max: 25, note: 'Não preenchidos' });
  }

  // Frete grátis (25 pts)
  if (item.shipping?.free_shipping) {
    score += 25;
    details.push({ factor: 'Frete grátis', pts: 25, max: 25, note: 'Sim' });
  } else {
    details.push({ factor: 'Frete grátis', pts: 0, max: 25, note: 'Não — penaliza conversão' });
  }

  const total = Math.min(score, 100);
  const label = total >= 70 ? 'Ótimo' : total >= 50 ? 'Bom' : total >= 30 ? 'Regular' : 'Ruim';
  return { score: total, label, details };
}

// Obtain an app-level access token via client_credentials.
// Required for ML public search API (user tokens return 403 on search).
async function getAppToken(store) {
  if (!store.client_id || !store.client_secret) {
    throw new Error('client_id / client_secret não configurados para esta loja.');
  }
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     store.client_id,
      client_secret: store.client_secret,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status} ao obter app token`);
  return data.access_token;
}

function mapListingType(typeId) {
  const types = {
    gold_special: 'Clássico',
    gold_pro:     'Premium',
    gold:         'Gold',
    silver:       'Prata',
    bronze:       'Bronze',
    free:         'Grátis',
  };
  return types[typeId] || typeId || '—';
}

module.exports = router;
module.exports.buildAnunciosReport = buildAnunciosReport;
