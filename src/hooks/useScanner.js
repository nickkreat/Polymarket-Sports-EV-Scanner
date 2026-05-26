import { useState, useCallback, useRef } from 'react';
import { fetchSportsMarkets } from '../services/polymarket';
import { fetchAllFuturesOdds, fetchH2HOdds, ALL_SPORT_KEYS } from '../services/oddsApi';
import { americanToImplied, devig } from '../utils/odds';
import { kellyFraction, evPercent, kellySizingYes, kellySizingNo } from '../utils/kelly';
import { extractTeamFromQuestion, teamMatchScore } from '../utils/matching';

export function useScanner(settings) {
  const [opportunities, setOpportunities] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | scanning | done | error
  const [error, setError] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const [scanStats, setScanStats] = useState(null);
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
      setStatus('scanning — fetching Polymarket sports markets...');
      const polyMarkets = await fetchSportsMarkets({ limit: 200 });

      setStatus('scanning — fetching sportsbook odds...');
      const oddsEvents = await fetchAllFuturesOdds(
        settings.oddsApiKey,
        ALL_SPORT_KEYS,
        { regions: settings.preferredRegions }
      );

      setStatus('scanning — computing EV...');
      const results = buildOpportunities(polyMarkets, oddsEvents, settings);

      setOpportunities(results);
      setLastScanned(new Date());
      setScanStats({
        polyMarketsScanned: polyMarkets.length,
        oddsEventsScanned: oddsEvents.length,
        matchedMarkets: results.length,
        positiveEv: results.filter(r => r.evPct > 0).length,
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

// ---------------------------------------------------------------------------
// Core matching + EV engine
// ---------------------------------------------------------------------------

function buildOpportunities(polyMarkets, oddsEvents, settings) {
  const results = [];

  for (const market of polyMarkets) {
    // Only process binary YES/NO markets for futures
    if (market.outcomes.length !== 2) continue;

    const teamFromQuestion = extractTeamFromQuestion(market.question);
    if (!teamFromQuestion) continue;

    const yesPrice = market.prices[0];
    const noPrice = market.prices[1];
    if (!yesPrice || yesPrice <= 0 || yesPrice >= 1) continue;

    // Find best matching sportsbook outcome across all events
    const match = findBestOddsMatch(teamFromQuestion, market.question, oddsEvents);
    if (!match) continue;

    const { trueProb, bestBook, bestOdds, noVigProb, totalBooks, event } = match;

    // EV for buying YES
    const yesEv = evPercent(trueProb, yesPrice);
    // EV for buying NO (true prob of NO = 1 - trueProb, market price = noPrice)
    const noEv  = evPercent(1 - trueProb, noPrice);

    const bestSide = yesEv >= noEv ? 'YES' : 'NO';
    const bestEv   = bestSide === 'YES' ? yesEv : noEv;
    const bestPrice = bestSide === 'YES' ? yesPrice : noPrice;

    if (!settings.showNegativeEv && bestEv <= 0) continue;
    if (bestEv < settings.minEvPct) continue;
    if (market.liquidity < settings.minLiquidity) continue;

    const bankroll = settings.bankroll ?? 1000;
    const fraction = settings.kellyFraction ?? 0.5;
    const maxKellyPct = (settings.maxKellyPct ?? 25) / 100;

    const kellySizing =
      bestSide === 'YES'
        ? kellySizingYes({ trueProb, marketPrice: yesPrice, bankroll, fraction })
        : kellySizingNo({ trueProb, marketPrice: noPrice, bankroll, fraction });

    const cappedPct = Math.min(kellySizing.adjustedPct, maxKellyPct);
    const cappedBet = cappedPct * bankroll;

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
        adjustedPct: cappedPct,
        betSize: cappedBet,
        fraction,
      },
      liquidity: market.liquidity,
      volume: market.volume,
      endDate: market.endDate,
      event,
    });
  }

  results.sort((a, b) => b.evPct - a.evPct);
  return results;
}

function findBestOddsMatch(teamName, question, oddsEvents) {
  let bestScore = 0;
  let bestData = null;

  for (const event of oddsEvents) {
    if (!event.bookmakers?.length) continue;

    for (const book of event.bookmakers) {
      for (const market of book.markets ?? []) {
        if (market.key !== 'outrights') continue;

        for (const outcome of market.outcomes ?? []) {
          const score = teamMatchScore(teamName, outcome.name);
          if (score < 0.7) continue;

          // Build devigged probability from all books for this outcome
          const allBookImplied = collectAllBookOdds(event, outcome.name);
          if (allBookImplied.length === 0) continue;

          const avgImplied = allBookImplied.reduce((s, p) => s + p, 0) / allBookImplied.length;
          const noVigProb = avgImplied; // already devigged per-book in collectAllBookOdds

          if (score > bestScore) {
            bestScore = score;
            bestData = {
              trueProb: noVigProb,
              noVigProb,
              bestBook: book.title,
              bestOdds: outcome.price,
              totalBooks: allBookImplied.length,
              event,
            };
          }
        }
      }
    }
  }

  return bestData;
}

function collectAllBookOdds(event, targetOutcomeName) {
  const devigged = [];

  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      if (market.key !== 'outrights') continue;

      const outcomes = market.outcomes ?? [];
      const impliedProbs = outcomes.map(o => americanToImplied(o.price));
      const total = impliedProbs.reduce((s, p) => s + p, 0);
      if (total <= 0) continue;

      const idx = outcomes.findIndex(o => teamMatchScore(targetOutcomeName, o.name) >= 0.7);
      if (idx === -1) continue;

      const noVigProb = impliedProbs[idx] / total;
      devigged.push(noVigProb);
    }
  }

  return devigged;
}

function inferSport(tags = [], sportKey = '') {
  const tagStr = tags.join(' ').toLowerCase();
  const sk = sportKey.toLowerCase();

  if (tagStr.includes('nfl') || sk.includes('nfl')) return 'NFL';
  if (tagStr.includes('nba') || sk.includes('nba')) return 'NBA';
  if (tagStr.includes('mlb') || sk.includes('mlb')) return 'MLB';
  if (tagStr.includes('nhl') || sk.includes('nhl')) return 'NHL';
  if (tagStr.includes('ncaaf') || sk.includes('ncaaf')) return 'NCAAF';
  if (tagStr.includes('ncaab') || sk.includes('ncaab')) return 'NCAAB';
  if (tagStr.includes('soccer') || sk.includes('soccer')) return 'Soccer';
  if (tagStr.includes('ufc') || sk.includes('mma')) return 'UFC/MMA';
  return 'Sports';
}
