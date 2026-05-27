const GAMMA_API = 'https://gamma-api.polymarket.com';
const FETCH_TIMEOUT_MS = 10000;
const PAGE_SIZE = 100;

// Only tag slugs confirmed to exist in Polymarket's Gamma API.
// Fake/guessed slugs (nba-playoffs, premier-league, etc.) cause HTTP 500
// errors on every paginated request and flood the console.
const SPORTS_TAG_SLUGS = [
  'nfl', 'nba', 'mlb', 'nhl',
  'ncaaf', 'ncaab',
  'soccer', 'mls',
  'ufc', 'boxing',
  'golf', 'tennis', 'racing',
  'sports',
];

// Cap per-tag pagination at 300.  Most sport tags have far fewer than 300
// active markets; going to 1000 just generates 500 errors at high offsets.
const MAX_PER_TAG = 300;

export async function fetchSportsMarkets(options = {}) {
  const {
    sports     = SPORTS_TAG_SLUGS,
    activeOnly = true,
  } = options;

  const settled = await Promise.allSettled(
    sports.map(tag => fetchTag(tag, activeOnly))
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

async function fetchTag(tag, activeOnly) {
  const items = [];

  for (let offset = 0; offset < MAX_PER_TAG; offset += PAGE_SIZE) {
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
      if (page.length === 0) break;

      items.push(...page.map(normalizeMarket));

      if (page.length < PAGE_SIZE) break;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  return items;
}

// Log the first raw market object so the URL fields are visible in DevTools.
// This runs once per page load and helps verify the URL construction is correct.
let _logged = false;

function buildUrl(m) {
  // Log every field of the first market to find the correct URL slug field
  if (!_logged) {
    _logged = true;
    console.log('[Polymarket] First raw market (all fields):', JSON.parse(JSON.stringify(m)));
  }

  // m.url is the most reliable source — use it if it's an absolute URL
  if (m.url && m.url.startsWith('http')) return m.url;
  if (m.url && m.url.startsWith('/'))    return `https://polymarket.com${m.url}`;

  // Fallback: construct from slug fields.
  // Polymarket event URLs use the EVENT slug, not the market slug.
  // Market slugs often include an outcome suffix (-yes, -no) that 404s.
  // Try known field names for the event/group slug first.
  const eventSlug = (
    m.groupSlug       ??   // common alias
    m.eventSlug       ??   // alternative alias
    m.marketSlug      ??   // another alternative
    m.slug            ??   // fallback: market slug (strip outcome suffix below)
    String(m.id ?? '')
  );

  // Strip outcome suffixes like "-yes", "-no", "-0", "-1" from market slugs
  const cleanSlug = eventSlug.replace(/[_-](yes|no|\d+)$/i, '');

  return `https://polymarket.com/event/${cleanSlug}`;
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

  const tags = Array.isArray(m.tags) ? m.tags : [];

  return {
    id:          m.id ?? m.conditionId,
    question:    m.question ?? m.title ?? '',
    description: m.description ?? '',
    outcomes,
    prices,
    volume:    parseFloat(m.volume    ?? m.volumeNum    ?? 0),
    liquidity: parseFloat(m.liquidity ?? m.liquidityNum ?? 0),
    endDate:   m.endDate ?? m.endDateIso ?? null,
    active:    m.active  ?? true,
    closed:    m.closed  ?? false,
    tags:      tags.map(t => (typeof t === 'string' ? t : t.slug ?? t.label ?? '')),
    url:       buildUrl(m),
    slug:      m.groupSlug ?? m.slug ?? '',
  };
}

export async function fetchMarketById(id) {
  const res = await fetch(`${GAMMA_API}/markets/${id}`);
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
  return normalizeMarket(await res.json());
}
