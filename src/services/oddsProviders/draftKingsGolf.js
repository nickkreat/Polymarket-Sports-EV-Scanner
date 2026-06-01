import { buildOutrightEvent, getCached, setCached } from './shared.js';
import { decimalToAmerican } from '../../utils/odds.js';

/**
 * Best-effort DraftKings golf outright fetch from the browser.
 * DraftKings blocks most server-side requests; this may work in the user's browser session.
 * Returns [] silently on failure — use OddsPapi when possible.
 */
const DK_GOLF_URLS = [
  'https://sportsbook.draftkings.com/sites/US-SB/api/v5/eventgroups/8827/categories/492/subcategories/4518',
  'https://sportsbook.draftkings.com/sites/US-SB/api/v5/eventgroups/8827/categories/492/subcategories/4519',
];

const BOOK = { key: 'draftkings', title: 'DraftKings' };

function parseDraftKingsPayload(data, eventTitleHint = 'PGA Tour') {
  const offers = [];
  const categories = data?.eventGroup?.offerCategories ?? data?.offerCategories ?? [];
  for (const cat of categories) {
    for (const sub of cat.offerSubcategoryDescriptors ?? []) {
      const subCat = sub.offerSubcategory ?? sub;
      for (const offerArr of subCat.offers ?? []) {
        for (const offer of offerArr ?? []) {
          offers.push(offer);
        }
      }
    }
  }

  const outcomes = [];
  for (const offer of offers) {
    const label = String(offer.label ?? offer.description ?? '').toLowerCase();
    if (label && !/winner|outright|tournament|to win/.test(label) && !/charles schwab|pga|golf/.test(label)) {
      continue;
    }
    for (const participant of offer.participants ?? []) {
      const name = participant.name?.trim();
      const american = decimalToAmerican(participant.oddsDecimal ?? participant.displayOdds?.decimal);
      if (!name || american == null) continue;
      outcomes.push({ name, price: american });
    }
  }

  if (outcomes.length < 5) return [];

  const title = data?.eventGroup?.name ?? data?.eventGroupName ?? eventTitleHint;
  return [buildOutrightEvent({
    id: `draftkings-golf-${title.toLowerCase().replace(/\s+/g, '-')}`,
    sportKey: 'golf_pga_tour',
    title,
    commenceTime: null,
    bookmakers: [{
      ...BOOK,
      markets: [{ key: 'outrights', outcomes }],
    }],
    source: 'draftkings-golf',
  })];
}

export async function probeDraftKingsGolf() {
  const errors = [];
  for (const url of DK_GOLF_URLS) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
      });
      if (!res.ok) {
        errors.push(`${res.status} ${url}`);
        continue;
      }
      const data = await res.json();
      const events = parseDraftKingsPayload(data);
      if (events.length) {
        const players = events[0].bookmakers[0].markets[0].outcomes.slice(0, 8).map(o => o.name);
        return {
          ok: true,
          charlesSchwabFound: /charles schwab|colonial/i.test(events[0].home_team ?? ''),
          samplePlayers: players,
          playerCount: events[0].bookmakers[0].markets[0].outcomes.length,
        };
      }
    } catch (err) {
      errors.push(err.message ?? String(err));
    }
  }
  return {
    ok: false,
    charlesSchwabFound: false,
    error: errors.join('; ') || 'DraftKings golf endpoint unavailable (often blocked by CORS or geo)',
  };
}

export async function fetchDraftKingsGolfOutrights() {
  const cacheKey = 'dk-golf-outrights';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = { events: [], meta: { source: 'draftkings-golf' } };
  for (const url of DK_GOLF_URLS) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit' });
      if (!res.ok) continue;
      const data = await res.json();
      const events = parseDraftKingsPayload(data);
      if (events.length) {
        result.events = events;
        result.meta.playerCount = events[0]?.bookmakers?.[0]?.markets?.[0]?.outcomes?.length ?? 0;
        result.meta.title = events[0]?.home_team;
        break;
      }
    } catch {
      // browser CORS / geo — fall through
    }
  }

  if (result.events.length) setCached(cacheKey, result);
  else result.meta.skipped = true;
  return result;
}
