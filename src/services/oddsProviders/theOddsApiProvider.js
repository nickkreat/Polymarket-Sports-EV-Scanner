import {
  fetchAllFuturesOdds,
  fetchAllH2HOdds,
  fetchAllSpreadsOdds,
  fetchAllTotalsOdds,
  fetchRelevantSportKeys,
} from '../oddsApi.js';
import { fetchOddsPapiGolfOutrights } from './oddsPapi.js';
import { fetchDraftKingsGolfOutrights } from './draftKingsGolf.js';
import { mergeOddsEventPools } from './shared.js';

/**
 * Fetch all odds events from The Odds API (primary source for US game lines + major golf).
 */
export async function fetchTheOddsApiEvents(settings, onStatus) {
  const apiKey = settings.oddsApiKey;
  if (!apiKey) {
    return {
      events: [],
      meta: { skipped: true, reason: 'no The Odds API key' },
      sportKeys: null,
    };
  }

  onStatus?.('scanning — discovering available sports…');
  const { futuresSportKeys, h2hSportKeys } = await fetchRelevantSportKeys(apiKey);

  onStatus?.('scanning — fetching sportsbook futures odds…');
  const futuresEvents = await fetchAllFuturesOdds(apiKey, futuresSportKeys, {
    regions: settings.preferredRegions,
  });

  onStatus?.('scanning — fetching sportsbook game odds…');
  const h2hEvents = await fetchAllH2HOdds(apiKey, h2hSportKeys, {
    regions: settings.preferredRegions,
  });

  onStatus?.('scanning — fetching sportsbook spread/handicap odds…');
  const spreadsEvents = await fetchAllSpreadsOdds(apiKey, h2hSportKeys, {
    regions: settings.preferredRegions,
  });

  onStatus?.('scanning — fetching sportsbook over/under odds…');
  const totalsEvents = await fetchAllTotalsOdds(apiKey, h2hSportKeys, {
    regions: settings.preferredRegions,
  });

  const events = [...futuresEvents, ...h2hEvents, ...spreadsEvents, ...totalsEvents];

  return {
    events,
    sportKeys: { futuresSportKeys, h2hSportKeys },
    meta: {
      futures: futuresEvents.length,
      h2h: h2hEvents.length,
      spreads: spreadsEvents.length,
      totals: totalsEvents.length,
      total: events.length,
    },
  };
}

/**
 * Merge primary (The Odds API) + supplemental golf sources.
 */
export async function fetchAllOddsEvents(settings, onStatus) {
  const primary = await fetchTheOddsApiEvents(settings, onStatus);
  let supplemental = [];
  const sources = {
    theOddsApi: primary.meta,
  };

  if (settings.oddspApiKey && settings.enableOddsPapi !== false) {
    onStatus?.('scanning — fetching OddsPapi PGA Tour odds…');
    const papi = await fetchOddsPapiGolfOutrights(settings.oddspApiKey);
    sources.oddsPapi = papi.meta;
    supplemental = supplemental.concat(papi.events);
    console.debug('[Scanner] OddsPapi golf:', papi.meta, `${papi.events.length} events`);
  }

  if (settings.enableDraftKingsGolfFallback !== false) {
    onStatus?.('scanning — trying DraftKings golf fallback…');
    const dk = await fetchDraftKingsGolfOutrights();
    sources.draftKingsGolf = dk.meta;
    if (dk.events.length) {
      supplemental = supplemental.concat(dk.events);
      console.debug('[Scanner] DraftKings golf fallback:', dk.meta);
    }
  }

  const events = supplemental.length
    ? mergeOddsEventPools(primary.events, supplemental)
    : primary.events;

  return {
    events,
    sportKeys: primary.sportKeys,
    sources,
    meta: {
      ...primary.meta,
      supplemental: supplemental.length,
      mergedTotal: events.length,
    },
  };
}
