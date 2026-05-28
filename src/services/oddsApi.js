const BASE = 'https://api.the-odds-api.com/v4';
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — reduces re-scan 429s

// In-memory session cache; cleared on page reload, not persisted.
const _oddsCache = new Map();

function _getCached(key) {
  const hit = _oddsCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  return null;
}

function _setCached(key, data) {
  _oddsCache.set(key, { data, ts: Date.now() });
}

function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(timer));
}

// Confirmed-working core sport keys (always attempted)
export const CORE_SPORT_KEYS = [
  'americanfootball_nfl',
  'americanfootball_ncaaf',
  'basketball_nba',
  'basketball_ncaab',
  'baseball_mlb',
  'icehockey_nhl',
  'soccer_usa_mls',
  'soccer_epl',
  'soccer_uefa_champs_league',
  'mma_mixed_martial_arts',
];

// Sport key substrings / groups we want to auto-include when discovered via /sports
const DESIRED_KEY_FRAGMENTS   = ['golf', 'tennis', 'nascar', 'formula', 'motorsport', 'boxing'];
const DESIRED_SPORT_GROUPS    = ['Golf', 'Tennis', 'Motorsport', 'Boxing'];

// Legacy export kept so existing imports don't break
export const ALL_SPORT_KEYS = CORE_SPORT_KEYS;

/**
 * Fetch outrights (futures) for a single sport.
 * Returns [] instead of throwing on non-2xx so callers stay clean.
 */
export async function fetchFuturesOdds(sportKey, apiKey, { regions = 'us,us2', bookmakers } = {}) {
  if (!apiKey) throw new Error('No Odds API key configured');

  const cacheKey = `futures|${sportKey}|${regions}|${bookmakers ?? ''}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    apiKey,
    regions,
    markets: 'outrights',
    oddsFormat: 'american',
  });

  if (bookmakers) params.append('bookmakers', bookmakers);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(`${BASE}/sports/${sportKey}/odds?${params}`, { signal: controller.signal })
    .finally(() => clearTimeout(timer));

  if (res.status === 422) {
    return [];
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Odds API ${res.status} for ${sportKey}: ${body}`);
  }

  const now  = Date.now();
  const data = (await res.json()).filter(
    e => !e.commence_time || new Date(e.commence_time).getTime() >= now
  );
  _setCached(cacheKey, data);
  return data;
}

/**
 * Fetch all sports from The Odds API and split into two key lists:
 *   futuresSportKeys — sports with has_outrights (for outright/futures markets)
 *   h2hSportKeys     — all active sports (for game moneylines)
 *
 * The old approach filtered only by has_outrights, which threw away every game
 * sport key (NFL, NBA, MLB, NHL, etc.) because they return has_outrights=false
 * during stretches when no futures markets are open. Now we keep them separately.
 */
export async function fetchRelevantSportKeys(apiKey) {
  const FALLBACK = { futuresSportKeys: CORE_SPORT_KEYS, h2hSportKeys: CORE_SPORT_KEYS };
  if (!apiKey) return FALLBACK;

  const cacheKey = `sports|${apiKey}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${BASE}/sports?apiKey=${apiKey}&all=true`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return FALLBACK;

    const sports = await res.json();

    const matchesCriteria = s => {
      if (CORE_SPORT_KEYS.includes(s.key)) return true;
      const key   = (s.key   ?? '').toLowerCase();
      const group = (s.group ?? '').toLowerCase();
      return (
        DESIRED_KEY_FRAGMENTS.some(f => key.includes(f)) ||
        DESIRED_SPORT_GROUPS.some(g => group.toLowerCase() === g.toLowerCase())
      );
    };

    // H2H: all *active* sports matching our criteria (active = has upcoming events)
    const h2hSportKeys = sports.filter(s => s.active).filter(matchesCriteria).map(s => s.key);

    // Futures: only sports that currently have outright markets
    const futuresSportKeys = sports.filter(s => s.has_outrights).filter(matchesCriteria).map(s => s.key);

    const result = {
      futuresSportKeys: futuresSportKeys.length ? futuresSportKeys : CORE_SPORT_KEYS,
      h2hSportKeys:     h2hSportKeys.length     ? h2hSportKeys     : CORE_SPORT_KEYS,
    };
    _setCached(cacheKey, result);
    return result;
  } catch {
    return FALLBACK;
  }
}

/**
 * Fetch futures for a list of sport keys in parallel.
 * Returns a flat list of outright event objects.
 */
export async function fetchAllFuturesOdds(apiKey, sportKeys = CORE_SPORT_KEYS, options = {}) {
  const results = await Promise.allSettled(
    sportKeys.map(sk => fetchFuturesOdds(sk, apiKey, options))
  );

  const events = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      events.push(...r.value);
    }
  }
  return events;
}

/**
 * Fetch H2H odds for a sport (game-level markets).
 * Returns [] on 422/404 and on network error so callers stay clean.
 */
export async function fetchH2HOdds(sportKey, apiKey, { regions = 'us,us2' } = {}) {
  if (!apiKey) throw new Error('No Odds API key configured');

  const cacheKey = `h2h|${sportKey}|${regions}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    apiKey,
    regions,
    markets: 'h2h',
    oddsFormat: 'american',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(`${BASE}/sports/${sportKey}/odds?${params}`, { signal: controller.signal })
    .finally(() => clearTimeout(timer));

  if (res.status === 422 || res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Odds API ${res.status} for ${sportKey} h2h: ${body}`);
  }

  const now  = Date.now();
  const data = (await res.json()).filter(
    e => !e.commence_time || new Date(e.commence_time).getTime() >= now
  );
  _setCached(cacheKey, data);
  return data;
}

/**
 * Fetch H2H (game-level) odds for a list of sport keys in parallel.
 * Returns a flat list of game event objects, each with market.key === 'h2h'.
 */
export async function fetchAllH2HOdds(apiKey, sportKeys = CORE_SPORT_KEYS, options = {}) {
  const results = await Promise.allSettled(
    sportKeys.map(sk => fetchH2HOdds(sk, apiKey, options))
  );

  const events = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      events.push(...r.value);
    }
  }
  return events;
}

/**
 * Fetch spread/handicap odds for a sport.
 * Requests both 'spreads' and 'alternate_spreads' so callers get standard and
 * alternate lines (e.g. MLB -1.5 and -3.5 run lines) in a single API call.
 * Returns [] on 422/404 so callers stay clean.
 */
export async function fetchSpreadsOdds(sportKey, apiKey, { regions = 'us,us2' } = {}) {
  if (!apiKey) throw new Error('No Odds API key configured');

  const cacheKey = `spreads|${sportKey}|${regions}`;
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    apiKey,
    regions,
    markets: 'spreads,alternate_spreads',
    oddsFormat: 'american',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(`${BASE}/sports/${sportKey}/odds?${params}`, { signal: controller.signal })
    .finally(() => clearTimeout(timer));

  if (res.status === 422 || res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Odds API ${res.status} for ${sportKey} spreads: ${body}`);
  }

  const now  = Date.now();
  const data = (await res.json()).filter(
    e => !e.commence_time || new Date(e.commence_time).getTime() >= now
  );
  _setCached(cacheKey, data);
  return data;
}

/**
 * Fetch spread/handicap odds for a list of sport keys in parallel.
 */
export async function fetchAllSpreadsOdds(apiKey, sportKeys = CORE_SPORT_KEYS, options = {}) {
  const results = await Promise.allSettled(
    sportKeys.map(sk => fetchSpreadsOdds(sk, apiKey, options))
  );

  const events = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      events.push(...r.value);
    }
  }
  return events;
}

/**
 * Fetch all available sports from The Odds API (includes in-season flag).
 */
export async function fetchAvailableSports(apiKey) {
  const res = await fetch(`${BASE}/sports?apiKey=${apiKey}&all=true`);
  if (!res.ok) throw new Error(`Odds API ${res.status}`);
  return res.json();
}

/**
 * Get remaining API quota.
 */
export async function checkQuota(apiKey) {
  const res = await fetch(`${BASE}/sports?apiKey=${apiKey}`);
  return {
    remaining: parseInt(res.headers.get('x-requests-remaining') ?? '-1'),
    used:      parseInt(res.headers.get('x-requests-used') ?? '-1'),
  };
}
