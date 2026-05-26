const BASE = 'https://api.the-odds-api.com/v4';

// Core sports always fetched
export const SPORT_KEYS = {
  // American football
  NFL:   'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf',
  // Basketball
  NBA:   'basketball_nba',
  NCAAB: 'basketball_ncaab',
  // Baseball
  MLB:   'baseball_mlb',
  // Hockey
  NHL:   'icehockey_nhl',
  // Soccer
  MLS:   'soccer_usa_mls',
  EPL:   'soccer_epl',
  UCL:   'soccer_uefa_champs_league',
  // MMA
  UFC:   'mma_mixed_martial_arts',
  // Tennis – ATP Grand Slams
  TENNIS_AUS_OPEN_M:    'tennis_atp_aus_open',
  TENNIS_FRENCH_OPEN_M: 'tennis_atp_french_open',
  TENNIS_WIMBLEDON_M:   'tennis_atp_wimbledon',
  TENNIS_US_OPEN_M:     'tennis_atp_us_open',
  // Tennis – WTA Grand Slams
  TENNIS_AUS_OPEN_W:    'tennis_wta_aus_open',
  TENNIS_FRENCH_OPEN_W: 'tennis_wta_french_open',
  TENNIS_WIMBLEDON_W:   'tennis_wta_wimbledon',
  TENNIS_US_OPEN_W:     'tennis_wta_us_open',
  // Golf – Majors
  GOLF_MASTERS:     'golf_masters_tournament_winner',
  GOLF_PGA_CHAMP:   'golf_pga_championship_winner',
  GOLF_US_OPEN:     'golf_us_open_winner',
  GOLF_THE_OPEN:    'golf_the_open_championship_winner',
  GOLF_PGA_TOUR:    'golf_pga_tour_winner',
  // Motorsport
  NASCAR: 'motorsport_nascar_cup_series',
  F1:     'motorsport_formula_one_winner',
};

export const ALL_SPORT_KEYS = Object.values(SPORT_KEYS);

/**
 * Fetch outrights (futures) for a single sport.
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
    throw new Error(`Odds API ${res.status} for ${sportKey}: ${body}`);
  }

  return res.json();
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
 * Fetch futures for all configured sport keys in parallel.
 * Uses Promise.allSettled so one bad key never blocks others.
 * Returns a flat list of outright event objects.
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
    // Silently skip rejected (e.g., off-season sport, invalid key)
  }
  return events;
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
