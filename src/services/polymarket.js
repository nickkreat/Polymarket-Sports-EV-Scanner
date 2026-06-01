const GAMMA_API = 'https://gamma-api.polymarket.com';
const FETCH_TIMEOUT_MS = 10000;
const PAGE_SIZE = 100;

// Only tag slugs confirmed to exist in Polymarket's Gamma API.
const SPORTS_TAG_SLUGS = [
  'nfl', 'nba', 'mlb', 'nhl',
  'ncaaf', 'ncaab',
  'soccer', 'mls',
  'ufc', 'boxing',
  'golf', 'tennis', 'racing',
  'sports',
];

// Cap per-tag pagination at 300 events.
const MAX_PER_TAG = 300;

export async function fetchSportsMarkets(options = {}) {
  const {
    sports     = SPORTS_TAG_SLUGS,
    activeOnly = true,
  } = options;

  const settled = await Promise.allSettled(
    sports.map(tag => fetchEventsByTag(tag, activeOnly))
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

// Fetch via the /events endpoint (which correctly filters by tag_slug) and
// extract all markets from the nested events[].markets array.
// The /markets?tag_slug= endpoint is broken server-side — it returns the same
// irrelevant data (GTA VI, Harvey Weinstein, etc.) regardless of which tag is
// requested. The /events endpoint works correctly.
async function fetchEventsByTag(tag, activeOnly) {
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

      const res = await fetch(`${GAMMA_API}/events?${params}`, {
        headers: { Accept: 'application/json' },
        signal:  controller.signal,
      });

      if (!res.ok) break;

      const data   = await res.json();
      const events = Array.isArray(data) ? data : data.events ?? data.data ?? [];
      if (events.length === 0) break;

      // Each event contains a markets array — flatten them all, injecting the
      // parent event so normalizeMarket can read its slug and tags.
      for (const event of events) {
        if (!Array.isArray(event.markets)) continue;
        for (const market of event.markets) {
          items.push(normalizeMarket({ ...market, _parentEvent: event }));
        }
      }

      if (events.length < PAGE_SIZE) break;
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  return items;
}

function buildUrl(m) {
  if (m.url && m.url.startsWith('http')) return m.url;
  if (m.url && m.url.startsWith('/'))    return `https://polymarket.com${m.url}`;

  // When fetched via /events, the parent event slug is the canonical URL slug.
  const eventSlug =
    m._parentEvent?.slug ??  // injected by fetchEventsByTag
    m.events?.[0]?.slug ??   // fallback when fetched via /markets/{id}
    null;
  if (eventSlug) return `https://polymarket.com/event/${eventSlug}`;

  const marketSlug = m.groupSlug ?? m.slug ?? String(m.id ?? '');
  const cleanSlug  = marketSlug.replace(/[_-](yes|no|\d+)$/i, '');
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

  // Tags come from the injected _parentEvent (set by fetchEventsByTag) or from
  // the events[0] sub-object when fetched via /markets/{id}.
  // The /markets endpoint never returns a top-level tags field.
  const parentEvent = m._parentEvent ?? m.events?.[0] ?? null;
  const rawTags     = Array.isArray(parentEvent?.tags) ? parentEvent.tags : [];

  const lineRaw = m.line ?? m.groupItemThreshold;
  const lineNum = lineRaw != null && lineRaw !== '' ? Number(lineRaw) : null;

  return {
    id:          m.id ?? m.conditionId,
    question:    m.question ?? m.title ?? '',
    description: m.description ?? '',
    outcomes,
    prices,
    volume:     parseFloat(m.volume    ?? m.volumeNum    ?? 0),
    liquidity:  parseFloat(m.liquidity ?? m.liquidityNum ?? 0),
    endDate:    m.endDate ?? m.endDateIso ?? null,
    active:     m.active  ?? true,
    closed:     m.closed  ?? false,
    tags:       rawTags.map(t => (typeof t === 'string' ? t : t.slug ?? t.label ?? '')),
    url:        buildUrl(m),
    slug:       parentEvent?.slug ?? m.groupSlug ?? m.slug ?? '',
    eventTitle: parentEvent?.title ?? null,
    eventDescription: parentEvent?.description ?? '',
    sportsMarketType: m.sportsMarketType ?? null,
    line: Number.isFinite(lineNum) ? lineNum : null,
    gameId: m.gameId ?? null,
    showGmpSeries: Boolean(m.showGmpSeries),
    showGmpOutcome: Boolean(m.showGmpOutcome),
    groupItemTitle: m.groupItemTitle ?? '',
  };
}

export async function fetchMarketById(id) {
  const res = await fetch(`${GAMMA_API}/markets/${id}`);
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
  return normalizeMarket(await res.json());
}
