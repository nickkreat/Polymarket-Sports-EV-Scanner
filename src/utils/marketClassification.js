/**
 * Map Polymarket sportsMarketType → sportsbook market keys we fetch from The Odds API.
 * Anything else with a known sportsMarketType has no direct sportsbook line — skip it.
 */
const POLY_TYPE_TO_BOOK = {
  moneyline:            'h2h',
  child_moneyline:      'h2h',
  first_half_moneyline: 'h2h',
  spreads:              'spreads',
  first_half_spreads:   'spreads',
  totals:               'totals',
  first_half_totals:    'totals',
};

/** Types that must never be matched to h2h/spreads/totals outright pools. */
const SKIP_SPORTS_MARKET_TYPES = new Set([
  'parlays',
  'nrfi',
  'points',
  'rebounds',
  'assists',
  'assists_points_rebounds',
  'anytime_touchdowns',
  'basketball_odd_even',
  'basketball_quarter_score',
  'basketball_team_to_score_first',
  'both_teams_to_score',
  'correct_score',
  'double_chance',
  'total_goals',
  'total_corners',
  'ufc_method_of_victory',
  'combat_method_of_victory',
  'soccer_anytime_goalscorer',
]);

function marketText(market) {
  return `${market.question ?? ''} ${market.eventTitle ?? ''} ${market.description ?? ''} ${market.eventDescription ?? ''}`.toLowerCase();
}

export function isParlayOrComboMarket(market) {
  if (market.showGmpSeries || market.showGmpOutcome) return true;
  const type = (market.sportsMarketType ?? '').toLowerCase();
  if (type === 'parlays') return true;

  const text = marketText(market);
  if (/\b(?:same[- ]game parlay|sgp|parlay market|combo bet|multi[- ]leg)\b/.test(text)) return true;
  // Multi-condition: win/cover AND over/under (joint parlay, not a straight line)
  if (/\b(?:win|beat|cover|moneyline|\bml\b)\b/.test(text) &&
      /\b(?:and|\+)\b/.test(text) &&
      /\b(?:over|under|o\/u|total)\b/.test(text)) {
    return true;
  }
  return false;
}

export function isPlayerOrTeamPropMarket(market) {
  const type = (market.sportsMarketType ?? '').toLowerCase();
  if (SKIP_SPORTS_MARKET_TYPES.has(type)) return true;
  if (type && !POLY_TYPE_TO_BOOK[type]) return true;

  const text = marketText(market);
  if (/\b(?:player|anytime|first to score|method of victory|top batter|touchdown scorer)\b/.test(text)) {
    return true;
  }
  if (/\b(?:team total|player total|total bases|total points|total rebounds|total assists)\b/.test(text)) {
    return true;
  }
  return false;
}

/**
 * Resolve how a Polymarket market should be matched against sportsbook odds.
 * @returns {{ skip: boolean, reason?: string, bookType?: 'h2h'|'spreads'|'totals'|'outrights', line?: number|null, source: 'api'|'question' }}
 */
export function classifyPolymarketMarket(market, { isChampionship = false } = {}) {
  if (isParlayOrComboMarket(market)) {
    return { skip: true, reason: 'parlay/combo', source: 'api' };
  }

  const polyType = (market.sportsMarketType ?? '').toLowerCase();
  if (polyType) {
    const bookType = POLY_TYPE_TO_BOOK[polyType];
    if (bookType) {
      return {
        skip: false,
        bookType,
        line: market.line != null && !Number.isNaN(Number(market.line)) ? Number(market.line) : null,
        source: 'api',
      };
    }
    return { skip: true, reason: polyType || 'unsupported sportsMarketType', source: 'api' };
  }

  if (isPlayerOrTeamPropMarket(market)) {
    return { skip: true, reason: 'player/team prop', source: 'question' };
  }

  if (isChampionship) {
    return { skip: false, bookType: 'outrights', line: null, source: 'question' };
  }

  return { skip: false, bookType: null, line: market.line ?? null, source: 'question' };
}

export function extractLineFromMarket(market, bookType) {
  if (market.line != null && !Number.isNaN(Number(market.line))) {
    return Number(market.line);
  }
  return null;
}
