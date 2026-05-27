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
      console.debug(`[Scanner] Polymarket: ${polyMarkets.length} unique markets fetched`);
      // Log sample URLs so we can verify they resolve correctly
      console.debug('[Scanner] Sample market URLs:', polyMarkets.slice(0, 5).map(m => ({
        q: m.question?.slice(0, 50),
        url: m.url,
        slug: m.slug,
      })));
      // Breakdown by tag (approximated from question content for sanity check)
      const nonSports = polyMarkets.filter(m => !isSportsMarket(m.question));
      if (nonSports.length > 0) {
        console.warn(`[Scanner] ${nonSports.length} non-sports markets will be skipped:`,
          nonSports.slice(0, 3).map(m => m.question?.slice(0, 60)));
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
        console.debug('[Scanner] Sample events:', oddsEvents.slice(0, 5).map(e => ({
          sport: e.sport_key,
          title: e.home_team,   // competition title for outrights (e.g. "Stanley Cup Champion")
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
  const deviGMethod = settings.deviGMethod ?? 'multiplicative';

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
        if (stats.binaryNoQuestion <= 10) {
          console.debug(`[Scanner] No team extracted: "${market.question}"`);
        }
        continue;
      }

      const match = findBestOddsMatch(teamFromQuestion, oddsEvents, market.tags, market.question, deviGMethod);
      if (!match) {
        stats.binaryNoOddsMatch++;
        console.debug(`[Scanner] No odds match for: "${market.question}" → team="${teamFromQuestion}"`);
        continue;
      }

      const { trueProb: rawTrueProb, bestBook, bestOdds, noVigProb, totalBooks, event } = match;
      // Flip probability for negatively-framed questions ("miss playoffs", "fail to qualify", etc.)
      // so YES price is compared against the correct side of the sportsbook market.
      const isNegative = isNegativeOutcome(market.question);
      const trueProb   = isNegative ? 1 - rawTrueProb : rawTrueProb;

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

        const match = findBestOddsMatch(outcomeName, oddsEvents, market.tags, market.question, deviGMethod);
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

// Extract the specific competition type from a question so we can match it against
// event.home_team (which The Odds API sets to the competition title for outrights,
// e.g. "Stanley Cup Champion", "Eastern Conference", "Super Bowl Winner").
// Prevents "Will Montreal win the Stanley Cup?" matching an Eastern Conference event
// where Montreal has a higher devigged probability → fake +EV.
function extractEventTopic(question) {
  const q = question.toLowerCase();
  if (q.includes('stanley cup'))                        return 'stanley cup';
  if (q.includes('super bowl'))                         return 'super bowl';
  if (q.includes('world series'))                       return 'world series';
  if (q.includes('nba finals') || q.includes('nba championship')) return 'nba';
  if (q.includes('world cup'))                          return 'world cup';
  if (q.includes('champions league'))                   return 'champions league';
  if (q.includes('eastern conference final'))            return 'eastern conference final';
  if (q.includes('western conference final'))            return 'western conference final';
  if (q.includes('eastern conference'))                  return 'eastern';
  if (q.includes('western conference'))                  return 'western';
  if (q.includes('nfc championship'))                   return 'nfc';
  if (q.includes('afc championship'))                   return 'afc';
  if (q.includes('masters') && !q.includes('basketball')) return 'masters';
  if (q.includes('wimbledon'))                          return 'wimbledon';
  if (q.includes('french open') || q.includes('roland garros')) return 'french open';
  if (q.includes('australian open'))                    return 'australian open';
  if (q.includes('us open'))                            return 'us open';
  return null;
}

// Returns true for questions where YES = the named team DOES NOT do the thing.
// e.g. "Will the Lakers miss the playoffs?" → YES = Lakers miss → sportsbook prob needs flipping.
function isNegativeOutcome(question) {
  const q = question.toLowerCase();
  return /\b(miss (?:the )?playoffs?|fail to (?:make|qualify|advance|reach)|be relegated|be swept(?:\s+in|\s+by|$)|not (?:make|qualify|reach|advance the) playoffs?)\b/.test(q);
}

// Returns true for questions about a specific game or match (not season-long futures).
// These should only ever be compared against sportsbook H2H game lines.
function isGameQuestion(question) {
  const q = question.toLowerCase();
  return (
    /\b(beat|defeat|vs\.?|against)\b/.test(q) ||
    /\bgame\s+[1-7]\b/.test(q) ||
    /\b(tonight|tomorrow|moneyline|spread|cover)\b/.test(q) ||
    // "Lakers at Celtics" / "Rockets @ Spurs"
    /\b[a-z]+ (?:at|@) [a-z]+\b/.test(q)
  );
}

// Find the best-matching sportsbook outcome for a given name.
// Hard type-separation:
//   championship question  → outrights only  (never h2h game lines)
//   game question          → h2h only        (never championship futures)
//   season-long / unclear  → outrights only  (safer: futures vs futures)
// This stops "Spurs win NBA title" from matching the Spurs' next-game h2h price.
function findBestOddsMatch(name, oddsEvents, marketTags = [], question = '', deviGMethod = 'multiplicative') {
  const isChampionship = isChampionshipQuestion(question);
  const isGame         = !isChampionship && isGameQuestion(question);

  // Strict market-type keys — game questions ONLY see h2h, everything else ONLY sees outrights
  const allowedKeys = isGame ? ['h2h'] : ['outrights'];

  const sportHint = sportKeyFromTags(marketTags) || sportKeyFromQuestion(question);
  const topicHint = isChampionship ? extractEventTopic(question) : null;

  // Pre-filter event pool to only events that actually contain the right market type.
  const typePool = oddsEvents.filter(e =>
    e.bookmakers?.some(b => b.markets?.some(m => allowedKeys.includes(m.key)))
  );
  if (typePool.length === 0) return null;

  let candidates = typePool;
  if (sportHint) {
    const scoped = typePool.filter(e => e.sport_key?.toLowerCase().includes(sportHint));
    if (scoped.length > 0) {
      candidates = scoped;
    } else if (sportHint.includes('_')) {
      // Broaden: 'americanfootball_nfl' → try 'americanfootball' (catches ncaaf, etc.)
      const broadHint = sportHint.split('_')[0];
      const broadScoped = typePool.filter(e => e.sport_key?.toLowerCase().includes(broadHint));
      if (broadScoped.length > 0) {
        candidates = broadScoped;
      } else if (!isGame) {
        return null; // Known sport, zero events → skip (avoids cross-sport false match)
      }
    } else if (!isGame) {
      return null;
    }
    // Game questions with no sport match fall through to full typePool — better than no match.
  }

  // For championship questions, narrow further to events whose home_team
  // (= competition title in The Odds API's outright format) matches the topic.
  // e.g. "Stanley Cup" → only "Stanley Cup Champion" events, not "Eastern Conference".
  if (topicHint) {
    const topicScoped = candidates.filter(e => {
      const title = ((e.home_team ?? '') + ' ' + (e.away_team ?? '')).toLowerCase();
      return title.includes(topicHint);
    });
    if (topicScoped.length > 0) candidates = topicScoped;
  }

  return searchEvents(name, candidates, allowedKeys, deviGMethod);
}

function searchEvents(name, events, allowedKeys = ['outrights', 'h2h'], deviGMethod = 'multiplicative') {
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

          const allBookProbs = collectAllBookProbs(event, outcome.name, allowedKeys, deviGMethod);
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
// Supports two devig methods:
//   multiplicative (default) — proportional normalization: p_i / sum(p)
//   additive                 — subtracts equal vig share from each outcome before normalizing
function collectAllBookProbs(event, targetOutcomeName, allowedKeys = ['outrights', 'h2h'], deviGMethod = 'multiplicative') {
  const devigged = [];

  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      if (!allowedKeys.includes(market.key)) continue;

      const outcomes     = market.outcomes ?? [];
      const impliedProbs = outcomes.map(o => americanToImplied(o.price));
      const total        = impliedProbs.reduce((s, p) => s + p, 0);
      if (total <= 0 || outcomes.length === 0) continue;

      const idx = outcomes.findIndex(
        o => teamMatchScore(targetOutcomeName, o.name) >= MIN_MATCH_SCORE
      );
      if (idx === -1) continue;

      let noVigProb;
      if (deviGMethod === 'additive') {
        const vigPerOutcome = (total - 1) / outcomes.length;
        const adjusted = impliedProbs.map(p => Math.max(0, p - vigPerOutcome));
        const adjSum   = adjusted.reduce((s, p) => s + p, 0);
        noVigProb = adjSum > 0 ? adjusted[idx] / adjSum : impliedProbs[idx] / total;
      } else {
        // Multiplicative — proportionally shrink all implied probs so they sum to 1
        noVigProb = impliedProbs[idx] / total;
      }

      devigged.push(noVigProb);
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
