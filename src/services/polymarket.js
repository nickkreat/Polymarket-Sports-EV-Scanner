const GAMMA_API = 'https://gamma-api.polymarket.com';
const FETCH_TIMEOUT_MS = 8000;

// Focused list — covers all real Polymarket sports tags without fetching
// dozens of slugs that return zero results.
const SPORTS_TAG_SLUGS = [
  'nfl', 'nba', 'mlb', 'nhl',
  'ncaaf', 'ncaab',
  'soccer', 'mls',
  'ufc', 'boxing',
  'golf', 'tennis', 'racing',
  'sports',
];

export async function fetchSportsMarkets(options = {}) {
  const {
    sports   = SPORTS_TAG_SLUGS,
    limit    = 200,
    activeOnly = true,
  } = options;

  // Fetch all tags IN PARALLEL — avoids sequential 28×1-2s waterfall
  const settled = await Promise.allSettled(
    sports.map(tag => fetchTag(tag, limit, activeOnly))
  );

  const seen      = new Set();
  const allMarkets = [];

  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const m of r.value) {
      if (m.id && !seen.has(m.id)) {
        seen.add(m.id);
        allMarkets.push(m);
      }
    }
  }

  return allMarkets;
}

async function fetchTag(tag, limit, activeOnly) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      tag_slug: tag,
      active:   activeOnly ? 'true' : 'false',
      closed:   'false',
      limit:    String(limit),
      offset:   '0',
    });

    const res = await fetch(`${GAMMA_API}/markets?${params}`, {
      headers: { Accept: 'application/json' },
      signal:  controller.signal,
    });

    if (!res.ok) return [];

    const data  = await res.json();
    const items = Array.isArray(data) ? data : data.markets ?? data.data ?? [];
    return items.map(normalizeMarket);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMarket(m) {
  let outcomes;
  try {
    outcomes = m.outcomes
      ? Array.isArray(m.outcomes) ? m.outcomes : JSON.parse(m.outcomes)
      : ['Yes', 'No'];
  } catch { outcomes = ['Yes', 'No']; }

  let prices;
  try {
    prices = m.outcomePrices
      ? Array.isArray(m.outcomePrices)
        ? m.outcomePrices.map(Number)
        : JSON.parse(m.outcomePrices).map(Number)
      : outcomes.map(() => 1 / outcomes.length);
  } catch { prices = outcomes.map(() => 1 / outcomes.length); }

  const tags = Array.isArray(m.tags)
    ? m.tags
    : [];

  return {
    id:        m.id ?? m.conditionId,
    question:  m.question ?? m.title ?? '',
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
