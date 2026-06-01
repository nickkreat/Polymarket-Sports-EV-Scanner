import {
  americanFromOddsPapiPrice,
  buildOutrightEvent,
  fetchJson,
  getCached,
  setCached,
  tournamentMatchesHint,
} from './shared.js';

const BASE = 'https://api.oddspapi.io/v4';

// Preferred US books — resolved against GET /v4/bookmakers (Odds API slugs ≠ OddsPapi slugs).
const PREFERRED_US_BOOKS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'pinnacle',
  'caesars',
  'williamhill',
  'betrivers',
  'espnbet',
  'hardrockbet',
  'fanatics',
];

const BOOK_TITLES = {
  draftkings:   'DraftKings',
  fanduel:      'FanDuel',
  betmgm:       'BetMGM',
  pinnacle:     'Pinnacle',
  caesars:      'Caesars',
  williamhill:  'Caesars',
  betrivers:    'BetRivers',
  espnbet:      'ESPN BET',
  hardrockbet:  'Hard Rock',
  fanatics:     'Fanatics',
};

async function fetchBookmakerSlugs(apiKey) {
  const cacheKey = `papi|bookmakers|${apiKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await fetchJson(`${BASE}/bookmakers?${qp({ apiKey, language: 'en' })}`);
  const slugs = new Set((data ?? []).map(b => String(b.slug ?? '').toLowerCase()).filter(Boolean));
  setCached(cacheKey, slugs);
  return slugs;
}

async function resolveUsBookmakerSlugs(apiKey, { maxBooks = 4 } = {}) {
  const available = await fetchBookmakerSlugs(apiKey);
  const matched = PREFERRED_US_BOOKS.filter(slug => available.has(slug));
  if (matched.length) return matched.slice(0, maxBooks);
  if (available.has('pinnacle')) return ['pinnacle'];
  return ['pinnacle'];
}

function mergeFixtures(fixturesLists) {
  const byKey = new Map();
  for (const fixtures of fixturesLists) {
    for (const fixture of fixtures ?? []) {
      const key = fixture.fixtureId ?? `${fixture.tournamentId ?? ''}|${fixture.startTime ?? ''}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, fixture);
        continue;
      }
      existing.bookmakerOdds = {
        ...(existing.bookmakerOdds ?? {}),
        ...(fixture.bookmakerOdds ?? {}),
      };
    }
  }
  return [...byKey.values()];
}

async function fetchOddsByTournamentsForBook(apiKey, tournamentIds, bookmaker) {
  const cacheKey = `papi|odds|${tournamentIds.join(',')}|${bookmaker ?? 'all'}|${apiKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const params = {
    apiKey,
    tournamentIds: tournamentIds.join(','),
    oddsFormat: 'american',
    language: 'en',
    verbosity: '3',
  };
  if (bookmaker) params.bookmaker = bookmaker;

  const data = await fetchJson(`${BASE}/odds-by-tournaments?${qp(params)}`);
  setCached(cacheKey, data);
  return data;
}

async function fetchOddsByTournaments(apiKey, tournamentIds, { maxBooks = 3 } = {}) {
  if (!tournamentIds.length) return [];

  // Prefer one request with all bookmakers (docs default) — saves quota on free tier.
  try {
    const allBooks = await fetchOddsByTournamentsForBook(apiKey, tournamentIds, null);
    if (Array.isArray(allBooks) && allBooks.length) return allBooks;
  } catch (err) {
    const msg = err.message ?? String(err);
    const needsSingleBook =
      /exactly one bookmaker|bookmaker query parameter|invalid number of bookmakers|invalid bookmaker/i.test(msg);
    if (!needsSingleBook) throw err;
    console.debug('[OddsPapi] All-bookmakers request unavailable — fetching per bookmaker');
  }

  const slugs = await resolveUsBookmakerSlugs(apiKey, { maxBooks });
  const results = await Promise.all(
    slugs.map(slug =>
      fetchOddsByTournamentsForBook(apiKey, tournamentIds, slug).catch(err => {
        console.warn(`[OddsPapi] ${slug} odds fetch failed:`, err.message ?? err);
        return [];
      })
    )
  );
  return mergeFixtures(results);
}

function qp(params) {
  return new URLSearchParams(params).toString();
}

async function fetchSports(apiKey) {
  const cacheKey = `papi|sports|${apiKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const data = await fetchJson(`${BASE}/sports?${qp({ apiKey, language: 'en' })}`);
  setCached(cacheKey, data);
  return data;
}

async function fetchTournaments(apiKey, sportId) {
  const cacheKey = `papi|tournaments|${sportId}|${apiKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const data = await fetchJson(`${BASE}/tournaments?${qp({ apiKey, sportId, language: 'en' })}`);
  setCached(cacheKey, data);
  return data;
}

function normalizeFixturesResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['fixtures', 'data', 'results', 'items']) {
      if (Array.isArray(data[key])) return data[key];
    }
    if (data.fixtureId) return [data];
  }
  return [];
}

async function fetchJsonAllowEmpty(url) {
  try {
    return await fetchJson(url);
  } catch (err) {
    const msg = err.message ?? String(err);
    if (/404|FIXTURE_NOT_FOUND|not found/i.test(msg)) return [];
    throw err;
  }
}

async function fetchFixturesForTournament(apiKey, sportId, tournamentId, bookmaker) {
  const cacheKey = `papi|fixtures|${tournamentId}|${bookmaker ?? 'all'}|${apiKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const from30 = new Date(now.getTime() - 14 * 86400000).toISOString();
  const to60 = new Date(now.getTime() + 60 * 86400000).toISOString();

  // Docs: with tournamentId, from/to are optional — try minimal filters first (bookmaker+hasOdds often 404s for golf).
  const attempts = [
    { apiKey, sportId, tournamentId, language: 'en' },
    { apiKey, sportId, tournamentId, statusId: 0, language: 'en' },
    { apiKey, sportId, tournamentId, hasOdds: 'true', language: 'en' },
    { apiKey, sportId, tournamentId, from: from30, to: to60, language: 'en' },
    { apiKey, sportId, tournamentId, from: from30, to: to60, hasOdds: 'true', language: 'en' },
  ];
  if (bookmaker) {
    attempts.push({
      apiKey, sportId, tournamentId, hasOdds: 'true', bookmakers: bookmaker, language: 'en',
    });
  }

  for (const params of attempts) {
    const data = await fetchJsonAllowEmpty(`${BASE}/fixtures?${qp(params)}`);
    const list = normalizeFixturesResponse(data);
    if (list.length) {
      setCached(cacheKey, list);
      return list;
    }
  }

  setCached(cacheKey, []);
  return [];
}

async function fetchOddsForFixture(apiKey, fixtureId, bookmaker) {
  const cacheKey = `papi|fixture-odds|${fixtureId}|${bookmaker ?? 'all'}|${apiKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const params = {
    apiKey,
    fixtureId,
    oddsFormat: 'american',
    language: 'en',
    verbosity: '3',
  };
  if (bookmaker) params.bookmakers = bookmaker;

  const data = await fetchJsonAllowEmpty(`${BASE}/odds?${qp(params)}`);
  if (!data || (Array.isArray(data) && !data.length)) return null;
  const fixture = data?.fixtureId ? data : normalizeFixturesResponse(data)[0] ?? null;
  if (fixture) setCached(cacheKey, fixture);
  return fixture;
}

function mergePlayerIntoBookMap(bookMap, bookKey, bookData, name, price) {
  if (!name || price == null || bookData.bookmakerIsActive === false) return;
  let book = bookMap.get(bookKey);
  if (!book) {
    book = {
      key: bookKey,
      title: BOOK_TITLES[bookKey] ?? bookKey,
      url: bookData.fixturePath ?? null,
      markets: [{ key: 'outrights', outcomes: [] }],
    };
    bookMap.set(bookKey, book);
  }
  const outcomes = book.markets[0].outcomes;
  const key = name.toLowerCase();
  if (outcomes.some(o => o.name.toLowerCase() === key)) return;
  outcomes.push({ name, price });
  if (bookData.fixturePath) book.url = bookData.fixturePath;
}

async function ingestFixtureOdds(apiKey, fix, bookSlug, bookMap) {
  const odds = fix.bookmakerOdds
    ? fix
    : await fetchOddsForFixture(apiKey, fix.fixtureId, bookSlug);
  if (!odds) return false;

  const name = (odds.participant1Name ?? fix.participant1Name)?.trim();
  if (name && looksLikeGolferName(name) && !isGolfRoundMatchup(odds)) {
    for (const [bookKey, bookData] of Object.entries(odds.bookmakerOdds ?? {})) {
      const price = extractFutureWinnerPrice(bookData);
      if (price != null) mergePlayerIntoBookMap(bookMap, bookKey, bookData, name, price);
    }
  }

  for (const [bookKey, bookData] of Object.entries(odds.bookmakerOdds ?? {})) {
    for (const { name, price } of collectOutrightPlayers(bookData)) {
      mergePlayerIntoBookMap(bookMap, bookKey, bookData, name, price);
    }
  }
  return true;
}

function looksLikeGolferName(name) {
  const n = String(name ?? '').trim();
  if (n.length < 4 || n.length > 45) return false;
  if (/^(over|under|draw|yes|no|field|tournament|winner|outright)$/i.test(n)) return false;
  if (/^\d/.test(n)) return false;
  return /^[A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+)+$/.test(n);
}

function isGolfRoundMatchup(fixture) {
  const p1 = (fixture?.participant1Name ?? '').trim();
  const p2 = (fixture?.participant2Name ?? '').trim();
  if (!p1 || !p2) return false;
  return looksLikeGolferName(p1) && looksLikeGolferName(p2);
}

function isGolfFutureFixture(fixture) {
  if (isGolfRoundMatchup(fixture)) return false;
  const p1 = (fixture?.participant1Name ?? '').trim();
  const p2 = (fixture?.participant2Name ?? '').trim();
  const label = `${p1} ${p2} ${fixture?.tournamentName ?? ''}`.toLowerCase();

  if (p1 && looksLikeGolferName(p1)) {
    if (!p2 || /^(field|tournament|winner|outright|yes|no|draw)$/i.test(p2)) return true;
    if (!looksLikeGolferName(p2)) return true;
  }

  // Single aggregated outright fixture (tournament name as participant)
  if (/charles schwab|colonial|heritage|travelers|memorial|bmw|players championship|genesis|pga tour|fedex|tour championship/i.test(label)) {
    return true;
  }
  return false;
}

function isNonOutrightOutcome(player, { allowMoneyline = false } = {}) {
  const oid = String(player?.bookmakerOutcomeId ?? '').toLowerCase();
  if (/^\d+(\.\d+)?\/(over|under)$/.test(oid)) return true;
  if (!allowMoneyline && /^(over|under|home|away|draw|yes|no)$/.test(oid)) return true;
  return false;
}

function extractFutureWinnerPrice(bookData) {
  for (const market of Object.values(bookData?.markets ?? {})) {
    const mid = String(market.bookmakerMarketId ?? market.marketName ?? '').toLowerCase();
    if (/total|spread|handicap|both teams/.test(mid) && !/winner|outright|champion|to win/.test(mid)) {
      continue;
    }
    for (const outcome of Object.values(market.outcomes ?? {})) {
      for (const player of Object.values(outcome.players ?? {})) {
        if (player.active === false) continue;
        const oid = String(player.bookmakerOutcomeId ?? '').toLowerCase();
        if (/^\d+(\.\d+)?\/(over|under)$/.test(oid)) continue;
        if (player.playerName?.trim() || /^(home|yes|winner)$/.test(oid)) {
          const price = americanFromOddsPapiPrice(player);
          if (price != null) return price;
        }
      }
    }
  }
  return null;
}

function findGolfSportId(sports) {
  if (!Array.isArray(sports)) return null;
  const golf = sports.find(s =>
    String(s.slug ?? '').includes('golf') ||
    String(s.sportName ?? '').toLowerCase().includes('golf')
  );
  return golf?.sportId ?? null;
}

function collectOutrightPlayers(bookData) {
  const players = [];
  for (const market of Object.values(bookData.markets ?? {})) {
    const mid = String(market.bookmakerMarketId ?? market.marketName ?? '').toLowerCase();
    if (/total|spread|handicap|both teams/.test(mid) && !/winner|outright|champion|to win/.test(mid)) {
      continue;
    }
    for (const outcome of Object.values(market.outcomes ?? {})) {
      for (const player of Object.values(outcome.players ?? {})) {
        if (player.active === false || isNonOutrightOutcome(player)) continue;
        const name = player.playerName?.trim();
        const price = americanFromOddsPapiPrice(player);
        if (!name || price == null) continue;
        if (name.length < 3 || /^(over|under|draw|yes|no)$/i.test(name)) continue;
        players.push({ name, price });
      }
    }
  }
  return players;
}

function countOutrightPlayers(events) {
  return events[0]?.bookmakers?.[0]?.markets?.[0]?.outcomes?.length ?? 0;
}

async function fetchGolfTournamentOutrights(apiKey, tournament, golfSportId, { maxFixtureOddsCalls = 40 } = {}) {
  const bookmakerSlugs = await resolveUsBookmakerSlugs(apiKey, { maxBooks: 3 });
  const primaryBook = bookmakerSlugs[0] ?? 'pinnacle';

  let fixtures = [];
  try {
    fixtures = normalizeFixturesResponse(
      await fetchOddsByTournaments(apiKey, [tournament.tournamentId], { maxBooks: bookmakerSlugs.length })
    );
  } catch (err) {
    console.warn('[OddsPapi] odds-by-tournaments failed:', err.message ?? err);
  }

  let events = fixturesToOutrightEvents(fixtures, tournament);
  if (countOutrightPlayers(events) >= 5) {
    return { events, meta: { source: 'odds-by-tournaments', players: countOutrightPlayers(events) } };
  }

  const bookMap = new Map();
  let futuresScanned = 0;

  // Path B: fixture IDs from odds-by-tournaments (avoids relying on /fixtures for golf)
  const bulkCandidates = fixtures.filter(f => {
    if (!f.fixtureId) return false;
    if (isGolfFutureFixture(f)) return true;
    for (const bookData of Object.values(f.bookmakerOdds ?? {})) {
      if (collectOutrightPlayers(bookData).length >= 3) return true;
    }
    return false;
  });
  for (const fix of bulkCandidates.slice(0, maxFixtureOddsCalls)) {
    if (futuresScanned >= maxFixtureOddsCalls) break;
    futuresScanned++;
    await ingestFixtureOdds(apiKey, fix, primaryBook, bookMap);
  }

  // Path C: /fixtures with relaxed filters (404 → empty, not fatal)
  if (countOutrightPlayersFromMap(bookMap) < 5) {
    for (const bookSlug of bookmakerSlugs) {
      const fixtureList = await fetchFixturesForTournament(
        apiKey, golfSportId, tournament.tournamentId, bookSlug
      );
      const futures = fixtureList.filter(f => f.fixtureId && isGolfFutureFixture(f));
      const budget = Math.max(0, maxFixtureOddsCalls - futuresScanned);

      for (const fix of futures.slice(0, budget)) {
        futuresScanned++;
        await ingestFixtureOdds(apiKey, fix, bookSlug, bookMap);
      }
      if (countOutrightPlayersFromMap(bookMap) >= 5) break;
    }
  }

  const bookmakers = [...bookMap.values()].filter(b => b.markets[0].outcomes.length > 0);
  if (bookmakers.length) {
    const title = tournament.tournamentName ?? 'PGA Tour';
    const topicSlug = tournament.tournamentSlug ?? String(tournament.tournamentId);
    events = [buildOutrightEvent({
      id: `oddspapi-golf-${tournament.tournamentId}-${topicSlug}`,
      sportKey: 'golf_pga_tour',
      title,
      commenceTime: fixtures.find(f => f.startTime)?.startTime ?? null,
      bookmakers,
      source: 'oddspapi-futures',
      fixturePath: bookmakers[0]?.url ?? null,
    })];
    return {
      events,
      meta: {
        source: futuresScanned ? 'fixture-odds' : 'odds-by-tournaments',
        players: countOutrightPlayers(events),
        futuresScanned,
        bulkFixtures: fixtures.length,
      },
    };
  }

  return {
    events,
    meta: {
      source: 'odds-by-tournaments',
      players: countOutrightPlayers(events),
      futuresScanned,
      bulkFixtures: fixtures.length,
      message: events.length ? 'partial' : 'no winner odds parsed',
    },
  };
}

function countOutrightPlayersFromMap(bookMap) {
  return [...bookMap.values()].reduce((n, b) => n + (b.markets[0].outcomes.length ?? 0), 0);
}

function selectPgaTournaments(tournaments, tournamentFilter) {
  const activePattern =
    /pga tour|charles schwab|colonial|heritage|travelers|memorial|bmw|players championship|genesis|john deere|rocket mortgage|wyndham|fedex|tour championship|scottish open|canadian open|zurich|arnold palmer|hero world|ryder cup/i;

  return (tournaments ?? []).filter(t => {
    const label = `${t.tournamentName ?? ''} ${t.tournamentSlug ?? ''}`;
    const hasFixtures =
      (t.futureFixtures ?? 0) + (t.upcomingFixtures ?? 0) + (t.liveFixtures ?? 0) > 0;
    return hasFixtures && (tournamentFilter(label, t.tournamentSlug ?? '') || activePattern.test(label));
  });
}

function extractPlayerOutcomesFromFixture(fixture) {
  const players = [];
  for (const bookData of Object.values(fixture.bookmakerOdds ?? {})) {
    for (const market of Object.values(bookData.markets ?? {})) {
      for (const outcome of Object.values(market.outcomes ?? {})) {
        for (const player of Object.values(outcome.players ?? {})) {
          const name = player.playerName?.trim();
          const price = americanFromOddsPapiPrice(player);
          if (!name || price == null || player.active === false) continue;
          players.push({ name, price, bookKey: null, fixturePath: bookData.fixturePath ?? null });
        }
      }
    }
  }
  return players;
}

function fixturesToOutrightEvents(fixtures, tournament) {
  const title = tournament.tournamentName ?? 'PGA Tour';
  const topicSlug = tournament.tournamentSlug ?? String(tournament.tournamentId);
  const eventId = `oddspapi-golf-${tournament.tournamentId}-${topicSlug}`;

  const bookMap = new Map();

  for (const fixture of fixtures) {
    if (fixture.tournamentId && tournament.tournamentId &&
        fixture.tournamentId !== tournament.tournamentId) continue;

    for (const [bookKey, bookData] of Object.entries(fixture.bookmakerOdds ?? {})) {
      if (bookData.bookmakerIsActive === false) continue;

      let book = bookMap.get(bookKey);
      if (!book) {
        book = {
          key: bookKey,
          title: BOOK_TITLES[bookKey] ?? bookKey,
          url: bookData.fixturePath ?? null,
          markets: [{ key: 'outrights', outcomes: [] }],
        };
        bookMap.set(bookKey, book);
      }

      const outcomes = book.markets[0].outcomes;
      const seen = new Set(outcomes.map(o => o.name.toLowerCase()));

      for (const { name, price } of collectOutrightPlayers(bookData)) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        outcomes.push({ name, price });
      }

      const p1 = fixture.participant1Name?.trim();
      if (p1 && looksLikeGolferName(p1) && !isGolfRoundMatchup(fixture)) {
        const price = extractFutureWinnerPrice(bookData);
        if (price != null && !seen.has(p1.toLowerCase())) {
          seen.add(p1.toLowerCase());
          outcomes.push({ name: p1, price });
        }
      }

      if (bookData.fixturePath) book.url = bookData.fixturePath;
    }
  }

  const bookmakers = [...bookMap.values()].filter(b => b.markets[0].outcomes.length > 0);
  if (!bookmakers.length) return [];

  const commence = fixtures.find(f => f.startTime)?.startTime ?? null;
  return [buildOutrightEvent({
    id: eventId,
    sportKey: 'golf_pga_tour',
    title,
    commenceTime: commence,
    bookmakers,
    source: 'oddspapi',
    fixturePath: bookmakers[0]?.url ?? null,
  })];
}

/**
 * Step 2 — list golf tournaments and check Charles Schwab coverage.
 */
export async function probeOddsPapiGolf(apiKey) {
  if (!apiKey) {
    return { ok: false, error: 'No OddsPapi API key configured', charlesSchwabFound: false };
  }

  try {
    const sports = await fetchSports(apiKey);
    const golfSportId = findGolfSportId(sports);
    if (!golfSportId) {
      return { ok: false, error: 'Golf sport not found in OddsPapi /sports', charlesSchwabFound: false };
    }

    const tournaments = await fetchTournaments(apiKey, golfSportId);
    const active = selectPgaTournaments(tournaments, tournamentMatchesHint);

    const schwab = active.find(t => /charles schwab|colonial/i.test(`${t.tournamentName} ${t.tournamentSlug}`));
    let samplePlayers = [];
    let schwabOddsError = null;

    if (schwab) {
      try {
        const { events, meta } = await fetchGolfTournamentOutrights(
          apiKey, schwab, golfSportId, { maxFixtureOddsCalls: 25 }
        );
        samplePlayers = events[0]?.bookmakers?.[0]?.markets?.[0]?.outcomes?.slice(0, 8).map(o => o.name) ?? [];
        if (!samplePlayers.length) {
          const parts = [
            `Tournament listed (${schwab.futureFixtures ?? 0} future, ${schwab.upcomingFixtures ?? 0} upcoming)`,
            meta.bulkFixtures != null ? `${meta.bulkFixtures} bulk fixtures` : null,
            meta.futuresScanned ? `scanned ${meta.futuresScanned} for winner odds` : null,
            meta.message,
          ].filter(Boolean);
          schwabOddsError = parts.join(' — ') || 'No winner odds parsed yet';
        }
      } catch (err) {
        schwabOddsError = err.message ?? String(err);
      }
    }

    const bookmakersUsed = (await resolveUsBookmakerSlugs(apiKey, { maxBooks: 2 })).join(',');

    return {
      ok: true,
      golfSportId,
      bookmakersUsed,
      tournamentCount: active.length,
      tournaments: active.slice(0, 15).map(t => ({
        id: t.tournamentId,
        name: t.tournamentName,
        slug: t.tournamentSlug,
        future: t.futureFixtures,
        upcoming: t.upcomingFixtures,
      })),
      charlesSchwabFound: Boolean(schwab) && samplePlayers.length > 0,
      charlesSchwabListed: Boolean(schwab),
      charlesSchwabTournament: schwab ? { id: schwab.tournamentId, name: schwab.tournamentName } : null,
      samplePlayers,
      schwabOddsError,
    };
  } catch (err) {
    return { ok: false, error: err.message ?? String(err), charlesSchwabFound: false };
  }
}

/**
 * Step 3 — fetch golf tournament outrights and normalize to scanner event shape.
 */
export async function fetchOddsPapiGolfOutrights(apiKey, { tournamentFilter = tournamentMatchesHint } = {}) {
  if (!apiKey) return { events: [], meta: { skipped: true, reason: 'no key' } };

  try {
    const sports = await fetchSports(apiKey);
    const golfSportId = findGolfSportId(sports);
    if (!golfSportId) return { events: [], meta: { error: 'no golf sport' } };

    const tournaments = await fetchTournaments(apiKey, golfSportId);
    const selected = selectPgaTournaments(tournaments, tournamentFilter);

    if (!selected.length) {
      return { events: [], meta: { golfSportId, tournaments: 0, message: 'no matching PGA tournaments' } };
    }

    const ids = selected.map(t => t.tournamentId);
    const bookmakerSlugs = await resolveUsBookmakerSlugs(apiKey, { maxBooks: 3 });

    const events = [];
    for (const tournament of selected) {
      const { events: tEvents } = await fetchGolfTournamentOutrights(
        apiKey, tournament, golfSportId, { maxFixtureOddsCalls: 35 }
      );
      events.push(...tEvents);
    }

    return {
      events,
      meta: {
        golfSportId,
        bookmakersUsed: bookmakerSlugs.join(','),
        tournaments: selected.length,
        events: events.length,
        players: events[0]?.bookmakers?.[0]?.markets?.[0]?.outcomes?.length ?? 0,
      },
    };
  } catch (err) {
    console.warn('[OddsPapi] Golf fetch failed:', err);
    return { events: [], meta: { error: err.message ?? String(err) } };
  }
}
