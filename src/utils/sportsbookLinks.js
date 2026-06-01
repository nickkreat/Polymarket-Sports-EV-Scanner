// Best-effort deep links to sportsbook markets using Odds API event metadata.
// Books do not expose stable public URLs tied to Odds API ids, so we construct
// the most specific URL each book supports for the matched game/market.

function slugify(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function shortTeam(name) {
  const n = String(name ?? '').trim();
  if (!n) return '';
  const parts = n.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : n;
}

function leaguePath(sport = '') {
  const s = sport.toUpperCase();
  if (s === 'NFL')    return { dk: 'football/nfl', fd: 'nfl', pin: 'football/nfl' };
  if (s === 'NBA')    return { dk: 'basketball/nba', fd: 'nba', pin: 'basketball/nba' };
  if (s === 'NHL')    return { dk: 'hockey/nhl', fd: 'nhl', pin: 'hockey/nhl' };
  if (s === 'MLB')    return { dk: 'baseball/mlb', fd: 'mlb', pin: 'baseball/mlb' };
  if (s === 'NCAAF')  return { dk: 'football/ncaaf', fd: 'college-football', pin: 'football/ncaaf' };
  if (s === 'NCAAB')  return { dk: 'basketball/ncaab', fd: 'college-basketball', pin: 'basketball/ncaa' };
  if (s === 'GOLF')   return { dk: 'golf/pga-tour', fd: 'golf', pin: 'golf/pga-tour' };
  if (s === 'SOCCER') return { dk: 'soccer/mls', fd: 'soccer', pin: 'soccer' };
  if (s === 'TENNIS') return { dk: 'tennis/atp-singles', fd: 'tennis', pin: 'tennis' };
  if (s === 'UFC/MMA') return { dk: 'mma/ufc', fd: 'mma', pin: 'mma' };
  return { dk: '', fd: '', pin: '' };
}

function gameTeams(ctx) {
  const home = ctx?.homeTeam ?? ctx?.event?.home_team ?? '';
  const away = ctx?.awayTeam ?? ctx?.event?.away_team ?? '';
  return { home, away };
}

function marketTab(marketType) {
  switch (marketType) {
    case 'spreads':
    case 'alternate_spreads': return 'spread';
    case 'totals':
    case 'alternate_totals':  return 'total';
    case 'h2h':               return 'moneyline';
    default:                  return 'outrights';
  }
}

/**
 * @param {string} bookKey
 * @param {object} ctx
 * @param {string} ctx.sport - inferred sport label (NBA, NFL, …)
 * @param {object} [ctx.event] - Odds API event object
 * @param {string} [ctx.marketType] - h2h | spreads | totals | outrights
 * @param {number|null} [ctx.point] - spread/total line
 * @param {string} [ctx.side] - selected side / outcome
 */
export function getSportsbookMarketUrl(bookKey, ctx = {}) {
  if (ctx.bookUrl) return ctx.bookUrl;

  const sport   = ctx.sport ?? '';
  const event   = ctx.event ?? null;
  const league  = leaguePath(sport);
  const { home, away } = gameTeams(ctx);
  const tab     = marketTab(ctx.marketType);
  const hasGame = home && away;

  switch (bookKey) {
    case 'draftkings': {
      if (hasGame && league.dk) {
        const awaySlug = slugify(shortTeam(away));
        const homeSlug = slugify(shortTeam(home));
        // DraftKings event hub pattern (best-effort; falls back to league page)
        return `https://sportsbook.draftkings.com/leagues/${league.dk}?category=game-lines&subcategory=${tab}`;
      }
      if (league.dk) return `https://sportsbook.draftkings.com/leagues/${league.dk}`;
      return 'https://sportsbook.draftkings.com/';
    }
    case 'fanduel': {
      if (hasGame && league.fd) {
        const matchup = `${slugify(shortTeam(away))}-at-${slugify(shortTeam(home))}`;
        return `https://sportsbook.fanduel.com/navigation/${league.fd}/${matchup}`;
      }
      if (league.fd) return `https://sportsbook.fanduel.com/navigation/${league.fd}`;
      return 'https://sportsbook.fanduel.com/';
    }
    case 'pinnacle': {
      if (hasGame && league.pin) {
        const pinSlug = `${slugify(home)}-vs-${slugify(away)}`;
        return `https://www.pinnacle.com/en/${league.pin}/${pinSlug}/`;
      }
      if (league.pin) return `https://www.pinnacle.com/en/${league.pin}/matchups/`;
      return 'https://www.pinnacle.com/en/sport/matchups';
    }
    case 'betmgm':
      if (hasGame) {
        return `https://sports.betmgm.com/en/sports?query=${encodeURIComponent(`${away} ${home}`)}`;
      }
      return 'https://sports.betmgm.com/en/sports';
    case 'caesars':
    case 'williamhill_us':
      if (hasGame) {
        return `https://www.caesars.com/sportsbook-and-casino/search?query=${encodeURIComponent(`${away} ${home}`)}`;
      }
      return 'https://www.caesars.com/sportsbook-and-casino';
    case 'betrivers':
      if (hasGame && league.dk) {
        return `https://www.betrivers.com/?page=sportsbook&event=${encodeURIComponent(`${away} @ ${home}`)}`;
      }
      return 'https://www.betrivers.com/';
    case 'betonlineag':
    case 'lowvig':
    case 'mybookieag':
      if (hasGame) {
        return `https://www.betonline.ag/sportsbook/basketball/nba/game/${slugify(`${away}-at-${home}`)}`;
      }
      return 'https://www.betonline.ag/sportsbook';
    case 'bovada':
    case 'bovada_us':
      if (hasGame) {
        return `https://www.bovada.lv/sports/basketball/nba/${slugify(`${away}-at-${home}`)}`;
      }
      return 'https://www.bovada.lv/sports';
    case 'betfair_ex_eu':
      return 'https://www.betfair.com/exchange/plus/';
    case 'circa':
      return 'https://www.circasports.com/';
    case 'bookmaker':
      return 'https://www.bookmaker.eu/sportsbook/';
    default:
      return null;
  }
}

export function sportsbookLinkTitle(ctx = {}) {
  const { home, away } = gameTeams(ctx);
  const parts = [];
  if (home && away) parts.push(`${away} @ ${home}`);
  if (ctx.marketType) parts.push(ctx.marketType.replace('alternate_', ''));
  if (ctx.point != null) parts.push(String(ctx.point));
  if (ctx.side) parts.push(String(ctx.side));
  if (ctx.event?.id) parts.push(`event ${ctx.event.id.slice(0, 8)}…`);
  return parts.join(' · ') || 'Open sportsbook';
}
