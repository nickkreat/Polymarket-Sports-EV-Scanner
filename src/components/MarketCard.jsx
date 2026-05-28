import { useState } from 'react';
import {
  ExternalLink, Droplets, BarChart3, Calendar, BookOpen,
  AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { impliedToAmerican } from '../utils/odds';

export default function MarketCard({ opp }) {
  const [showBooks, setShowBooks] = useState(false);

  const isPositive = opp.evPct > 0;
  const evClass = isPositive ? 'text-ev-positive' : 'text-ev-negative';
  const bgClass = isPositive ? 'bg-ev-positive border-ev-positive' : 'bg-ev-negative border-ev-negative';

  const isSideYes = opp.side === 'YES';
  const isSideNo  = opp.side === 'NO';
  const isNamedOutcome = !isSideYes && !isSideNo;

  const sideBadgeClass = isSideNo
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : 'bg-green-500/10 text-green-400 border-green-500/20';

  const sideLabel = isNamedOutcome ? opp.side : `BUY ${opp.side}`;

  const mktAmerican   = impliedToAmerican(opp.marketPrice);
  const trueAmerican  = impliedToAmerican(opp.trueProb);
  const bestOddsLabel = opp.bestBook && opp.bestOdds
    ? `Best: ${opp.bestBook} ${formatAmerican(opp.bestOdds)}`
    : null;

  return (
    <div className={`rounded-xl border p-4 transition-colors hover:bg-[#1e1e21] ${bgClass} bg-[#18181b]`}>
      {/* Top row: sport badge + EV */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            {opp.sport}
          </span>
          <span
            className={`px-2 py-0.5 rounded-md text-xs font-bold border ${sideBadgeClass}`}
            title={isNamedOutcome ? `Buy "${opp.side}" to win` : undefined}
          >
            {sideLabel}
          </span>
        </div>

        <div className="text-right flex-shrink-0">
          <div className={`text-2xl font-black tabular-nums ${evClass}`}>
            {isPositive ? '+' : ''}{opp.evPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide">EV</div>
          {opp.suspiciousEv && (
            <div className="flex items-center justify-end gap-1 mt-1" title="EV >200% — verify this match manually before betting">
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              <span className="text-[10px] text-yellow-500 font-medium">Verify match</span>
            </div>
          )}
        </div>
      </div>

      {/* Question */}
      <a href={opp.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-1.5 mb-4">
        <p className="text-sm font-medium text-zinc-100 group-hover:text-green-400 transition-colors leading-snug line-clamp-2">
          {opp.question}
        </p>
        <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-green-400 flex-shrink-0 mt-0.5 transition-colors" />
      </a>

      {/* Probability comparison */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <ProbBox
          label="Polymarket"
          american={mktAmerican}
          sublabel={isNamedOutcome ? 'outcome price' : `${opp.side} price`}
          color="zinc"
        />
        <ProbBox
          label="Sportsbooks"
          american={trueAmerican}
          sublabel={`no-vig (${opp.totalBooks} books)`}
          color={isPositive ? 'green' : 'red'}
          bestLine={bestOddsLabel}
        />
      </div>

      {/* EV breakdown row */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <EVRow label="YES EV" value={opp.yesEv} />
        <EVRow label="NO EV"  value={opp.noEv}  />
      </div>

      {/* Sportsbook odds breakdown */}
      <div className="mb-4">
        <button
          onClick={() => setShowBooks(v => !v)}
          className="flex items-center justify-between w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1"
        >
          <span>Sportsbook Odds ({opp.bookBreakdown?.length ?? opp.totalBooks} books)</span>
          {showBooks
            ? <ChevronUp   className="w-3.5 h-3.5 flex-shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
        </button>

        {showBooks && (
          <div className="mt-1 space-y-px">
            {!opp.bookBreakdown?.length ? (
              <p className="text-xs text-zinc-600 italic px-1 py-1">
                Book detail unavailable — rescan to populate.
              </p>
            ) : (
              opp.bookBreakdown.map(entry => {
                const url = getSportsbookUrl(entry.bookKey);
                const isBest = entry.bookTitle === opp.bestBook;
                const favorable = entry.americanOdds > mktAmerican;

                return (
                  <div
                    key={entry.bookKey}
                    className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs ${
                      isBest ? 'border-l-2 border-green-500 bg-green-500/5 pl-1' : ''
                    }`}
                  >
                    <span className="w-3 text-center flex-shrink-0 text-yellow-400">
                      {entry.isSharp ? '⚡' : ''}
                    </span>
                    <span className="flex-1 text-zinc-400 truncate min-w-0">{entry.bookTitle}</span>
                    <span className={`tabular-nums font-medium flex-shrink-0 ${favorable ? 'text-green-400' : 'text-zinc-400'}`}>
                      {formatAmerican(entry.americanOdds)}
                    </span>
                    <span className="text-zinc-600 w-14 text-right tabular-nums flex-shrink-0">
                      {(entry.noVigProb * 100).toFixed(1)}%
                    </span>
                    <span className="w-4 flex-shrink-0 flex justify-center">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-blue-400 transition-colors">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <ExternalLink className="w-3 h-3 text-zinc-800" />
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Kelly sizing */}
      <KellySection kelly={opp.kelly} side={opp.side} />

      {/* Footer: metadata */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#27272a] flex-wrap">
        <Meta
          icon={<BookOpen className="w-3 h-3" />}
          label={opp.bestBook && opp.bestOdds
            ? `${opp.bestBook} ${formatAmerican(opp.bestOdds)}`
            : opp.bestBook ?? '—'}
        />
        <Meta icon={<Droplets className="w-3 h-3" />} label={`$${formatNum(opp.liquidity)} liq`} />
        <Meta icon={<BarChart3 className="w-3 h-3" />} label={`$${formatNum(opp.volume)} vol`}   />
        {opp.endDate && (
          <Meta icon={<Calendar className="w-3 h-3" />} label={formatDate(opp.endDate)} />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProbBox({ label, american, sublabel, color, bestLine }) {
  const colorMap = { zinc: 'text-zinc-100', green: 'text-green-400', red: 'text-red-400' };
  return (
    <div className="bg-[#111113] rounded-lg p-2.5 text-center">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${colorMap[color]}`}>
        {formatAmerican(american)}
      </div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{sublabel}</div>
      {bestLine && (
        <div className="text-[10px] text-green-500/60 mt-0.5 truncate">{bestLine}</div>
      )}
    </div>
  );
}

function EVRow({ label, value }) {
  const pos = value > 0;
  return (
    <div className="flex items-center justify-between bg-[#111113] rounded-lg px-2.5 py-1.5">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-semibold tabular-nums ${pos ? 'text-green-400' : 'text-red-400'}`}>
        {pos ? '+' : ''}{value.toFixed(1)}%
      </span>
    </div>
  );
}

function KellySection({ kelly, side }) {
  return (
    <div className="bg-[#111113] rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-400 font-medium">Kelly Sizing</span>
        <span className="text-[10px] text-zinc-600">{(kelly.fraction * 100).toFixed(0)}% Kelly</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <KellyStat label="Full Kelly" value={`${(kelly.fullKellyPct * 100).toFixed(1)}%`} />
        <KellyStat label="Adjusted"   value={`${(kelly.adjustedPct  * 100).toFixed(1)}%`} highlight />
        <KellyStat
          label="Bet Size"
          value={`$${kelly.betSize < 10 ? kelly.betSize.toFixed(2) : Math.round(kelly.betSize).toLocaleString()}`}
          highlight
        />
      </div>
      <div className="mt-2">
        <div className="h-1 bg-[#27272a] rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${Math.min(kelly.adjustedPct * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function KellyStat({ label, value, highlight }) {
  return (
    <div>
      <div className={`text-sm font-bold tabular-nums ${highlight ? 'text-green-400' : 'text-zinc-100'}`}>
        {value}
      </div>
      <div className="text-[10px] text-zinc-600 leading-none mt-0.5">{label}</div>
    </div>
  );
}

function Meta({ icon, label }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-zinc-500">
      {icon}
      <span>{label}</span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmerican(n) {
  if (!n && n !== 0) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

function formatNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function getSportsbookUrl(bookKey) {
  switch (bookKey) {
    case 'betonlineag':       return 'https://www.betonline.ag/sportsbook';
    case 'bovada_us':
    case 'bovada':            return 'https://www.bovada.lv/sports';
    case 'draftkings':        return 'https://sportsbook.draftkings.com/';
    case 'fanduel':           return 'https://sportsbook.fanduel.com/';
    case 'betmgm':            return 'https://sports.betmgm.com/en/sports';
    case 'caesars':
    case 'williamhill_us':    return 'https://www.caesars.com/sportsbook-and-casino';
    case 'pinnacle':          return 'https://www.pinnacle.com/en/sport/matchups';
    case 'betfair_ex_eu':     return 'https://www.betfair.com/exchange/plus/';
    case 'lowvig':            return 'https://www.lowvig.ag/';
    case 'mybookieag':        return 'https://mybookie.ag/sportsbook/';
    case 'superbook':         return 'https://co.superbook.com/sports';
    case 'unibet_us':         return 'https://www.unibet.com/betting/sports/';
    case 'pointsbetus':       return 'https://www.pointsbet.com/sports';
    case 'betrivers':         return 'https://www.betrivers.com/';
    case 'barstool':          return 'https://www.barstoolsportsbook.com/';
    case 'foxbet':            return 'https://www.foxbet.com/';
    case 'twinspires':        return 'https://www.twinspires.com/sports/';
    case 'wynnbet':           return 'https://www.wynnbet.com/sports/';
    case 'circa':             return 'https://www.circasports.com/';
    case 'bookmaker':         return 'https://www.bookmaker.eu/sportsbook/';
    default:                  return null;
  }
}
