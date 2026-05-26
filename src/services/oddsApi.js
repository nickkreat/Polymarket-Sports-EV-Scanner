const BASE = 'https://api.the-odds-api.com/v4';

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

  const params = new URLSearchParams({
    apiKey,
    regions,
    markets: 'outrights',
    oddsFormat: 'american',
  });

  if (bookmakers) params.append('bookmakers', bookmakers);

  const res = await fetch(`${BASE}/sports/${sportKey}/odds?${params}`);

  if (res.status === 422) {
    // Invalid sport key — return empty quietly; don't throw so the browser
    // doesn't log a red network error for every caller.
    return [];
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Odds API ${res.status} for ${sportKey}: ${body}`);
  }

  return res.json();
}

/**
 * Fetch all sports from The Odds API, filter to ones we care about that have
 * outrights markets, and return their keys.  Falls back to CORE_SPORT_KEYS on
 * any error so a bad API key still produces a useful error message later.
 */
export async function fetchRelevantSportKeys(apiKey) {
  if (!apiKey) return CORE_SPORT_KEYS;

  try {
    const res = await fetch(`${BASE}/sports?apiKey=${apiKey}&all=true`);
    if (!res.ok) return CORE_SPORT_KEYS;

    const sports = await res.json();

    const relevant = sports
      .filter(s => s.has_outrights)          // must support futures/outrights
      .filter(s => {
        if (CORE_SPORT_KEYS.includes(s.key)) return true;
        const key   = (s.key   ?? '').toLowerCase();
        const group = (s.group ?? '').toLowerCase();
        return (
          DESIRED_KEY_FRAGMENTS.some(f => key.includes(f)) ||
          DESIRED_SPORT_GROUPS.some(g => group.toLowerCase() === g.toLowerCase())
        );
      })
      .map(s => s.key);

    return relevant.length ? relevant : CORE_SPORT_KEYS;
  } catch {
    return CORE_SPORT_KEYS;
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
 */
export async function fetchH2HOdds(sportKey, apiKey, { regions = 'us,us2' } = {}) {
  if (!apiKey) throw new Error('No Odds API key configured');

  const params = new URLSearchParams({
    apiKey,
    regions,
    markets: 'h2h',
    oddsFormat: 'american',
  });

  const res = await fetch(`${BASE}/sports/${sportKey}/odds?${params}`);
  if (!res.ok) throw new Error(`Odds API ${res.status}`);
  return res.json();
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
