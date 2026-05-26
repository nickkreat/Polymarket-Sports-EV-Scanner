import { useState, useCallback, useRef } from 'react';
import { fetchSportsMarkets } from '../services/polymarket';
import { fetchAllFuturesOdds, ALL_SPORT_KEYS } from '../services/oddsApi';
import { americanToImplied } from '../utils/odds';
import { evPercent, kellySizingYes, kellySizingNo } from '../utils/kelly';
import { extractTeamFromQuestion, teamMatchScore } from '../utils/matching';

// Minimum match confidence to accept (lowered from 0.7 to catch player-name variations)
const MIN_MATCH_SCORE = 0.6;

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

    try {
      setStatus('scanning — fetching Polymarket sports markets…');
      const polyMarkets = await fetchSportsMarkets({ limit: 200 });

      setStatus('scanning — fetching sportsbook odds…');
      const oddsEvents = await fetchAllFuturesOdds(
        settings.oddsApiKey,
        ALL_SPORT_KEYS,
        { regions: settings.preferredRegions }
      );

      setStatus('scanning — computing EV…');
      const results = buildOpportunities(polyMarkets, oddsEvents, settings);

      setOpportunities(results);
      setLastScanned(new Date());
      setScanStats({
        polyMarketsScanned: polyMarkets.length,
        oddsEventsScanned:  oddsEvents.length,
        matchedMarkets:     results.length,
        positiveEv:         results.filter(r => r.evPct > 0).length,
      });
      setStatus('done');
    } catch (err) {
      if (err.name === 'AbortError') return;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function isBinaryYesNo(outcomes) {
  if (outcomes.length !== 2) return false;
  const lower = outcomes.map(o => o.toLowerCase().trim());
  return lower.includes('yes') && lower.includes('no');
}

// ── Core matching + EV engine ─────────────────────────────────────────────────

function buildOpportunities(polyMarkets, oddsEvents, settings) {
  const results = [];
  const bankroll    = settings.bankroll    ?? 1000;
  const fraction    = settings.kellyFraction ?? 0.5;
  const maxKellyPct = (settings.maxKellyPct ?? 25) / 100;

  for (const market of polyMarkets) {
    if (market.closed || !market.active) continue;

    const { outcomes, prices } = market;
    if (!outcomes?.length || !prices?.length) continue;
    if (outcomes.length !== prices.length) continue;

    if (isBinaryYesNo(outcomes)) {
      // ── Binary YES/NO market ─────────────────────────────────────────────
      const yesIdx = outcomes.findIndex(o => o.toLowerCase() === 'yes');
      const yesPrice = prices[yesIdx >= 0 ? yesIdx : 0];
      const noPrice  = prices[yesIdx >= 0 ? 1 - yesIdx : 1];

      if (!yesPrice || yesPrice <= 0 || yesPrice >= 1) continue;

      const teamFromQuestion = extractTeamFromQuestion(market.question);
      if (!teamFromQuestion) continue;

      const match = findBestOddsMatch(teamFromQuestion, oddsEvents);
      if (!match) continue;

      const { trueProb, bestBook, bestOdds, noVigProb, totalBooks, event } = match;

      const yesEv = evPercent(trueProb, yesPrice);
      const noEv  = evPercent(1 - trueProb, noPrice);

      const bestSide  = yesEv >= noEv ? 'YES' : 'NO';
      const bestEv    = bestSide === 'YES' ? yesEv : noEv;
      const bestPrice = bestSide === 'YES' ? yesPrice : noPrice;

      if (!settings.showNegativeEv && bestEv <= 0) continue;
      if (bestEv < settings.minEvPct) continue;
      if (market.liquidity < settings.minLiquidity) continue;

      const kellySizing =
        bestSide === 'YES'
          ? kellySizingYes({ trueProb, marketPrice: yesPrice, bankroll, fraction })
          : kellySizingNo({ trueProb, marketPrice: noPrice, bankroll, fraction });

      const cappedPct = Math.min(kellySizing.adjustedPct, maxKellyPct);

      results.push({
        id: market.id,
        question: market.question,
        url: market.url,
        sport: inferSport(market.tags, event?.sport_key),
        side: bestSide,
        evPct: bestEv,
        marketPrice: bestPrice,
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
        liquidity: market.liquidity,
        volume:    market.volume,
        endDate:   market.endDate,
        event,
        isMultiOutcome: false,
      });
    } else {
      // ── Multi-outcome market (e.g. "Who wins the Masters?") ──────────────
      // Each outcome is a player/team name with its own price.
      // We treat each as a separate "buy this outcome" opportunity.
      for (let i = 0; i < outcomes.length; i++) {
        const outcomeName  = outcomes[i];
        const outcomePrice = prices[i];

        if (!outcomeName || typeof outcomeName !== 'string') continue;
        if (!outcomePrice || outcomePrice <= 0 || outcomePrice >= 1) continue;

        const match = findBestOddsMatch(outcomeName, oddsEvents);
        if (!match) continue;

        const { trueProb, bestBook, bestOdds, noVigProb, totalBooks, event } = match;

        // Buying this outcome at outcomePrice — EV vs sportsbook consensus
        const ev = evPercent(trueProb, outcomePrice);

        if (!settings.showNegativeEv && ev <= 0) continue;
        if (ev < settings.minEvPct) continue;
        if (market.liquidity < settings.minLiquidity) continue;

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
          liquidity: market.liquidity,
          volume:    market.volume,
          endDate:   market.endDate,
          event,
          isMultiOutcome: true,
          outcomeLabel:   outcomeName,
        });
      }
    }
  }

  results.sort((a, b) => b.evPct - a.evPct);
  return results;
}

// Find the best-matching sportsbook outcome for a given name across all events.
function findBestOddsMatch(name, oddsEvents) {
  let bestScore = MIN_MATCH_SCORE - 0.001; // must beat threshold
  let bestData  = null;

  for (const event of oddsEvents) {
    if (!event.bookmakers?.length) continue;

    for (const book of event.bookmakers) {
      for (const market of book.markets ?? []) {
        if (market.key !== 'outrights') continue;

        for (const outcome of market.outcomes ?? []) {
          const score = teamMatchScore(name, outcome.name);
          if (score < MIN_MATCH_SCORE) continue;

          if (score > bestScore) {
            // Build consensus probability from all books for this outcome
            const allBookProbs = collectAllBookProbs(event, outcome.name);
            if (allBookProbs.length === 0) continue;

            const trueProb = allBookProbs.reduce((s, p) => s + p, 0) / allBookProbs.length;

            bestScore = score;
            bestData  = {
              trueProb,
              noVigProb: trueProb,
              bestBook:  book.title,
              bestOdds:  outcome.price,
              totalBooks: allBookProbs.length,
              event,
            };
          }
        }
      }
    }
  }

  return bestData;
}

// Collect devigged probabilities for a named outcome across every bookmaker
// in a single event, then return them as an array (one entry per book).
function collectAllBookProbs(event, targetOutcomeName) {
  const devigged = [];

  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      if (market.key !== 'outrights') continue;

      const outcomes = market.outcomes ?? [];
      const impliedProbs = outcomes.map(o => americanToImplied(o.price));
      const total = impliedProbs.reduce((s, p) => s + p, 0);
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
  const tagStr = (tags.join(' ') + ' ' + sportKey).toLowerCase();

  if (tagStr.includes('nfl') || tagStr.includes('americanfootball_nfl')) return 'NFL';
  if (tagStr.includes('ncaaf') || tagStr.includes('americanfootball_ncaaf')) return 'NCAAF';
  if (tagStr.includes('nba') || tagStr.includes('basketball_nba')) return 'NBA';
  if (tagStr.includes('ncaab') || tagStr.includes('basketball_ncaab')) return 'NCAAB';
  if (tagStr.includes('mlb') || tagStr.includes('baseball_mlb')) return 'MLB';
  if (tagStr.includes('nhl') || tagStr.includes('icehockey')) return 'NHL';
  if (tagStr.includes('mls') || tagStr.includes('soccer_usa')) return 'Soccer';
  if (tagStr.includes('epl') || tagStr.includes('soccer_epl')) return 'Soccer';
  if (tagStr.includes('ucl') || tagStr.includes('champions_league')) return 'Soccer';
  if (tagStr.includes('soccer')) return 'Soccer';
  if (tagStr.includes('ufc') || tagStr.includes('mma')) return 'UFC/MMA';
  if (tagStr.includes('boxing')) return 'Boxing';
  if (tagStr.includes('golf') || tagStr.includes('pga') || tagStr.includes('masters')) return 'Golf';
  if (tagStr.includes('tennis') || tagStr.includes('atp') || tagStr.includes('wta') || tagStr.includes('wimbledon')) return 'Tennis';
  if (tagStr.includes('nascar') || tagStr.includes('formula') || tagStr.includes('f1') || tagStr.includes('motorsport') || tagStr.includes('racing')) return 'Racing';
  return 'Sports';
}
