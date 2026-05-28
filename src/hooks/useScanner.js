import { useState, useCallback, useRef } from 'react';
import { fetchSportsMarkets } from '../services/polymarket';
import { fetchAllFuturesOdds, fetchAllH2HOdds, fetchAllSpreadsOdds, fetchRelevantSportKeys } from '../services/oddsApi';
import { americanToImplied } from '../utils/odds';
import { evPercent, kellySizingYes, kellySizingNo } from '../utils/kelly';
import { extractTeamFromQuestion, canonicalTeamName, teamMatchScore, isSportsMarket } from '../utils/matching';

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
      const { futuresSportKeys, h2hSportKeys } = await fetchRelevantSportKeys(settings.oddsApiKey);
      console.debug(`[Scanner] Sport keys: ${futuresSportKeys.length} futures, ${h2hSportKeys.length} H2H`);

      setStatus('scanning — fetching sportsbook futures odds…');
      const futuresEvents = await fetchAllFuturesOdds(
        settings.oddsApiKey,
        futuresSportKeys,
        { regions: settings.preferredRegions }
      );
      console.debug(`[Scanner] Odds API futures: ${futuresEvents.length} events`);

      setStatus('scanning — fetching sportsbook game odds…');
      const h2hEvents = await fetchAllH2HOdds(
        settings.oddsApiKey,
        h2hSportKeys,
        { regions: settings.preferredRegions }
      );
      console.debug(`[Scanner] Odds API H2H: ${h2hEvents.length} game events`);

      setStatus('scanning — fetching sportsbook spread/handicap odds…');
      const spreadsEvents = await fetchAllSpreadsOdds(
        settings.oddsApiKey,
        h2hSportKeys,
        { regions: settings.preferredRegions }
      );
      console.debug(`[Scanner] Odds API spreads: ${spreadsEvents.length} spread events`);

      const oddsEvents = [...futuresEvents, ...h2hEvents, ...spreadsEvents];
      console.debug(`[Scanner] Odds API total: ${oddsEvents.length} events (${futuresEvents.length} futures + ${h2hEvents.length} H2H + ${spreadsEvents.length} spreads)`);
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
        spreadsEventsScanned:     spreadsEvents.length,
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
    filteredLiquidity:   0,
    filteredEv:          0,
    skippedNonSports:    0,
    skippedUnsupported:  0,
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

    // Skip market types with no sportsbook equivalent (top-N finish, set betting, etc.)
    if (isUnsupportedMarketType(market.question)) {
      stats.skippedUnsupported++;
      continue;
    }

    // Skip markets whose resolution date has already passed.
    // Their prices are stale/illiquid and the opportunity is no longer actionable.
    if (market.endDate) {
      const endMs = Date.parse(market.endDate);
      if (!isNaN(endMs) && endMs < Date.now()) continue;
    }

    // Normalise prices — Polymarket sometimes returns strings
    const normPrices = prices.map(Number);

    // Skip near-resolved markets (tightened to 1¢/99¢ — catches prices not yet at 0/1)
    if (normPrices.some(p => p < 0.01 || p > 0.99)) continue;

    // Skip completed/settled matches — prices are certain and no longer actionable
    if (/\b(?:completed?\s+match|completed?\s+game|final\s+score)\b/i.test(market.question)) continue;

    if (isBinaryYesNo(outcomes)) {
      // ── Binary YES/NO market ───────────────────────────────────────────────
      stats.binaryChecked++;

      const yesIdx   = outcomes.findIndex(o => String(o).toLowerCase() === 'yes');
      const yesPrice = normPrices[yesIdx >= 0 ? yesIdx : 0];
      const noPrice  = normPrices[yesIdx >= 0 ? 1 - yesIdx : 1];

      if (!yesPrice || yesPrice <= 0 || yesPrice >= 1) continue;

      const isChamp  = isChampionshipQuestion(market.question);
      const isSpread = !isChamp && isSpreadQuestion(market.question);
      const isTotals = !isChamp && !isSpread && isTotalsQuestion(market.question);
      const isGame   = !isChamp && !isSpread && !isTotals && isGameQuestion(market.question);

      let trueProb, bestBook, bestOdds, noVigProb, totalBooks, event, bookBreakdown;

      // ── Path Spread: spread/handicap question → spread market matching ─────
      // Must be checked BEFORE the H2H path to avoid using moneyline win%
      // as the reference probability for covering a spread.
      if (isSpread) {
        const targetSpread = extractSpreadFromQuestion(market.question);
        const spreadsPool  = oddsEvents.filter(e =>
          e.bookmakers?.some(b => b.markets?.some(m => m.key === 'spreads' || m.key === 'alternate_spreads'))
        );

        let spreadEvt  = null;
        let spreadTeam = null;

        // Try dual-team parse for accurate event matching
        const parsed = parseGameQuestion(market.question);
        if (parsed) {
          spreadEvt  = findH2HEvent(parsed.teamA, parsed.teamB, spreadsPool, market.endDate);
          spreadTeam = parsed.teamA;
        }

        // Fallback: single-team search (e.g. "Will the Pirates cover -3.5?")
        if (!spreadEvt) {
          const teamName = extractTeamFromQuestion(market.question);
          if (teamName) {
            spreadEvt  = findSpreadEventForTeam(teamName, spreadsPool, market.endDate);
            spreadTeam = teamName;
          }
        }

        if (spreadEvt && spreadTeam) {
          const p = getSpreadProbForTeam(spreadEvt, spreadTeam, targetSpread, deviGMethod);
          if (p) {
            const flip = isNegativeOutcome(market.question);
            trueProb      = flip ? 1 - p.trueProb : p.trueProb;
            noVigProb     = p.trueProb;
            bestBook      = p.bestBook;
            bestOdds      = p.bestOdds;
            totalBooks    = p.totalBooks;
            event         = spreadEvt;
            bookBreakdown = p.bookBreakdown;
            console.debug(
              `[Match-Spread] "${market.question}" → ${spreadTeam} spread=${targetSpread}` +
              ` trueProb=${(trueProb * 100).toFixed(1)}% books=${totalBooks}`
            );
          }
        }

        // Never fall back to H2H for spread questions — moneyline win% ≠ cover%
        if (trueProb === undefined) {
          stats.binaryNoOddsMatch++;
          console.debug(`[Scanner] No spread odds match for: "${market.question}" spread=${targetSpread}`);
          continue;
        }
      }

      // ── Path A: game question → dual-team H2H matching ────────────────────
      if (isGame) {
        const parsed = parseGameQuestion(market.question);
        if (parsed) {
          const h2hPool = oddsEvents.filter(e =>
            e.bookmakers?.some(b => b.markets?.some(m => m.key === 'h2h'))
          );
          const h2hEvt = findH2HEvent(parsed.teamA, parsed.teamB, h2hPool, market.endDate);
          if (h2hEvt) {
            const p = getH2HProbForTeam(h2hEvt, parsed.teamA, deviGMethod);
            if (p) {
              const flip = isNegativeOutcome(market.question);
              trueProb      = flip ? 1 - p.trueProb : p.trueProb;
              noVigProb     = p.trueProb;
              bestBook      = p.bestBook;
              bestOdds      = p.bestOdds;
              totalBooks    = p.totalBooks;
              event         = h2hEvt;
              bookBreakdown = p.bookBreakdown;
              console.debug(
                `[Match-H2H] "${market.question}" → ${parsed.teamA} vs ${parsed.teamB}` +
                ` trueProb=${(trueProb * 100).toFixed(1)}% flip=${flip} books=${totalBooks}`
              );
            }
          }
        }
      }

      // ── Path B: single-team fallback (futures, championships, unmatched games) ──
      if (trueProb === undefined) {
        const teamName = extractTeamFromQuestion(market.question);
        if (!teamName) {
          stats.binaryNoQuestion++;
          if (stats.binaryNoQuestion <= 10)
            console.debug(`[Scanner] No team extracted: "${market.question}"`);
          continue;
        }

        // Guard: if the extracted "team" is a placement/qualifier phrase, it's a
        // bad extraction from a pattern like "Will [Player] finish top 5…" where
        // we'd erroneously match "Player" against a winner outright.
        const EXTRACTION_GARBAGE_WORDS = [
          'top', 'finish', 'make the', 'qualify', 'advance to',
          'round', 'set ', 'game ', 'tiebreak', 'podium',
        ];
        if (EXTRACTION_GARBAGE_WORDS.some(w => teamName.toLowerCase().includes(w))) {
          stats.binaryNoQuestion++;
          continue;
        }
        const match = findBestOddsMatch(teamName, oddsEvents, market.tags, market.question, deviGMethod);
        if (!match) {
          stats.binaryNoOddsMatch++;
          console.debug(`[Scanner] No odds match for: "${market.question}" → team="${teamName}"`);
          continue;
        }
        const flip    = isNegativeOutcome(market.question);
        trueProb      = flip ? 1 - match.trueProb : match.trueProb;
        noVigProb     = match.noVigProb;
        bestBook      = match.bestBook;
        bestOdds      = match.bestOdds;
        totalBooks    = match.totalBooks;
        event         = match.event;
        bookBreakdown = match.bookBreakdown;
      }

      if (trueProb === undefined) {
        stats.binaryNoOddsMatch++;
        continue;
      }

      // Sanity check: if sportsbook consensus diverges from Polymarket by >60pp,
      // the event match is almost certainly wrong (stale line, different event, etc.)
      if (Math.abs(trueProb - yesPrice) > 0.60) {
        stats.binaryNoOddsMatch++;
        console.debug(
          `[Scanner] 60pp delta skip: "${market.question}" poly=${yesPrice.toFixed(2)} books=${trueProb.toFixed(2)}`
        );
        continue;
      }

      const yesEv    = evPercent(trueProb, yesPrice);
      const noEv     = evPercent(1 - trueProb, noPrice);
      const bestSide = yesEv >= noEv ? 'YES' : 'NO';
      const bestEv   = bestSide === 'YES' ? yesEv : noEv;

      if (market.liquidity < settings.minLiquidity) { stats.filteredLiquidity++; continue; }
      if (!settings.showNegativeEv && bestEv <= 0)  { stats.filteredEv++; continue; }
      if (bestEv < settings.minEvPct)               { stats.filteredEv++; continue; }

      // Flag extreme EV — likely a very stale/illiquid price, not a real edge
      const suspiciousEv = Math.abs(bestEv) > 200;
      if (suspiciousEv) {
        console.warn(`[Scanner] Extreme EV ${bestEv.toFixed(0)}% — verify manually: "${market.question}"`);
        if (settings.hideSuspiciousEv) { stats.filteredEv++; continue; }
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
        bookBreakdown,
        isMultiOutcome: false,
        suspiciousEv,
      });

    } else if (outcomes.length >= 2) {
      // ── Multi-outcome market ──────────────────────────────────────────────
      // Two cases:
      //   A) Game moneyline: exactly 2 team-name outcomes (e.g. ["Thunder","Spurs"])
      //      → find the exact H2H event via dual-team matching
      //   B) Futures/outright: 3+ outcomes or non-team 2-outcome market
      //      → match each outcome individually against outrights

      // Two-team spread market (e.g. "Spread: White Sox (-3.5)" outcomes: ["White Sox","Twins"])
      // Must be checked BEFORE isGameMoneyline to prevent routing to H2H moneyline pool.
      const isTwoTeamSpread = (() => {
        if (outcomes.length !== 2) return false;
        if (!isSpreadQuestion(market.question)) return false;
        const lower = outcomes.map(o => String(o).toLowerCase().trim());
        const nonTeam = ['over', 'under', 'odd', 'even', 'yes', 'no', 'draw'];
        if (lower.some(o => nonTeam.includes(o) || /^\d/.test(o))) return false;
        const ca = canonicalTeamName(lower[0]);
        const cb = canonicalTeamName(lower[1]);
        return ca && cb && ca !== cb && ca.length > 2 && cb.length > 2;
      })();

      const isGameMoneyline = (() => {
        if (outcomes.length !== 2) return false;
        // Guard: spread/totals markets have two team names but are NOT moneylines
        if (isSpreadQuestion(market.question)) return false;
        if (isTotalsQuestion(market.question)) return false;
        const lower = outcomes.map(o => String(o).toLowerCase().trim());
        const nonTeam = ['over', 'under', 'odd', 'even', 'yes', 'no', 'draw'];
        if (lower.some(o => nonTeam.includes(o) || /^\d/.test(o))) return false;
        const ca = canonicalTeamName(lower[0]);
        const cb = canonicalTeamName(lower[1]);
        return ca && cb && ca !== cb && ca.length > 2 && cb.length > 2;
      })();

      if (isTwoTeamSpread) {
        // ── Case Spread: Two-team spread/handicap market ───────────────────
        // e.g. "Spread: White Sox (-3.5)" → outcomes: ["White Sox","Twins"]
        stats.multiChecked += 2;
        const targetSpread = extractSpreadFromQuestion(market.question);
        const teamA  = canonicalTeamName(String(outcomes[0]));
        const teamB  = canonicalTeamName(String(outcomes[1]));
        const priceA = normPrices[0];
        const priceB = normPrices[1];

        if (!priceA || priceA <= 0 || priceA >= 1) continue;

        const spreadsPool = oddsEvents.filter(e =>
          e.bookmakers?.some(b => b.markets?.some(m =>
            m.key === 'spreads' || m.key === 'alternate_spreads'
          ))
        );
        const spreadEvt = findH2HEvent(teamA, teamB, spreadsPool, market.endDate);

        if (!spreadEvt) {
          stats.multiNoOddsMatch++;
          console.debug(`[Scanner] No spread event: "${market.question}" → ${teamA} vs ${teamB}`);
          continue;
        }

        const pA = getSpreadProbForTeam(spreadEvt, teamA, targetSpread, deviGMethod);
        if (!pA) {
          stats.multiNoOddsMatch++;
          console.debug(`[Scanner] No spread prob: "${market.question}" spread=${targetSpread}`);
          continue;
        }

        const evA = evPercent(pA.trueProb, priceA);
        const evB = evPercent(1 - pA.trueProb, priceB);
        const bestSide      = evA >= evB ? teamA : teamB;
        const bestEv        = bestSide === teamA ? evA : evB;
        const bestPrice     = bestSide === teamA ? priceA : priceB;
        const bestTrueProb  = bestSide === teamA ? pA.trueProb : 1 - pA.trueProb;

        if (market.liquidity < settings.minLiquidity) { stats.filteredLiquidity++; continue; }
        if (!settings.showNegativeEv && bestEv <= 0)  { stats.filteredEv++; continue; }
        if (bestEv < settings.minEvPct)               { stats.filteredEv++; continue; }

        const suspiciousEv = Math.abs(bestEv) > 200;
        if (suspiciousEv) {
          console.warn(`[Scanner] Extreme EV ${bestEv.toFixed(0)}% — verify: "${market.question}"`);
          if (settings.hideSuspiciousEv) { stats.filteredEv++; continue; }
        }

        const kellySizing = kellySizingYes({ trueProb: bestTrueProb, marketPrice: bestPrice, bankroll, fraction });
        const cappedPct   = Math.min(kellySizing.adjustedPct, maxKellyPct);

        console.debug(
          `[Match-Spread2T] "${market.question}" → ${teamA} vs ${teamB}` +
          ` spread=${targetSpread} matchedPoint=${pA.matchedPoint}` +
          ` bestSide=${bestSide} EV=${bestEv.toFixed(1)}% books=${pA.totalBooks}`
        );

        results.push({
          id:               `${market.id}-spread`,
          question:         market.question,
          url:              market.url,
          sport:            inferSport(market.tags, spreadEvt?.sport_key),
          side:             bestSide,
          evPct:            bestEv,
          marketPrice:      bestPrice,
          trueProb:         bestTrueProb,
          noVigProb:        pA.trueProb,
          yesPrice:         priceA,
          noPrice:          priceB,
          yesEv:            evA,
          noEv:             evB,
          bestBook:         pA.bestBook,
          bestOdds:         pA.bestOdds,
          totalBooks:       pA.totalBooks,
          kelly: {
            fullKellyPct: kellySizing.kellyPct,
            adjustedPct:  cappedPct,
            betSize:      cappedPct * bankroll,
            fraction,
          },
          liquidity:        market.liquidity,
          volume:           market.volume,
          endDate:          market.endDate,
          event:            spreadEvt,
          bookBreakdown:    pA.bookBreakdown,
          isMultiOutcome:   true,
          isSpreadMarket:   true,
          matchedSpreadPoint: pA.matchedPoint,
          outcomeLabel:     bestSide,
          suspiciousEv,
        });
        continue; // don't fall through to isGameMoneyline

      } else if (isGameMoneyline) {
        // ── Case A: Game moneyline ─────────────────────────────────────────
        stats.multiChecked += 2;
        const teamA  = canonicalTeamName(String(outcomes[0]));
        const teamB  = canonicalTeamName(String(outcomes[1]));
        const priceA = normPrices[0];
        const priceB = normPrices[1];

        if (!priceA || priceA <= 0 || priceA >= 1) continue;

        const h2hPool = oddsEvents.filter(e =>
          e.bookmakers?.some(b => b.markets?.some(m => m.key === 'h2h'))
        );
        const h2hEvt = findH2HEvent(teamA, teamB, h2hPool, market.endDate);

        if (h2hEvt) {
          const pA = getH2HProbForTeam(h2hEvt, teamA, deviGMethod);
          if (pA) {
            const evA      = evPercent(pA.trueProb, priceA);
            const evB      = evPercent(1 - pA.trueProb, priceB);
            const bestSide = evA >= evB ? teamA : teamB;
            const bestEv   = bestSide === teamA ? evA : evB;
            const bestPrice     = bestSide === teamA ? priceA : priceB;
            const bestTrueProb  = bestSide === teamA ? pA.trueProb : 1 - pA.trueProb;

            if (market.liquidity < settings.minLiquidity) { stats.filteredLiquidity++; continue; }
            if (!settings.showNegativeEv && bestEv <= 0)  { stats.filteredEv++; continue; }
            if (bestEv < settings.minEvPct)               { stats.filteredEv++; continue; }

            const suspiciousEv = Math.abs(bestEv) > 200;
            if (suspiciousEv) {
              console.warn(`[Scanner] Extreme EV ${bestEv.toFixed(0)}% — verify manually: "${market.question}"`);
              if (settings.hideSuspiciousEv) { stats.filteredEv++; continue; }
            }
            const kellySizing  = kellySizingYes({ trueProb: bestTrueProb, marketPrice: bestPrice, bankroll, fraction });
            const cappedPct    = Math.min(kellySizing.adjustedPct, maxKellyPct);

            console.debug(
              `[Match-Game] "${market.question}" → ${teamA} vs ${teamB}` +
              ` bestSide=${bestSide} EV=${bestEv.toFixed(1)}% books=${pA.totalBooks}`
            );

            results.push({
              id:          `${market.id}-ml`,
              question:    market.question,
              url:         market.url,
              sport:       inferSport(market.tags, h2hEvt?.sport_key),
              side:        bestSide,
              evPct:       bestEv,
              marketPrice: bestPrice,
              trueProb:    bestTrueProb,
              noVigProb:   pA.trueProb,
              yesPrice:    priceA,
              noPrice:     priceB,
              yesEv:       evA,
              noEv:        evB,
              bestBook:    pA.bestBook,
              bestOdds:    pA.bestOdds,
              totalBooks:  pA.totalBooks,
              kelly: {
                fullKellyPct: kellySizing.kellyPct,
                adjustedPct:  cappedPct,
                betSize:      cappedPct * bankroll,
                fraction,
              },
              liquidity:      market.liquidity,
              volume:         market.volume,
              endDate:        market.endDate,
              event:          h2hEvt,
              bookBreakdown:  pA.bookBreakdown,
              isMultiOutcome: true,
              isGameMoneyline: true,
              outcomeLabel:   bestSide,
              suspiciousEv,
            });
          }
        }

      } else {
        // ── Case B: Futures/outright with named outcomes ───────────────────
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

          const { trueProb, bestBook, bestOdds, noVigProb, totalBooks, event, bookBreakdown } = match;
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
            liquidity:      market.liquidity,
            volume:         market.volume,
            endDate:        market.endDate,
            event,
            bookBreakdown,
            isMultiOutcome: true,
            outcomeLabel:   outcomeName,
          });
        }
      }
    }
  }

  results.sort((a, b) => b.evPct - a.evPct);
  return { results, stats };
}

// ── Game market helpers ───────────────────────────────────────────────────────

// Parse a game question to extract BOTH competing teams so we can find the
// exact H2H event rather than fuzzy-searching on just one team name.
// Returns { teamA, teamB } where teamA = YES subject, or null if unrecognised.
function parseGameQuestion(question) {
  const tryPair = (a, b) => {
    if (!a || !b) return null;
    const ca = canonicalTeamName(a.trim().replace(/[?!.,]$/, ''));
    const cb = canonicalTeamName(b.trim().replace(/[?!.,]$/, ''));
    if (!ca || !cb || ca.length < 2 || cb.length < 2 || ca === cb) return null;
    return { teamA: ca, teamB: cb };
  };

  let m;
  // "Will [A] beat/defeat/top/outlast [B]…"
  m = question.match(/will (?:the )?(.+?) (?:beat|defeat|top|outplay|outlast|overcome|outperform) (?:the )?(.+?)(?:[?,]|\?|$)/i);
  if (m) return tryPair(m[1], m[2]);

  // "Can [A] beat/win against [B]…"
  m = question.match(/can (?:the )?(.+?) (?:beat|defeat|win against|win over) (?:the )?(.+?)(?:[?,]|\?|$)/i);
  if (m) return tryPair(m[1], m[2]);

  // "[A] vs [B]" / "Will the [A] vs [B]"
  m = question.match(/(?:will (?:the )?)?(.+?)\s+vs\.?\s+(?:the )?(.+?)(?:\s*[-—,?]|\?|\s+game\s|\s*$)/i);
  if (m) return tryPair(m[1], m[2]);

  // "Who wins: [A] or [B]" / "Who wins between [A] and [B]"
  m = question.match(/who wins[^:]*[:\s]+(?:the )?(.+?)\s+(?:or|and)\s+(?:the )?(.+?)(?:[?,]|\?|$)/i);
  if (m) return tryPair(m[1], m[2]);

  // "[A] at [B]" / "[A] @ [B]" — visitor at home
  m = question.match(/^(?:will (?:the )?)?(.+?)\s+(?:at|@)\s+(?:the )?(.+?)(?:[?,]|\?|$)/i);
  if (m) return tryPair(m[1], m[2]);

  return null;
}

// Find the H2H event where BOTH teams match (one each side of home/away).
// This prevents "Thunder vs Suns" matching when the question is "Thunder vs Wolves".
// endDate: the Polymarket market's endDate — used to prefer events whose commence_time
// is within 3 days, so series games (Mon/Tue/Wed) match the correct game date.
function findH2HEvent(teamA, teamB, h2hEvents, endDate = null) {
  let bestEvent     = null;
  let bestTeamScore = MIN_MATCH_SCORE - 0.001;
  let bestDateDiff  = Infinity;

  const endMs = endDate ? Date.parse(endDate) : NaN;

  for (const event of h2hEvents) {
    const homeA = teamMatchScore(teamA, event.home_team ?? '');
    const awayA = teamMatchScore(teamA, event.away_team ?? '');
    const homeB = teamMatchScore(teamB, event.home_team ?? '');
    const awayB = teamMatchScore(teamB, event.away_team ?? '');

    // A=home & B=away, or A=away & B=home — take the better combination
    const teamScore = Math.max(Math.min(homeA, awayB), Math.min(awayA, homeB));
    if (teamScore < MIN_MATCH_SCORE) continue;

    // Date-proximity: skip events more than 3 days from the Polymarket endDate.
    // Among events meeting the team threshold, prefer the one closest to endDate.
    let dateDiff = 0;
    if (!isNaN(endMs) && event.commence_time) {
      dateDiff = Math.abs(Date.parse(event.commence_time) - endMs) / 86400000;
      if (dateDiff > 3) continue;
    }

    const betterTeam        = teamScore > bestTeamScore;
    const sameTeamCloserDate = teamScore === bestTeamScore && dateDiff < bestDateDiff;
    if (betterTeam || sameTeamCloserDate) {
      bestTeamScore = teamScore;
      bestDateDiff  = dateDiff;
      bestEvent     = event;
    }
  }

  return bestEvent;
}

// Sharp books give more reliable consensus lines; weight them 2× vs recreational books.
const SHARP_BOOK_KEYS = new Set(['pinnacle', 'betfair_ex_eu', 'circa', 'bookmaker', 'betonlineag', 'lowvig']);

// Compute the devigged moneyline probability for the named team in a specific event.
function getH2HProbForTeam(event, teamName, deviGMethod = 'multiplicative') {
  const samples = [];

  for (const book of event.bookmakers ?? []) {
    const h2hMkt = book.markets?.find(m => m.key === 'h2h');
    if (!h2hMkt) continue;

    const outcomes     = h2hMkt.outcomes ?? [];
    if (outcomes.length < 2) continue;
    const impliedProbs = outcomes.map(o => americanToImplied(o.price));
    const total        = impliedProbs.reduce((s, p) => s + p, 0);
    if (total <= 0) continue;

    const idx = outcomes.findIndex(o => teamMatchScore(teamName, o.name) >= MIN_MATCH_SCORE);
    if (idx === -1) continue;

    let prob;
    if (deviGMethod === 'additive') {
      const vigPerSide = (total - 1) / outcomes.length;
      const adjusted   = impliedProbs.map(p => Math.max(0, p - vigPerSide));
      const adjSum     = adjusted.reduce((s, p) => s + p, 0);
      prob = adjSum > 0 ? adjusted[idx] / adjSum : impliedProbs[idx] / total;
    } else {
      prob = impliedProbs[idx] / total;
    }

    samples.push({ prob, bookKey: book.key ?? '', bookTitle: book.title ?? '' });
  }

  if (!samples.length) return null;

  // Weighted average — sharp books count 2× to reduce recreational-book dilution
  let wSum = 0, wTotal = 0;
  for (const { prob, bookKey } of samples) {
    const w = SHARP_BOOK_KEYS.has(bookKey) ? 2.0 : 1.0;
    wSum   += prob * w;
    wTotal += w;
  }

  const sharpSample  = samples.find(s => SHARP_BOOK_KEYS.has(s.bookKey));
  const bestSampleH  = sharpSample ?? samples[0];
  const bestBookEntry = event.bookmakers?.find(b => b.key === bestSampleH?.bookKey);
  const bestH2H      = bestBookEntry?.markets?.find(m => m.key === 'h2h');
  const matchedOdds  = bestH2H?.outcomes?.find(o => teamMatchScore(teamName, o.name) >= MIN_MATCH_SCORE)?.price ?? 0;

  return {
    trueProb:      wSum / wTotal,
    totalBooks:    samples.length,
    bestBook:      bestSampleH?.bookTitle ?? '',
    bestOdds:      matchedOdds,
    bookBreakdown: collectBookBreakdown(event, teamName, ['h2h']),
  };
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
  // PGA Tour named events
  'genesis invitational', 'players championship', 'memorial tournament',
  'charles schwab challenge', 'rbc heritage', 'travelers championship',
  'john deere classic', 'rocket mortgage classic', 'wyndham championship',
  'bmw championship', 'fedex cup', 'tour championship',
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
      q.includes('masters') || q.includes('british open') || q.includes('the open') ||
      q.includes('players championship') || q.includes('memorial tournament') ||
      q.includes('genesis invitational') || q.includes('charles schwab') ||
      q.includes('travelers championship') || q.includes('fedex cup') ||
      q.includes('tour championship') || q.includes('rbc heritage'))
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

// ── Spread / totals question classifiers ──────────────────────────────────────

function isSpreadQuestion(question) {
  const q = question.toLowerCase();
  return (
    /\bcover(?:ing)?\b/.test(q) ||
    /\bspread\b/.test(q) ||
    /\bhandicap\b/.test(q) ||
    /\brun\s*line\b/.test(q) ||
    /\bpuck\s*line\b/.test(q) ||
    /\balt(?:ernate)?\s+spread\b/.test(q) ||
    // Explicit spread notation in parens: requires sign (+/-) or decimal
    // to avoid matching game/series numbers like "(7)" or "(if necessary)"
    /\([+-]\d+(?:\.\d+)?\)/.test(question) ||
    /\(\d+\.\d+\)/.test(question)
  );
}

function isTotalsQuestion(question) {
  const q = question.toLowerCase();
  return /\b(over|under)\s+\d/.test(q) || /\btotal\b.*\d/.test(q);
}

// Markets that have no direct sportsbook equivalent — skip entirely rather than
// cross-matching against the wrong market (e.g. winner outrights for a top-5 finish).
function isUnsupportedMarketType(question) {
  const q = question.toLowerCase();
  // Top-N finish (golf/racing placement markets)
  if (/\btop[- ]?\d+\b/.test(q)) return true;
  if (/\bfinish(?:es)?\s+(?:in\s+)?(?:the\s+)?top\s+\d+\b/.test(q)) return true;
  // Set-N winner / tennis set betting
  if (/\b(?:win|wins|winner of)\s+(?:the\s+)?(?:first|second|third|1st|2nd|3rd|\d+(?:st|nd|rd|th)?\s+)?set\b/.test(q)) return true;
  if (/\bset\s+\d+\s+(?:winner|handicap|line|spread)\b/.test(q)) return true;
  // Tiebreak / supertiebreak
  if (/\btiebreak\b/.test(q) || /\bsuper[- ]?tiebreak\b/.test(q)) return true;
  // Individual game winner within a series (not "win the series" or "win the game")
  if (/\bgame\s+[1-7]\s+winner\b/.test(q)) return true;
  // First-inning props (NRFI/YRFI) — no standard sportsbook equivalent
  if (/\bnrfi\b/i.test(q)) return true;
  if (/\byrfi\b/i.test(q)) return true;
  if (/\b(?:first|1st)\s+inning\b/i.test(q)) return true;
  return false;
}

// Extract the numeric point spread from a Polymarket question.
// Returns a float (e.g. -3.5, +2.5) or null if not found.
function extractSpreadFromQuestion(question) {
  let m;
  // "Berrettini (-2.5)" or "(+3.5)"
  m = question.match(/\(([+-]?\d+(?:\.\d+)?)\)/);
  if (m) return parseFloat(m[1]);

  // "cover -3.5" or "cover the -3.5"
  m = question.match(/cover\s+(?:the\s+)?([+-]?\d+(?:\.\d+)?)/i);
  if (m) return parseFloat(m[1]);

  // "-3.5 run line" / "-3.5 puck line" / "-3.5 set handicap"
  m = question.match(/([+-]?\d+(?:\.\d+)?)\s+(?:run\s*line|puck\s*line|set\s*handicap|spread|runs?\b)/i);
  if (m) return parseFloat(m[1]);

  // "run line -3.5" / "spread -3.5"
  m = question.match(/(?:run\s*line|puck\s*line|spread)\s+([+-]?\d+(?:\.\d+)?)/i);
  if (m) return parseFloat(m[1]);

  return null;
}

// Find the best-matching spread event for a single team name.
// Used when the question names only one side (e.g. "Will the Pirates cover -3.5?").
// endDate: the Polymarket market's endDate — used for date-proximity tie-breaking.
function findSpreadEventForTeam(teamName, spreadsEvents, endDate = null) {
  let bestEvent     = null;
  let bestTeamScore = MIN_MATCH_SCORE - 0.001;
  let bestDateDiff  = Infinity;

  const endMs = endDate ? Date.parse(endDate) : NaN;

  for (const event of spreadsEvents) {
    const homeScore = teamMatchScore(teamName, event.home_team ?? '');
    const awayScore = teamMatchScore(teamName, event.away_team ?? '');
    const teamScore = Math.max(homeScore, awayScore);

    if (teamScore < MIN_MATCH_SCORE) continue;

    let dateDiff = 0;
    if (!isNaN(endMs) && event.commence_time) {
      dateDiff = Math.abs(Date.parse(event.commence_time) - endMs) / 86400000;
      if (dateDiff > 3) continue;
    }

    const betterTeam         = teamScore > bestTeamScore;
    const sameTeamCloserDate = teamScore === bestTeamScore && dateDiff < bestDateDiff;
    if (betterTeam || sameTeamCloserDate) {
      bestTeamScore = teamScore;
      bestDateDiff  = dateDiff;
      bestEvent     = event;
    }
  }

  return bestEvent;
}

// Compute the devigged spread probability for the named team in a specific event.
// Picks the spread outcome whose point value is closest to targetSpread (within ±0.6).
// Weights sharp books 2× like getH2HProbForTeam.
function getSpreadProbForTeam(event, teamName, targetSpread, deviGMethod = 'multiplicative') {
  const SPREAD_TOLERANCE = 0.6;
  const spreadKeys = ['spreads', 'alternate_spreads'];
  const samples = [];

  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      if (!spreadKeys.includes(market.key)) continue;

      const outcomes = market.outcomes ?? [];
      if (outcomes.length < 2) continue;

      // Find the best-matching team outcome
      let teamIdx = -1;
      let bestNameScore = MIN_MATCH_SCORE - 0.001;
      for (let i = 0; i < outcomes.length; i++) {
        const score = teamMatchScore(teamName, outcomes[i].name);
        if (score > bestNameScore) { bestNameScore = score; teamIdx = i; }
      }
      if (teamIdx === -1) continue;

      const teamPoint = outcomes[teamIdx].point ?? 0;

      // If a target spread was found, require it to be within tolerance
      if (targetSpread !== null && Math.abs(teamPoint - targetSpread) > SPREAD_TOLERANCE) continue;

      const impliedProbs = outcomes.map(o => americanToImplied(o.price));
      const total = impliedProbs.reduce((s, p) => s + p, 0);
      if (total <= 0) continue;

      let prob;
      if (deviGMethod === 'additive') {
        const vigPerSide = (total - 1) / outcomes.length;
        const adjusted   = impliedProbs.map(p => Math.max(0, p - vigPerSide));
        const adjSum     = adjusted.reduce((s, p) => s + p, 0);
        prob = adjSum > 0 ? adjusted[teamIdx] / adjSum : impliedProbs[teamIdx] / total;
      } else {
        prob = impliedProbs[teamIdx] / total;
      }

      samples.push({ prob, bookKey: book.key ?? '', bookTitle: book.title ?? '', point: teamPoint });
    }
  }

  if (!samples.length) return null;

  let wSum = 0, wTotal = 0;
  for (const { prob, bookKey } of samples) {
    const w = SHARP_BOOK_KEYS.has(bookKey) ? 2.0 : 1.0;
    wSum   += prob * w;
    wTotal += w;
  }

  const sharpSample = samples.find(s => SHARP_BOOK_KEYS.has(s.bookKey));
  const bestSampleS = sharpSample ?? samples[0];

  // Get bestOdds from the actual sharp/best book (not just the first book in the list)
  let bestOddsS = 0;
  if (bestSampleS) {
    outer: for (const book of event.bookmakers ?? []) {
      if (book.key !== bestSampleS.bookKey) continue;
      for (const market of book.markets ?? []) {
        if (!spreadKeys.includes(market.key)) continue;
        const o = market.outcomes?.find(o =>
          teamMatchScore(teamName, o.name) >= MIN_MATCH_SCORE &&
          (targetSpread === null || Math.abs((o.point ?? 0) - targetSpread) <= SPREAD_TOLERANCE)
        );
        if (o) { bestOddsS = o.price; break outer; }
      }
    }
  }

  return {
    trueProb:      wSum / wTotal,
    totalBooks:    samples.length,
    bestBook:      bestSampleS?.bookTitle ?? '',
    bestOdds:      bestOddsS,
    matchedPoint:  samples[0]?.point ?? null,
    bookBreakdown: collectBookBreakdown(event, teamName, ['spreads', 'alternate_spreads']),
  };
}

// Returns true for questions where YES = the named team DOES NOT do the positive thing.
// Used to flip the sportsbook probability so YES EV is computed against the correct side.
// e.g. "Will the Lakers miss the playoffs?" → YES = Lakers miss → flip sportsbook make-playoffs prob.
// e.g. "Will the Wolves lose to OKC?" → YES = Wolves lose → flip Wolves win probability.
function isNegativeOutcome(question) {
  const q = question.toLowerCase();
  return /\b(miss (?:the )?playoffs?|fail to (?:make|qualify|advance|reach|beat|defeat|win)|be relegated|be swept(?:\s+in|\s+by|$)|not (?:make|qualify|reach|advance the) playoffs?|lose to|fall to|get beaten|lose (?:against|in game))\b/.test(q);
}

// Returns true for questions about a specific game or match (not season-long futures).
// These should only ever be compared against sportsbook H2H game lines.
function isGameQuestion(question) {
  const q = question.toLowerCase();
  return (
    /\b(beat|defeat|vs\.?|against)\b/.test(q) ||
    /\bgame\s+[1-7]\b/.test(q) ||
    /\b(tonight|tomorrow|moneyline)\b/.test(q) ||
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
  const isSpread       = !isChampionship && isSpreadQuestion(question);
  const isTotals       = !isChampionship && !isSpread && isTotalsQuestion(question);
  const isGame         = !isChampionship && !isSpread && !isTotals && isGameQuestion(question);

  // Strict market-type routing: spread → spreads, totals → totals, game → h2h, else → outrights
  const allowedKeys = isSpread
    ? ['spreads', 'alternate_spreads']
    : isTotals
    ? ['totals', 'alternate_totals']
    : isGame
    ? ['h2h']
    : ['outrights'];

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
    if (topicScoped.length > 0) {
      candidates = topicScoped;
    } else {
      // Tournament not present in the API (completed or too far out) — no valid match.
      // Do NOT fall back to the broader pool; that would match a different tournament.
      return null;
    }
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
            noVigProb:       trueProb,
            bestBook:        book.title,
            bestOdds:        outcome.price,
            totalBooks:      allBookProbs.length,
            matchScore:      score,
            matchedOutcome:  outcome.name,
            matchMarketType: market.key,
            event,
            bookBreakdown:   collectBookBreakdown(event, outcome.name, allowedKeys),
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

// Build a per-book odds breakdown for display in the UI.
// Returns entries sorted: sharp books first, then by noVigProb descending.
function collectBookBreakdown(event, targetOutcomeName, allowedKeys = ['outrights', 'h2h']) {
  const seen = new Set();
  const breakdown = [];

  for (const book of event.bookmakers ?? []) {
    if (seen.has(book.key)) continue;

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

      const bookKey = book.key ?? '';
      seen.add(bookKey);
      breakdown.push({
        bookKey,
        bookTitle:    book.title ?? bookKey,
        americanOdds: outcomes[idx].price,
        impliedProb:  impliedProbs[idx],
        noVigProb:    impliedProbs[idx] / total, // multiplicative devig for display
        isSharp:      SHARP_BOOK_KEYS.has(bookKey),
      });
      break; // one entry per book (take first matching market)
    }
  }

  breakdown.sort((a, b) => {
    if (a.isSharp !== b.isSharp) return a.isSharp ? -1 : 1;
    return b.noVigProb - a.noVigProb;
  });

  return breakdown;
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
