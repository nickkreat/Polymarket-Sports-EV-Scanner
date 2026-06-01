import { decimalToAmerican } from '../../utils/odds.js';

export const FETCH_TIMEOUT_MS = 12000;
export const CACHE_TTL_MS = 5 * 60 * 1000;

const _cache = new Map();

export function getCached(key) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  return null;
}

export function setCached(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

export async function fetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function americanFromOddsPapiPrice(player) {
  if (player?.priceAmerican != null && player.priceAmerican !== '') {
    const raw = String(player.priceAmerican).trim();
    const n = Number(raw.replace(/^\+/, ''));
    if (!Number.isNaN(n)) return raw.startsWith('-') ? -Math.abs(n) : n;
  }
  if (player?.price != null) {
    const dec = Number(player.price);
    if (!Number.isNaN(dec) && dec > 1) return decimalToAmerican(dec);
  }
  return null;
}

/** Build a The-Odds-API-shaped outright event for the matching engine. */
export function buildOutrightEvent({
  id,
  sportKey,
  title,
  commenceTime,
  bookmakers,
  source,
  fixturePath,
}) {
  return {
    id,
    sport_key: sportKey,
    sport_title: title,
    commence_time: commenceTime ?? null,
    home_team: title,
    away_team: null,
    bookmakers,
    _source: source,
    _fixturePath: fixturePath ?? null,
  };
}

export function mergeBookmakerOutcomes(existingBooks = [], newBooks = []) {
  const byKey = new Map(existingBooks.map(b => [b.key, b]));
  for (const book of newBooks) {
    const prev = byKey.get(book.key);
    if (!prev) {
      byKey.set(book.key, book);
      continue;
    }
    const marketMap = new Map((prev.markets ?? []).map(m => [m.key, m]));
    for (const market of book.markets ?? []) {
      const prevMarket = marketMap.get(market.key);
      if (!prevMarket) {
        marketMap.set(market.key, market);
        continue;
      }
      const names = new Set(prevMarket.outcomes.map(o => o.name));
      for (const o of market.outcomes ?? []) {
        if (!names.has(o.name)) prevMarket.outcomes.push(o);
      }
    }
    prev.markets = [...marketMap.values()];
    if (book.url && !prev.url) prev.url = book.url;
  }
  return [...byKey.values()];
}

export function mergeOddsEventPools(primary = [], supplemental = []) {
  const byId = new Map(primary.map(e => [e.id, e]));

  for (const event of supplemental) {
    const existing = byId.get(event.id);
    if (!existing) {
      byId.set(event.id, event);
      continue;
    }
    existing.bookmakers = mergeBookmakerOutcomes(existing.bookmakers, event.bookmakers);
    if (event._fixturePath && !existing._fixturePath) existing._fixturePath = event._fixturePath;
  }

  return [...byId.values()];
}

export const GOLF_TOURNAMENT_HINTS = [
  'charles schwab',
  'colonial',
  'rbc heritage',
  'travelers',
  'memorial',
  'bmw championship',
  'tour championship',
  'fedex',
  'players championship',
  'genesis invitational',
  'pga championship',
  'masters',
  'us open',
  'open championship',
  'british open',
];

export function tournamentMatchesHint(name = '', slug = '') {
  const text = `${name} ${slug}`.toLowerCase();
  return GOLF_TOURNAMENT_HINTS.some(h => text.includes(h));
}
