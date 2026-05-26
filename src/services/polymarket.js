const GAMMA_API = 'https://gamma-api.polymarket.com';

// All sports/racing tag slugs to fetch from Polymarket
const SPORTS_TAG_SLUGS = [
  // Team sports
  'nfl', 'nba', 'mlb', 'nhl',
  // College
  'ncaa', 'ncaaf', 'ncaab',
  // Soccer
  'soccer', 'mls', 'epl', 'champions-league',
  // Combat sports
  'ufc', 'boxing', 'mma',
  // Golf
  'golf', 'pga', 'masters',
  // Tennis
  'tennis', 'atp', 'wta', 'wimbledon', 'us-open',
  // Motorsport / Racing
  'racing', 'nascar', 'formula-1', 'f1', 'motorsport',
  // Catch-all
  'sports',
];

export async function fetchSportsMarkets(options = {}) {
  const {
    sports = SPORTS_TAG_SLUGS,
    limit = 200,
    activeOnly = true,
  } = options;

  const allMarkets = [];
  const seen = new Set();

  for (const tag of sports) {
    const params = new URLSearchParams({
      tag_slug: tag,
      active: activeOnly ? 'true' : 'false',
      closed: 'false',
      limit: String(limit),
      offset: '0',
    });

    try {
      const res = await fetch(`${GAMMA_API}/markets?${params}`, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) continue;

      const data = await res.json();
      const items = Array.isArray(data) ? data : data.markets ?? data.data ?? [];

      for (const m of items) {
        const id = m.id ?? m.conditionId;
        if (id && !seen.has(id)) {
          seen.add(id);
          allMarkets.push(normalizeMarket(m));
        }
      }
    } catch {
      // Skip failed tags silently
    }
  }

  return allMarkets;
}

function normalizeMarket(m) {
  let outcomes;
  try {
    outcomes = m.outcomes
      ? Array.isArray(m.outcomes)
        ? m.outcomes
        : JSON.parse(m.outcomes)
      : ['Yes', 'No'];
  } catch {
    outcomes = ['Yes', 'No'];
  }

  let prices;
  try {
    prices = m.outcomePrices
      ? Array.isArray(m.outcomePrices)
        ? m.outcomePrices.map(Number)
        : JSON.parse(m.outcomePrices).map(Number)
      : outcomes.map(() => 1 / outcomes.length);
  } catch {
    prices = outcomes.map(() => 1 / outcomes.length);
  }

  const tags = m.tags
    ? Array.isArray(m.tags)
      ? m.tags
      : []
    : [];

  return {
    id: m.id ?? m.conditionId,
    question: m.question ?? m.title ?? '',
    description: m.description ?? '',
    outcomes,
    prices,
    volume:    parseFloat(m.volume    ?? m.volumeNum    ?? 0),
    liquidity: parseFloat(m.liquidity ?? m.liquidityNum ?? 0),
    endDate:   m.endDate ?? m.endDateIso ?? null,
    active:    m.active  ?? true,
    closed:    m.closed  ?? false,
    tags:      tags.map(t => (typeof t === 'string' ? t : t.slug ?? t.label ?? '')),
    url:       m.url ?? `https://polymarket.com/event/${m.slug ?? m.id}`,
    slug:      m.slug ?? '',
  };
}

export async function fetchMarketById(id) {
  const res = await fetch(`${GAMMA_API}/markets/${id}`);
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
  return normalizeMarket(await res.json());
}
