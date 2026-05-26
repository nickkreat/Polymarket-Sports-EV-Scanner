const GAMMA_API = 'https://gamma-api.polymarket.com';

const SPORTS_TAG_SLUGS = [
  'nfl', 'nba', 'mlb', 'nhl', 'ncaa', 'soccer', 'sports',
  'mls', 'ncaaf', 'ncaab', 'ufc', 'boxing',
];

export async function fetchSportsMarkets(options = {}) {
  const {
    sports = SPORTS_TAG_SLUGS,
    limit = 100,
    activeOnly = true,
  } = options;

  const allMarkets = [];

  // Fetch each tag; dedupe by market id
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
  const outcomes = m.outcomes
    ? Array.isArray(m.outcomes)
      ? m.outcomes
      : JSON.parse(m.outcomes)
    : ['Yes', 'No'];

  const prices = m.outcomePrices
    ? Array.isArray(m.outcomePrices)
      ? m.outcomePrices.map(Number)
      : JSON.parse(m.outcomePrices).map(Number)
    : [0.5, 0.5];

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
    prices, // [yesPrice, noPrice]
    volume: parseFloat(m.volume ?? m.volumeNum ?? 0),
    liquidity: parseFloat(m.liquidity ?? m.liquidityNum ?? 0),
    endDate: m.endDate ?? m.endDateIso ?? null,
    active: m.active ?? true,
    closed: m.closed ?? false,
    tags: tags.map(t => (typeof t === 'string' ? t : t.slug ?? t.label ?? '')),
    url: m.url ?? `https://polymarket.com/event/${m.slug ?? m.id}`,
    slug: m.slug ?? '',
  };
}

export async function fetchMarketById(id) {
  const res = await fetch(`${GAMMA_API}/markets/${id}`);
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
  return normalizeMarket(await res.json());
}
