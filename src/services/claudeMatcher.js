/**
 * Claude API fallback for entity/event matching when alias + fuzzy scores are weak.
 * Only called when local teamMatchScore is below CLAUDE_FALLBACK_THRESHOLD.
 */

export const CLAUDE_FALLBACK_THRESHOLD = 0.7;
export const CLAUDE_CONFIDENCE_MIN     = 0.7;
export const DEFAULT_CLAUDE_MODEL      = 'claude-haiku-4-5-20251001';

const CACHE = new Map();
const MAX_CANDIDATES = 80;

export function clearClaudeMatchCache() {
  CACHE.clear();
}

export function createClaudeMatchStats() {
  return { calls: 0, cacheHits: 0, matches: 0, skipped: 0 };
}

function cacheKey(kind, parts) {
  return `${kind}:${parts.join('::')}`;
}

function parseJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

async function callClaude({ apiKey, model, system, user, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || DEFAULT_CLAUDE_MODEL,
      max_tokens: 256,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const block = data.content?.find(b => b.type === 'text');
  return block?.text ?? '';
}

export function collectUniqueOutcomeNames(events, allowedKeys = ['outrights', 'h2h']) {
  const names = new Set();
  for (const event of events) {
    for (const book of event.bookmakers ?? []) {
      for (const market of book.markets ?? []) {
        if (!allowedKeys.includes(market.key)) continue;
        for (const outcome of market.outcomes ?? []) {
          if (outcome.name) names.add(outcome.name);
        }
      }
    }
  }
  return [...names];
}

export function collectH2HEventSummaries(events, limit = MAX_CANDIDATES) {
  return events.slice(0, limit).map((event, index) => ({
    index,
    event,
    label: formatEventLabel(event),
  }));
}

function formatEventLabel(event) {
  const home = event.home_team ?? '';
  const away = event.away_team ?? '';
  const when = event.commence_time ? event.commence_time.slice(0, 10) : '';
  const sport = event.sport_key ?? '';
  if (home && away) return `${away} @ ${home}${when ? ` (${when})` : ''}${sport ? ` [${sport}]` : ''}`;
  return `${home || away || event.id}${when ? ` (${when})` : ''}${sport ? ` [${sport}]` : ''}`;
}

/**
 * Match an entity name (team/player) to a sportsbook outcome label.
 */
export async function claudeMatchOutcome({
  apiKey,
  model,
  question,
  entityHint,
  candidates,
  marketContext = '',
  signal,
  stats,
}) {
  if (!apiKey || !entityHint || !candidates?.length) return null;

  const limited = candidates.slice(0, MAX_CANDIDATES);
  const key = cacheKey('outcome', [entityHint, question, ...limited]);
  if (CACHE.has(key)) {
    if (stats) stats.cacheHits++;
    return CACHE.get(key);
  }

  const system = 'You match Polymarket sports betting questions to sportsbook outcome names. Reply with JSON only, no markdown.';
  const user = [
    `Polymarket question: "${question}"`,
    `Entity to match: "${entityHint}"`,
    marketContext ? `Context: ${marketContext}` : null,
    '',
    'Pick the single best matching sportsbook outcome from this list, or null if none fit:',
    ...limited.map((c, i) => `${i + 1}. ${c}`),
    '',
    'Return: {"match":"<exact string from list or null>","confidence":0.0}',
    'Use confidence 0.95+ for clear matches, 0.7-0.94 for plausible, below 0.7 for uncertain.',
  ].filter(Boolean).join('\n');

  if (stats) stats.calls++;
  const raw = await callClaude({ apiKey, model, system, user, signal });
  const parsed = parseJsonObject(raw);
  const match = parsed?.match && parsed.match !== 'null' ? String(parsed.match).trim() : null;
  const confidence = Number(parsed?.confidence);

  let resolved = null;
  if (match && Number.isFinite(confidence) && confidence >= CLAUDE_CONFIDENCE_MIN) {
    const exact = limited.find(c => c === match);
    const ci = limited.find(c => c.toLowerCase() === match.toLowerCase());
    resolved = { match: exact ?? ci ?? null, confidence };
    if (resolved.match && stats) stats.matches++;
  } else if (stats) {
    stats.skipped++;
  }

  CACHE.set(key, resolved);
  return resolved;
}

/**
 * Match two teams from a Polymarket game market to the correct H2H/spreads/totals event.
 */
export async function claudeMatchH2HEvent({
  apiKey,
  model,
  question,
  teamA,
  teamB,
  events,
  endDate,
  signal,
  stats,
}) {
  if (!apiKey || !events?.length) return null;

  const summaries = collectH2HEventSummaries(events);
  const key = cacheKey('h2h', [question, teamA, teamB, endDate ?? '', ...summaries.map(s => s.label)]);
  if (CACHE.has(key)) {
    if (stats) stats.cacheHits++;
    return CACHE.get(key);
  }

  const system = 'You match Polymarket game markets to sportsbook events. Reply with JSON only, no markdown.';
  const user = [
    `Polymarket question: "${question}"`,
    `Teams in question: "${teamA}" vs "${teamB}"`,
    endDate ? `Market end date: ${endDate}` : null,
    '',
    'Which sportsbook event is the same game? Pick by index:',
    ...summaries.map(s => `${s.index}. ${s.label}`),
    '',
    'Return: {"eventIndex":<number or null>,"confidence":0.0}',
  ].filter(Boolean).join('\n');

  if (stats) stats.calls++;
  const raw = await callClaude({ apiKey, model, system, user, signal });
  const parsed = parseJsonObject(raw);
  const idx = parsed?.eventIndex;
  const confidence = Number(parsed?.confidence);

  let resolved = null;
  if (Number.isInteger(idx) && idx >= 0 && idx < summaries.length &&
      Number.isFinite(confidence) && confidence >= CLAUDE_CONFIDENCE_MIN) {
    resolved = { event: summaries[idx].event, confidence };
    if (stats) stats.matches++;
  } else if (stats) {
    stats.skipped++;
  }

  CACHE.set(key, resolved);
  return resolved;
}

/**
 * Extract the subject team/player from a Polymarket question when regex fails.
 */
export async function claudeExtractTeam({
  apiKey,
  model,
  question,
  eventTitle = '',
  sportHint = '',
  candidates,
  signal,
  stats,
}) {
  if (!apiKey || !question) return null;

  const limited = (candidates ?? []).slice(0, MAX_CANDIDATES);
  const key = cacheKey('extract', [question, eventTitle, sportHint, ...limited]);
  if (CACHE.has(key)) {
    if (stats) stats.cacheHits++;
    return CACHE.get(key);
  }

  const system = 'You extract the subject team or player from Polymarket sports questions. Reply with JSON only.';
  const user = [
    `Question: "${question}"`,
    eventTitle ? `Event title: "${eventTitle}"` : null,
    sportHint ? `Sport: ${sportHint}` : null,
    limited.length
      ? `\nKnown candidates (prefer exact match from list when possible):\n${limited.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : null,
    '',
    'Return: {"team":"<canonical name or null>","confidence":0.0}',
  ].filter(Boolean).join('\n');

  if (stats) stats.calls++;
  const raw = await callClaude({ apiKey, model, system, user, signal });
  const parsed = parseJsonObject(raw);
  const team = parsed?.team && parsed.team !== 'null' ? String(parsed.team).trim() : null;
  const confidence = Number(parsed?.confidence);

  let resolved = null;
  if (team && Number.isFinite(confidence) && confidence >= CLAUDE_CONFIDENCE_MIN) {
    resolved = { team, confidence };
    if (stats) stats.matches++;
  } else if (stats) {
    stats.skipped++;
  }

  CACHE.set(key, resolved);
  return resolved;
}
