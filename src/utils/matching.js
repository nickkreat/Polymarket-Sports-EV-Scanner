const TEAM_ALIASES = {
  'kansas city chiefs': ['chiefs', 'kc chiefs', 'kansas city'],
  'philadelphia eagles': ['eagles', 'philly eagles'],
  'san francisco 49ers': ['49ers', 'niners', 'sf 49ers'],
  'dallas cowboys': ['cowboys', 'dallas'],
  'new england patriots': ['patriots', 'pats'],
  'buffalo bills': ['bills', 'buffalo'],
  'miami dolphins': ['dolphins', 'miami'],
  'new york jets': ['jets', 'ny jets'],
  'new york giants': ['giants', 'ny giants'],
  'pittsburgh steelers': ['steelers', 'pittsburgh'],
  'baltimore ravens': ['ravens', 'baltimore'],
  'cleveland browns': ['browns', 'cleveland'],
  'cincinnati bengals': ['bengals', 'cincinnati'],
  'green bay packers': ['packers', 'green bay'],
  'chicago bears': ['bears', 'chicago'],
  'detroit lions': ['lions', 'detroit'],
  'minnesota vikings': ['vikings', 'minnesota'],
  'seattle seahawks': ['seahawks', 'seattle'],
  'los angeles rams': ['rams', 'la rams'],
  'los angeles chargers': ['chargers', 'la chargers'],
  'las vegas raiders': ['raiders', 'las vegas'],
  'denver broncos': ['broncos', 'denver'],
  'arizona cardinals': ['cardinals', 'arizona'],
  'new orleans saints': ['saints', 'new orleans'],
  'atlanta falcons': ['falcons', 'atlanta'],
  'carolina panthers': ['panthers', 'carolina'],
  'tampa bay buccaneers': ['buccaneers', 'bucs', 'tampa bay'],
  'washington commanders': ['commanders', 'washington'],
  'indianapolis colts': ['colts', 'indianapolis'],
  'jacksonville jaguars': ['jaguars', 'jacksonville'],
  'tennessee titans': ['titans', 'tennessee'],
  'houston texans': ['texans', 'houston'],
  // NBA
  'boston celtics': ['celtics', 'boston'],
  'golden state warriors': ['warriors', 'golden state', 'gsw'],
  'los angeles lakers': ['lakers', 'la lakers'],
  'los angeles clippers': ['clippers', 'la clippers'],
  'brooklyn nets': ['nets', 'brooklyn'],
  'miami heat': ['heat', 'miami heat'],
  'milwaukee bucks': ['bucks', 'milwaukee'],
  'denver nuggets': ['nuggets', 'denver nuggets'],
  'phoenix suns': ['suns', 'phoenix'],
  'oklahoma city thunder': ['thunder', 'okc'],
  'memphis grizzlies': ['grizzlies', 'memphis'],
  'new orleans pelicans': ['pelicans', 'new orleans pelicans'],
  'chicago bulls': ['bulls', 'chicago bulls'],
  'cleveland cavaliers': ['cavaliers', 'cavs', 'cleveland cavs'],
  'atlanta hawks': ['hawks', 'atlanta hawks'],
  'charlotte hornets': ['hornets', 'charlotte'],
  'washington wizards': ['wizards', 'washington wizards'],
  'indiana pacers': ['pacers', 'indiana'],
  'toronto raptors': ['raptors', 'toronto'],
  'new york knicks': ['knicks', 'ny knicks'],
  'philadelphia 76ers': ['76ers', 'sixers', 'philly sixers'],
  'detroit pistons': ['pistons', 'detroit pistons'],
  'minnesota timberwolves': ['timberwolves', 'wolves', 'minnesota t-wolves'],
  'portland trail blazers': ['blazers', 'trail blazers', 'portland'],
  'utah jazz': ['jazz', 'utah'],
  'san antonio spurs': ['spurs', 'san antonio'],
  'dallas mavericks': ['mavericks', 'mavs', 'dallas mavs'],
  'houston rockets': ['rockets', 'houston rockets'],
  'sacramento kings': ['kings', 'sacramento'],
  'orlando magic': ['magic', 'orlando'],
  // MLB
  'new york yankees': ['yankees', 'ny yankees'],
  'boston red sox': ['red sox', 'boston red sox'],
  'los angeles dodgers': ['dodgers', 'la dodgers'],
  'houston astros': ['astros', 'houston astros'],
  'new york mets': ['mets', 'ny mets'],
  'chicago cubs': ['cubs', 'chicago cubs'],
  'chicago white sox': ['white sox', 'chicago white sox'],
  'san francisco giants': ['giants', 'sf giants'],
  'atlanta braves': ['braves', 'atlanta braves'],
  'philadelphia phillies': ['phillies', 'philadelphia phillies'],
};

function normalize(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

function buildAliasMap() {
  const map = {};
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    map[canonical] = canonical;
    for (const alias of aliases) {
      map[normalize(alias)] = canonical;
    }
  }
  return map;
}

const ALIAS_MAP = buildAliasMap();

export function canonicalTeamName(raw) {
  const n = normalize(raw);
  if (ALIAS_MAP[n]) return ALIAS_MAP[n];
  // Try substring match
  for (const [key, canonical] of Object.entries(ALIAS_MAP)) {
    if (n.includes(key) || key.includes(n)) return canonical;
  }
  return n;
}

export function extractTeamFromQuestion(question) {
  const q = normalize(question);

  // Patterns: "will [team] win", "[team] to win", "will [team] make"
  const patterns = [
    /will (?:the )?(.+?) (?:win|make|reach|advance|be named|finish)/i,
    /(?:the )?(.+?) to (?:win|make|reach|advance)/i,
    /(?:^|will )(?:the )?(.+?) (?:win|championship|title)/i,
  ];

  for (const re of patterns) {
    const m = question.match(re);
    if (m) {
      const candidate = m[1].trim();
      const canonical = canonicalTeamName(candidate);
      if (canonical) return canonical;
    }
  }
  return null;
}

// Score how well two team names match (0-1)
export function teamMatchScore(a, b) {
  const ca = canonicalTeamName(a);
  const cb = canonicalTeamName(b);
  if (ca === cb) return 1;
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  return 0;
}
