const GAMMA_API = 'https://gamma-api.polymarket.com';
const FETCH_TIMEOUT_MS = 10000;
const PAGE_SIZE = 100; // Gamma API hard-caps each response at 100

// All known Polymarket sports tag slugs.
// Each tag is paginated so we collect futures AND game-level markets.
const SPORTS_TAG_SLUGS = [
  // Major US leagues
  'nfl', 'nba', 'mlb', 'nhl',
  // College
  'ncaaf', 'ncaab',
  // Soccer
  'soccer', 'mls', 'premier-league', 'champions-league', 'world-cup',
  // Combat sports
  'ufc', 'boxing',
  // Individual sports
  'golf', 'tennis', 'racing',
  // Playoffs / postseason (separate tags Polymarket uses during playoffs)
  'nba-playoffs', 'nhl-playoffs', 'mlb-playoffs', 'nfl-playoffs',
  // Broad catch-all
  'sports',
];

export async function fetchSportsMarkets(options = {}) {
  const {
    sports    = SPORTS_TAG_SLUGS,
    limit     = 1000, // per-tag ceiling; pagination fetches as many as exist up to this
    activeOnly = true,
  } = options;

  // Fetch all tags IN PARALLEL
  const settled = await Promise.allSettled(
    sports.map(tag => fetchTag(tag, limit, activeOnly))
  );

  const seen       = new Set();
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

// Fetch all pages for a single tag slug.  The Gamma API returns at most
// PAGE_SIZE (100) results per request, so we loop until we get a partial
// page (meaning we've hit the end) or until we reach `limit`.
async function fetchTag(tag, limit, activeOnly) {
  const items = [];

  for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const params = new URLSearchParams({
        tag_slug: tag,
        active:   activeOnly ? 'true' : 'false',
        closed:   'false',
        limit:    String(PAGE_SIZE),
        offset:   String(offset),
      });

      const res = await fetch(`${GAMMA_API}/markets?${params}`, {
        headers: { Accept: 'application/json' },
        signal:  controller.signal,
      });

      if (!res.ok) break;

      const data = await res.json();
      const page = Array.isArray(data) ? data : data.markets ?? data.data ?? [];
      items.push(...page.map(normalizeMarket));

      // Partial page → no more results for this tag
      if (page.length < PAGE_SIZE) break;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  return items;
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
    url:       m.url
               ? (m.url.startsWith('http') ? m.url : `https://polymarket.com${m.url}`)
               : `https://polymarket.com/event/${m.slug ?? m.id}`,
    slug:      m.slug ?? '',
  };
}

export async function fetchMarketById(id) {
  const res = await fetch(`${GAMMA_API}/markets/${id}`);
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
  return normalizeMarket(await res.json());
}
