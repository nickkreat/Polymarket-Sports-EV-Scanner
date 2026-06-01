import { americanToDecimal } from './odds.js';

/** Parse American odds from "+330", "330", "-110", etc. */
export function parseAmericanOdds(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().replace(/,/g, '');
  const n = Number(s.replace(/^\+/, ''));
  if (Number.isNaN(n) || n === 0) return null;
  return s.startsWith('-') || (s.includes('-') && !s.startsWith('+')) ? -Math.abs(n) : n;
}

export function formatAmerican(american) {
  if (american == null || Number.isNaN(american)) return '—';
  return american > 0 ? `+${american}` : String(american);
}

export function impliedFromAmerican(american) {
  return 1 / americanToDecimal(american);
}

/**
 * Devig a single implied probability using DK hold assumption.
 * @param {'multiply'|'divide'} method
 *   multiply — implied × multiplier (default 0.926)
 *   divide   — implied / (1 − hold) e.g. 8% hold → /0.92
 */
export function devigSharpImplied(implied, { method = 'multiply', multiplier = 0.926, holdPct = 8 } = {}) {
  if (method === 'divide') {
    const hold = holdPct / 100;
    if (hold >= 1) return implied;
    return implied / (1 - hold);
  }
  return implied * multiplier;
}

/** EV% = (trueProb × polyDecimal − 1) × 100 */
export function manualEvPercent(trueProb, polyDecimal) {
  return (trueProb * polyDecimal - 1) * 100;
}

/** Full Kelly fraction f* = (b×p − q) / b where b = polyDecimal − 1 */
export function manualKellyFraction(polyDecimal, trueProb) {
  const b = polyDecimal - 1;
  const p = trueProb;
  const q = 1 - p;
  if (b <= 0 || p <= 0 || p >= 1) return 0;
  return Math.max(0, (b * p - q) / b);
}

export function analyzeManualLine(
  { name, dk, poly },
  {
    devigMethod = 'multiply',
    devigMultiplier = 0.926,
    holdPct = 8,
    kellyFraction = 1,
    bankroll = 1000,
  } = {}
) {
  const dkAmerican = parseAmericanOdds(dk);
  const polyAmerican = parseAmericanOdds(poly);
  if (!name?.trim() || dkAmerican == null || polyAmerican == null) {
    return { name: name?.trim() || '', error: 'Invalid name or odds' };
  }

  const dkDecimal = americanToDecimal(dkAmerican);
  const polyDecimal = americanToDecimal(polyAmerican);
  const dkImplied = 1 / dkDecimal;
  const polyImplied = 1 / polyDecimal;
  const devigged = devigSharpImplied(dkImplied, { method: devigMethod, multiplier: devigMultiplier, holdPct });
  const evPct = manualEvPercent(devigged, polyDecimal);
  const fullKelly = manualKellyFraction(polyDecimal, devigged);
  const kellyPct = fullKelly * kellyFraction;
  const betSize = kellyPct * bankroll;

  return {
    name: name.trim(),
    dkAmerican,
    polyAmerican,
    dkDecimal,
    polyDecimal,
    dkImpliedPct: dkImplied * 100,
    polyImpliedPct: polyImplied * 100,
    deviggedPct: devigged * 100,
    trueProb: devigged,
    evPct,
    fullKellyPct: fullKelly * 100,
    kellyPct: kellyPct * 100,
    betSize,
  };
}

/** Parse pasted lines: "Name, +330, +421" or tab-separated */
export function parsePastedLines(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^player|name|dk|poly/i.test(trimmed)) continue;

    const parts = trimmed.split(/[\t|,|]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      rows.push({ name: parts[0], dk: parts[1], poly: parts[2] });
      continue;
    }

    const match = trimmed.match(/^(.+?)\s+([+-]?\d+)\s+([+-]?\d+)\s*$/);
    if (match) {
      rows.push({ name: match[1].trim(), dk: match[2], poly: match[3] });
    }
  }
  return rows;
}

export function analyzeAll(rows, options = {}) {
  const { minEvPct = 0, minKellyPct = 0.2 } = options;
  return rows
    .map(row => analyzeManualLine(row, options))
    .filter(r => !r.error)
    .sort((a, b) => b.evPct - a.evPct)
    .map(r => ({
      ...r,
      passesFilter: r.evPct > minEvPct && r.kellyPct >= minKellyPct,
    }));
}

export function toSheetsTsv(rows, { includeAll = false } = {}) {
  const data = includeAll ? rows : rows.filter(r => r.passesFilter);
  const header = [
    'Player', 'DK', 'DK%', 'Devig%', 'Poly', 'Poly%', 'EV%', 'Kelly%', 'Bet$',
  ].join('\t');
  const lines = data.map(r => [
    r.name,
    formatAmerican(r.dkAmerican),
    r.dkImpliedPct.toFixed(2),
    r.deviggedPct.toFixed(2),
    formatAmerican(r.polyAmerican),
    r.polyImpliedPct.toFixed(2),
    r.evPct.toFixed(2),
    r.kellyPct.toFixed(2),
    r.betSize.toFixed(2),
  ].join('\t'));
  return [header, ...lines].join('\n');
}

/** Schwab ~2:37 AM reference — Mac ~+25% EV; Ryan ~+30% EV at 50% Kelly */
export const SCHWAB_DEMO_LINES = [
  { name: 'Mac Meissner', dk: 330, poly: 480 },
  { name: 'Ryan Gerard', dk: 440, poly: 660 },
  { name: 'Russell Henley', dk: 450, poly: 502 },
];
