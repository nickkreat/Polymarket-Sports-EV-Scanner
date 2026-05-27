import { useState, useCallback, useRef } from 'react';
import { fetchSportsMarkets } from '../services/polymarket';
import { fetchAllFuturesOdds, fetchAllH2HOdds, fetchRelevantSportKeys, CORE_SPORT_KEYS } from '../services/oddsApi';
import { americanToImplied } from '../utils/odds';
import { evPercent, kellySizingYes, kellySizingNo } from '../utils/kelly';
import { extractTeamFromQuestion, teamMatchScore, isSportsMarket } from '../utils/matching';

const MIN_MATCH_SCORE = 0.66;

export function useScanner(settings) {
  const [opportunities, setOpportunities]   = useState([]);
  const [status, setStatus]                 = useState('idle');
  const [error, setError]                   = useState(null);
  const [lastScanned, setLastScanned]       = useState(null);
  const [scanStats, setScanStats]           = useState(null);
  const [quotaRemaining, setQuotaRemaining] = useState(null);
  const abortRef = useRef(null);

  const scan = useCallback(async () => {
    if (status === 'scanning') return;
    if (!settings.oddsApiKey) {
      setError('Please enter your Odds API key in Settings first.');
      setStatus('error');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('scanning');
    setError(null);
    setOpportunities([]);
    setScanStats(null);

    try {
      setStatus('scanning — fetching Polymarket sports markets…');
      const polyMarkets = await fetchSportsMarkets();
      console.debug(`[Scanner] Polymarket: fetched ${polyMarkets.length} markets`);
      if (polyMarkets.length > 0) {
        console.debug('[Scanner] Sample questions:', polyMarkets.slice(0, 5).map(m => m.question));
      }

      setStatus('scanning — discovering available sports…');
      const sportKeys = await fetchRelevantSportKeys(settings.oddsApiKey);
      console.debug(`[Scanner] Sport keys to fetch (${sportKeys.length}):`, sportKeys);

      setStatus('scanning — fetching sportsbook futures odds…');
      const futuresEvents = await fetchAllFuturesOdds(
        settings.oddsApiKey,
        sportKeys,
        { regions: settings.preferredRegions }
      );
      console.debug(`[Scanner] Odds API futures: ${futuresEvents.length} events`);

      setStatus('scanning — fetching sportsbook game odds…');
      const h2hEvents = await fetchAllH2HOdds(
        settings.oddsApiKey,
        CORE_SPORT_KEYS,
        { regions: settings.preferredRegions }
      );
      console.debug(`[Scanner] Odds API H2H: ${h2hEvents.length} game events`);

      const oddsEvents = [...futuresEvents, ...h2hEvents];
      console.debug(`[Scanner] Odds API total: ${oddsEvents.length} events (${futuresEvents.length} futures + ${h2hEvents.length} games)`);
      if (oddsEvents.length > 0) {
        console.debug('[Scanner] Sample events:', oddsEvents.slice(0, 3).map(e => ({
          sport: e.sport_key,
          books: e.bookmakers?.length,
          marketTypes: [...new Set(e.bookmakers?.flatMap(b => b.markets?.map(m => m.key) ?? []))],
          sampleOutcomes: e.bookmakers?.[0]?.markets?.[0]?.outcomes?.slice(0, 3).map(o => o.name),
        })));
      }

      setStatus('scanning — computing EV…');
      const { results, stats } = await buildOpportunities(polyMarkets, oddsEvents, settings);
      console.debug('[Scanner] Match stats:', stats);
      console.debug(`[Scanner] Found ${results.length} opportunities`);

      setOpportunities(results);
      setLastScanned(new Date());
      setScanStats({
        polyMarketsScanned:       polyMarkets.length,
        oddsEventsScanned:        oddsEvents.length,
        futuresEventsScanned:     futuresEvents.length,
        h2hEventsScanned:         h2hEvents.length,
        skippedNonSports:         stats.skippedNonSports,
        binaryMarketsChecked:     stats.binaryChecked,
        binaryNoQuestionMatch:    stats.binaryNoQuestion,
        binaryNoOddsMatch:        stats.binaryNoOddsMatch,
        multiOutcomesChecked:     stats.multiChecked,
        multiNoOddsMatch:         stats.multiNoOddsMatch,
        filteredByLiquidity:      stats.filteredLiquidity,
        filteredByEv:             stats.filteredEv,
        matchedMarkets:           results.length,
        positiveEv:               results.filter(r => r.evPct > 0).length,
      });
      setStatus('done');
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[Scanner] Error:', err);
      setError(err.message ?? 'Unknown error during scan');
      setStatus('error');
    }
  }, [settings, status]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, []);

  return { opportunities, status, error, lastScanned, scanStats, quotaRemaining, scan, stop };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBinaryYesNo(outcomes) {
  if (outcomes.length !== 2) return false;
  const lower = outcomes.map(o => String(o).toLowerCase().trim());
  return lower.includes('yes') && lower.includes('no');
}

// Yield to the browser event loop so the page stays responsive.
function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ── Core matching + EV engine ─────────────────────────────────────────────────

async function buildOpportunities(polyMarkets, oddsEvents, settings) {
  const results = [];
  const bankroll    = settings.bankroll    ?? 1000;
  const fraction    = settings.kellyFraction ?? 0.5;
  const maxKellyPct = (settings.maxKellyPct ?? 25) / 100;

  // Per-step diagnostic counters
  const stats = {
    binaryChecked:    0,
    binaryNoQuestion: 0,
    binaryNoOddsMatch:0,
    multiChecked:     0,
    multiNoOddsMatch: 0,
    filteredLiquidity:0,
    filteredEv:       0,
    skippedNonSports: 0,
  };

  for (let idx = 0; idx < polyMarkets.length; idx++) {
    // Yield every 20 markets so the browser can handle UI events
    if (idx > 0 && idx % 20 === 0) await yieldToBrowser();

    const market = polyMarkets[idx];
    const { outcomes, prices } = market;
    if (!outcomes?.length || !prices?.length) continue;
    if (outcomes.length !== prices.length) continue;

    // Skip political, financial, entertainment markets
    if (!isSportsMarket(market.question)) {
      stats.skippedNonSports++;
      continue;
    }

    // Normalise prices — Polymarket sometimes returns strings
    const normPrices = prices.map(Number);

    if (isBinaryYesNo(outcomes)) {
      // ── Binary YES/NO market ───────────────────────────────────────────────
      stats.binaryChecked++;

      const yesIdx   = outcomes.findIndex(o => String(o).toLowerCase() === 'yes');
      const yesPrice = normPrices[yesIdx >= 0 ? yesIdx : 0];
      const noPrice  = normPrices[yesIdx >= 0 ? 1 - yesIdx : 1];

      if (!yesPrice || yesPrice <= 0 || yesPrice >= 1) continue;

      const teamFromQuestion = extractTeamFromQuestion(market.question);
      if (!teamFromQuestion) {
        stats.binaryNoQuestion++;
        continue;
      }

      const match = findBestOddsMatch(teamFromQuestion, oddsEvents, market.tags, market.question);
      if (!match) {
        stats.binaryNoOddsMatch++;
        console.debug(`[Scanner] No odds match for: "${market.question}" → team="${teamFromQuestion}"`);
        continue;
      }

      const { trueProb, bestBook, bestOdds, noVigProb, totalBooks, event } = match;

      const yesEv    = evPercent(trueProb, yesPrice);
      const noEv     = evPercent(1 - trueProb, noPrice);
      const bestSide = yesEv >= noEv ? 'YES' : 'NO';
      const bestEv   = bestSide === 'YES' ? yesEv : noEv;

      if (market.liquidity < settings.minLiquidity) { stats.filteredLiquidity++; continue; }
      if (!settings.showNegativeEv && bestEv <= 0)  { stats.filteredEv++; continue; }
      if (bestEv < settings.minEvPct)               { stats.filteredEv++; continue; }

      // Flag extreme EV — likely a very stale/illiquid price, not a real edge
      const suspiciousEv = Math.abs(bestEv) > 500;
      if (suspiciousEv) {
        console.warn(`[Scanner] Extreme EV ${bestEv.toFixed(0)}% — verify manually: "${market.question}"`);
      }

      const kellySizing = bestSide === 'YES'
        ? kellySizingYes({ trueProb, marketPrice: yesPrice, bankroll, fraction })
        : kellySizingNo({ trueProb, marketPrice: noPrice, bankroll, fraction });
      const cappedPct = Math.min(kellySizing.adjustedPct, maxKellyPct);

      results.push({
        id: market.id,
        question: market.question,
        url:  market.url,
        sport: inferSport(market.tags, event?.sport_key),
        side:  bestSide,
        evPct: bestEv,
        marketPrice: bestSide === 'YES' ? yesPrice : noPrice,
        trueProb,
        noVigProb,
        yesPrice,
        noPrice,
        yesEv,
        noEv,
        bestBook,
        bestOdds,
        totalBooks,
        kelly: {
          fullKellyPct: kellySizing.kellyPct,
          adjustedPct:  cappedPct,
          betSize:      cappedPct * bankroll,
          fraction,
        },
        liquidity:  market.liquidity,
        volume:     market.volume,
        endDate:    market.endDate,
        event,
        isMultiOutcome: false,
        suspiciousEv,
      });

    } else if (outcomes.length >= 2) {
      // ── Multi-outcome market (e.g. "Who wins the Masters?") ───────────────
      // Each outcome IS the player/team name; treat each as a separate bet.
      for (let i = 0; i < outcomes.length; i++) {
        stats.multiChecked++;
        const outcomeName  = String(outcomes[i]);
        const outcomePrice = normPrices[i];

        if (!outcomeName || outcomeName.toLowerCase() === 'yes' || outcomeName.toLowerCase() === 'no') continue;
        if (!outcomePrice || outcomePrice <= 0 || outcomePrice >= 1) continue;

        const match = findBestOddsMatch(outcomeName, oddsEvents, market.tags, market.question);
        if (!match) {
          stats.multiNoOddsMatch++;
          continue;
        }

        const { trueProb, bestBook, bestOdds, noVigProb, totalBooks, event } = match;
        const ev = evPercent(trueProb, outcomePrice);

        if (market.liquidity < settings.minLiquidity) { stats.filteredLiquidity++; continue; }
        if (!settings.showNegativeEv && ev <= 0)      { stats.filteredEv++; continue; }
        if (ev < settings.minEvPct)                   { stats.filteredEv++; continue; }

        const kellySizing = kellySizingYes({ trueProb, marketPrice: outcomePrice, bankroll, fraction });
        const cappedPct   = Math.min(kellySizing.adjustedPct, maxKellyPct);

        results.push({
          id:       `${market.id}-${i}`,
          question: market.question,
          url:      market.url,
          sport:    inferSport(market.tags, event?.sport_key),
          side:     outcomeName,
          evPct:    ev,
          marketPrice: outcomePrice,
          trueProb,
          noVigProb,
          yesPrice:  outcomePrice,
          noPrice:   1 - outcomePrice,
          yesEv:     ev,
          noEv:      evPercent(1 - trueProb, 1 - outcomePrice),
          bestBook,
          bestOdds,
          totalBooks,
          kelly: {
            fullKellyPct: kellySizing.kellyPct,
            adjustedPct:  cappedPct,
            betSize:      cappedPct * bankroll,
            fraction,
          },
          liquidity:  market.liquidity,
          volume:     market.volume,
          endDate:    market.endDate,
          event,
          isMultiOutcome: true,
          outcomeLabel: outcomeName,
        });
      }
    }
  }

  results.sort((a, b) => b.evPct - a.evPct);
  return { results, stats };
}

// ── Championship vs game-level question detection ─────────────────────────────
// If the question mentions a season/tournament winner event, restrict matching
// to sportsbook outrights only.  Game-level questions can also use h2h odds.
const CHAMPIONSHIP_KEYWORDS = [
  // Major championship events
  'stanley cup', 'super bowl', 'nba finals', 'nba championship',
  'world series', 'world cup', 'champions league', 'premier league',
  'fa cup', 'mls cup', 'championship',
  'ncaa tournament', 'march madness', 'college football playoff',
  'pennant', 'division title', 'division winner', 'conference title',
  'conference champion', 'nfl champion',
  // Individual sport majors
  'masters', 'us open', 'british open', 'the open championship',
  'pga championship', 'wimbledon', 'french open', 'australian open',
  'grand slam', 'daytona 500', 'indy 500', 'monaco grand prix',
  // Award / season-long markets
  'season mvp', 'league mvp', 'mvp award', 'cy young', 'heisman',
  'ballon d\'or', 'rookie of the year',
  // Generic season-winner phrases
  'win the league', 'win the title', 'win the cup', 'win the series',
];

function isChampionshipQuestion(question) {
  const q = question.toLowerCase();
  return CHAMPIONSHIP_KEYWORDS.some(kw => q.includes(kw));
}

// Extract sport from question text — fallback when market tags are generic (e.g. 'sports').
// FIFA/World Cup in question → 'soccer' so "Will Jordan win the World Cup?" never
// falls back to golf events where "Jordan Spieth" lives.
function sportKeyFromQuestion(question) {
  const q = question.toLowerCase();
  if (q.includes('fifa') || q.includes('world cup') || q.includes('premier league') ||
      q.includes('champions league') || q.includes('bundesliga') || q.includes('la liga') ||
      q.includes('serie a') || q.includes('ligue 1') || q.includes('mls cup'))
    return 'soccer';
  if (q.includes('super bowl') || q.includes(' nfl ') || q.includes('ncaaf') ||
      q.includes('college football'))
    return 'americanfootball';
  if (q.includes(' nba ') || q.includes('ncaab') || q.includes('basketball'))
    return 'basketball';
  if (q.includes('stanley cup') || q.includes(' nhl ') || q.includes('hockey'))
    return 'icehockey';
  if (q.includes('world series') || q.includes(' mlb ') || q.includes('baseball'))
    return 'baseball';
  if (q.includes(' pga ') || q.includes('lpga') || q.includes('golf') ||
      q.includes('masters') || q.includes('british open') || q.includes('the open'))
    return 'golf';
  if (q.includes('wimbledon') || q.includes('french open') || q.includes('australian open') ||
      q.includes(' atp ') || q.includes(' wta ') || q.includes('tennis'))
    return 'tennis';
  if (q.includes(' ufc ') || q.includes('mma') || q.includes('mixed martial'))
    return 'mma';
  if (q.includes('boxing') || q.includes(' wbc ') || q.includes(' wbo ') || q.includes(' wba '))
    return 'boxing';
  if (q.includes('nascar') || q.includes('formula 1') || q.includes(' f1 ') ||
      q.includes('grand prix') || q.includes('indy 500') || q.includes('daytona'))
    return 'nascar';
  return null;
}

// Map Polymarket tags → Odds API sport_key fragment for context-aware matching.
function sportKeyFromTags(tags = []) {
  const t = tags.join(' ').toLowerCase();
  if (t.includes('nfl'))                              return 'americanfootball_nfl';
  if (t.includes('ncaaf'))                            return 'americanfootball_ncaaf';
  if (t.includes('nba'))                              return 'basketball_nba';
  if (t.includes('ncaab'))                            return 'basketball_ncaab';
  if (t.includes('mlb'))                              return 'baseball_mlb';
  if (t.includes('nhl'))                              return 'icehockey_nhl';
  if (t.includes('soccer') || t.includes('mls') ||
      t.includes('epl')    || t.includes('champions'))return 'soccer';
  if (t.includes('ufc')    || t.includes('mma'))      return 'mma';
  if (t.includes('boxing'))                           return 'boxing';
  if (t.includes('golf')   || t.includes('pga'))      return 'golf';
  if (t.includes('tennis') || t.includes('atp') ||
      t.includes('wta')    || t.includes('wimbledon')) return 'tennis';
  if (t.includes('nascar') || t.includes('racing'))   return 'nascar';
  if (t.includes('formula')|| t.includes('f1'))       return 'formula';
  return null; // unknown sport → search all events
}

// Find the best-matching sportsbook outcome for a given name.
// question drives both championship detection and sport-context derivation.
function findBestOddsMatch(name, oddsEvents, marketTags = [], question = '') {
  const isChampionship = isChampionshipQuestion(question);
  const allowedKeys = isChampionship ? ['outrights'] : ['outrights', 'h2h'];

  // Use tag-based hint first; fall back to question-text-based hint.
  // The question fallback is critical for markets tagged only as 'sports' —
  // "Will Jordan win the 2026 FIFA World Cup?" → 'soccer' from question text
  // prevents "Jordan" matching "Jordan Spieth" in golf events.
  const sportHint = sportKeyFromTags(marketTags) || sportKeyFromQuestion(question);

  let candidates = oddsEvents;
  if (sportHint) {
    const scoped = oddsEvents.filter(e =>
      e.sport_key?.toLowerCase().includes(sportHint)
    );
    if (scoped.length > 0) {
      candidates = scoped;
    } else if (isChampionship) {
      // Championship + known sport but zero sportsbook events for that sport:
      // do NOT fall back to all events — cross-sport false positives are worse
      // than missing a result.
      return null;
    }
  }

  return searchEvents(name, candidates, allowedKeys);
}

function searchEvents(name, events, allowedKeys = ['outrights', 'h2h']) {
  let bestScore = MIN_MATCH_SCORE - 0.001;
  let bestData  = null;

  for (const event of events) {
    if (!event.bookmakers?.length) continue;

    for (const book of event.bookmakers) {
      for (const market of book.markets ?? []) {
        if (!allowedKeys.includes(market.key)) continue;

        for (const outcome of market.outcomes ?? []) {
          const score = teamMatchScore(name, outcome.name);
          if (score < MIN_MATCH_SCORE || score <= bestScore) continue;

          const allBookProbs = collectAllBookProbs(event, outcome.name, allowedKeys);
          if (allBookProbs.length === 0) continue;

          const trueProb = allBookProbs.reduce((s, p) => s + p, 0) / allBookProbs.length;

          bestScore = score;
          bestData  = {
            trueProb,
            noVigProb:  trueProb,
            bestBook:   book.title,
            bestOdds:   outcome.price,
            totalBooks: allBookProbs.length,
            matchScore: score,
            matchedOutcome: outcome.name,
            matchMarketType: market.key,
            event,
          };
        }
      }
    }
  }

  if (bestData) {
    console.debug(
      `[Match] "${name}" → "${bestData.matchedOutcome}" (score=${bestData.matchScore.toFixed(2)}, ` +
      `type=${bestData.matchMarketType}, sport=${bestData.event?.sport_key}, ` +
      `trueProb=${(bestData.trueProb * 100).toFixed(1)}%, books=${bestData.totalBooks})`
    );
  }

  return bestData;
}

// Collect devigged probabilities for a named outcome across all bookmakers in an event.
function collectAllBookProbs(event, targetOutcomeName, allowedKeys = ['outrights', 'h2h']) {
  const devigged = [];

  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      if (!allowedKeys.includes(market.key)) continue;

      const outcomes     = market.outcomes ?? [];
      const impliedProbs = outcomes.map(o => americanToImplied(o.price));
      const total        = impliedProbs.reduce((s, p) => s + p, 0);
      if (total <= 0) continue;

      const idx = outcomes.findIndex(
        o => teamMatchScore(targetOutcomeName, o.name) >= MIN_MATCH_SCORE
      );
      if (idx === -1) continue;

      devigged.push(impliedProbs[idx] / total);
    }
  }

  return devigged;
}

function inferSport(tags = [], sportKey = '') {
  const tagStr = (tags.join(' ') + ' ' + (sportKey ?? '')).toLowerCase();

  if (tagStr.includes('nfl') || tagStr.includes('americanfootball_nfl')) return 'NFL';
  if (tagStr.includes('ncaaf') || tagStr.includes('americanfootball_ncaaf')) return 'NCAAF';
  if (tagStr.includes('nba') || tagStr.includes('basketball_nba')) return 'NBA';
  if (tagStr.includes('ncaab') || tagStr.includes('basketball_ncaab')) return 'NCAAB';
  if (tagStr.includes('mlb') || tagStr.includes('baseball_mlb')) return 'MLB';
  if (tagStr.includes('nhl') || tagStr.includes('icehockey')) return 'NHL';
  if (tagStr.includes('mls') || tagStr.includes('soccer_usa')) return 'Soccer';
  if (tagStr.includes('epl') || tagStr.includes('soccer_epl')) return 'Soccer';
  if (tagStr.includes('ucl') || tagStr.includes('champions')) return 'Soccer';
  if (tagStr.includes('soccer')) return 'Soccer';
  if (tagStr.includes('ufc') || tagStr.includes('mma')) return 'UFC/MMA';
  if (tagStr.includes('boxing')) return 'Boxing';
  if (tagStr.includes('golf') || tagStr.includes('pga') || tagStr.includes('masters')) return 'Golf';
  if (tagStr.includes('tennis') || tagStr.includes('atp') || tagStr.includes('wta') || tagStr.includes('wimbledon')) return 'Tennis';
  if (tagStr.includes('nascar') || tagStr.includes('formula') || tagStr.includes('f1') || tagStr.includes('motorsport') || tagStr.includes('racing')) return 'Racing';
  return 'Sports';
}
