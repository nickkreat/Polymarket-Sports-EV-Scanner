const BASE = 'https://api.the-odds-api.com/v4';

// All sport keys The Odds API supports that are relevant
export const SPORT_KEYS = {
  NFL:      'americanfootball_nfl',
  NCAAF:    'americanfootball_ncaaf',
  NBA:      'basketball_nba',
  NCAAB:    'basketball_ncaab',
  MLB:      'baseball_mlb',
  NHL:      'icehockey_nhl',
  MLS:      'soccer_usa_mls',
  EPL:      'soccer_epl',
  UCL:      'soccer_uefa_champs_league',
  UFC:      'mma_mixed_martial_arts',
};

export const ALL_SPORT_KEYS = Object.values(SPORT_KEYS);

/**
 * Fetch outrights (futures) for a single sport.
 * Returns normalized odds with devig-ready probabilities.
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

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Odds API ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Fetch H2H odds for a sport (useful for game-level markets).
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
 * Fetch all available sports from The Odds API.
 */
export async function fetchAvailableSports(apiKey) {
  const res = await fetch(`${BASE}/sports?apiKey=${apiKey}&all=true`);
  if (!res.ok) throw new Error(`Odds API ${res.status}`);
  return res.json();
}

/**
 * Fetch futures for all configured sport keys in parallel.
 * Returns a flat list of OutrightEvent objects.
 */
export async function fetchAllFuturesOdds(apiKey, sportKeys = ALL_SPORT_KEYS, options = {}) {
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
 * Get remaining API quota from last response headers.
 * (The Odds API returns x-requests-remaining and x-requests-used headers.)
 */
export async function checkQuota(apiKey) {
  const res = await fetch(`${BASE}/sports?apiKey=${apiKey}`);
  return {
    remaining: parseInt(res.headers.get('x-requests-remaining') ?? '-1'),
    used: parseInt(res.headers.get('x-requests-used') ?? '-1'),
  };
}
