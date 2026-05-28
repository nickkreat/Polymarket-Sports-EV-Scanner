// ── Team / Player aliases ─────────────────────────────────────────────────────
// Format: 'canonical name': ['alias1', 'alias2', ...]
// All strings are lowercased; normalize() strips punctuation and collapses spaces.

const NFL_ALIASES = {
  'kansas city chiefs': ['chiefs', 'kc chiefs', 'kansas city'],
  'philadelphia eagles': ['eagles', 'philly eagles'],
  'san francisco 49ers': ['49ers', 'niners', 'sf 49ers'],
  'dallas cowboys': ['cowboys', 'dallas'],
  'new england patriots': ['patriots', 'pats'],
  'buffalo bills': ['bills', 'buffalo'],
  'miami dolphins': ['dolphins'],
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
  'tampa bay buccaneers': ['buccaneers', 'bucs', 'tampa bay', 'tampa'],
  'washington commanders': ['commanders', 'washington'],
  'indianapolis colts': ['colts', 'indianapolis', 'indy'],
  'jacksonville jaguars': ['jaguars', 'jags', 'jacksonville'],
  'tennessee titans': ['titans', 'tennessee'],
  'houston texans': ['texans', 'houston'],
};

const NBA_ALIASES = {
  'boston celtics': ['celtics', 'boston'],
  'golden state warriors': ['warriors', 'golden state', 'gsw'],
  'los angeles lakers': ['lakers', 'la lakers'],
  'los angeles clippers': ['clippers', 'la clippers'],
  'brooklyn nets': ['nets', 'brooklyn'],
  'miami heat': ['heat', 'miami heat'],
  'milwaukee bucks': ['bucks', 'milwaukee'],
  'denver nuggets': ['nuggets', 'denver nuggets'],
  'phoenix suns': ['suns', 'phoenix'],
  'oklahoma city thunder': ['thunder', 'okc', 'oklahoma city'],
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
  'philadelphia 76ers': ['76ers', 'sixers', 'philly sixers', 'philadelphia sixers'],
  'detroit pistons': ['pistons', 'detroit pistons'],
  'minnesota timberwolves': ['timberwolves', 'wolves', 'minnesota wolves'],
  'portland trail blazers': ['blazers', 'trail blazers', 'portland'],
  'utah jazz': ['jazz', 'utah'],
  'san antonio spurs': ['spurs', 'san antonio'],
  'dallas mavericks': ['mavericks', 'mavs', 'dallas mavs'],
  'houston rockets': ['rockets', 'houston rockets'],
  'sacramento kings': ['kings', 'sacramento'],
  'orlando magic': ['magic', 'orlando'],
};

const MLB_ALIASES = {
  'arizona diamondbacks': ['diamondbacks', 'd-backs', 'dbacks', 'arizona'],
  'atlanta braves': ['braves', 'atlanta braves'],
  'baltimore orioles': ['orioles', 'baltimore'],
  'boston red sox': ['red sox', 'boston red sox', 'bosox'],
  'chicago cubs': ['cubs', 'chicago cubs'],
  'chicago white sox': ['white sox', 'chicago white sox'],
  'cincinnati reds': ['reds', 'cincinnati reds'],
  'cleveland guardians': ['guardians', 'cleveland guardians'],
  'colorado rockies': ['rockies', 'colorado'],
  'detroit tigers': ['tigers', 'detroit tigers'],
  'houston astros': ['astros', 'houston astros'],
  'kansas city royals': ['royals', 'kc royals', 'kansas city royals'],
  'los angeles angels': ['angels', 'la angels', 'anaheim angels'],
  'los angeles dodgers': ['dodgers', 'la dodgers'],
  'miami marlins': ['marlins', 'miami marlins'],
  'milwaukee brewers': ['brewers', 'milwaukee'],
  'minnesota twins': ['twins', 'minnesota twins'],
  'new york mets': ['mets', 'ny mets'],
  'new york yankees': ['yankees', 'ny yankees', 'bronx bombers'],
  'oakland athletics': ['athletics', 'a\'s', 'oakland a\'s', 'sacramento athletics'],
  'philadelphia phillies': ['phillies', 'philadelphia phillies'],
  'pittsburgh pirates': ['pirates', 'pittsburgh pirates'],
  'san diego padres': ['padres', 'san diego'],
  'san francisco giants': ['giants', 'sf giants'],
  'seattle mariners': ['mariners', 'seattle'],
  'st louis cardinals': ['cardinals', 'st louis', 'stl cardinals'],
  'tampa bay rays': ['rays', 'tampa bay rays'],
  'texas rangers': ['rangers', 'texas rangers'],
  'toronto blue jays': ['blue jays', 'jays', 'toronto'],
  'washington nationals': ['nationals', 'nats', 'washington nationals'],
};

const NHL_ALIASES = {
  'anaheim ducks': ['ducks', 'anaheim'],
  'boston bruins': ['bruins', 'boston bruins'],
  'buffalo sabres': ['sabres', 'buffalo'],
  'calgary flames': ['flames', 'calgary'],
  'carolina hurricanes': ['hurricanes', 'canes', 'carolina'],
  'chicago blackhawks': ['blackhawks', 'hawks', 'chicago blackhawks'],
  'colorado avalanche': ['avalanche', 'avs', 'colorado'],
  'columbus blue jackets': ['blue jackets', 'jackets', 'columbus'],
  'dallas stars': ['stars', 'dallas stars'],
  'detroit red wings': ['red wings', 'wings', 'detroit red wings'],
  'edmonton oilers': ['oilers', 'edmonton'],
  'florida panthers': ['florida panthers', 'florida'],
  'las vegas golden knights': ['golden knights', 'knights', 'vegas golden knights', 'vgk'],
  'los angeles kings': ['kings', 'la kings'],
  'minnesota wild': ['wild', 'minnesota wild'],
  'montreal canadiens': ['canadiens', 'habs', 'montreal'],
  'nashville predators': ['predators', 'preds', 'nashville'],
  'new jersey devils': ['devils', 'new jersey'],
  'new york islanders': ['islanders', 'ny islanders'],
  'new york rangers': ['rangers', 'ny rangers'],
  'ottawa senators': ['senators', 'sens', 'ottawa'],
  'philadelphia flyers': ['flyers', 'philadelphia flyers'],
  'pittsburgh penguins': ['penguins', 'pens', 'pittsburgh penguins'],
  'san jose sharks': ['sharks', 'san jose'],
  'seattle kraken': ['kraken', 'seattle kraken'],
  'st louis blues': ['blues', 'st louis blues'],
  'tampa bay lightning': ['lightning', 'bolts', 'tampa lightning'],
  'toronto maple leafs': ['maple leafs', 'leafs', 'toronto maple leafs'],
  'utah hockey club': ['utah hockey', 'utah mammoth', 'mammoth', 'utah hc'],
  'vancouver canucks': ['canucks', 'vancouver'],
  'washington capitals': ['capitals', 'caps', 'washington capitals'],
  'winnipeg jets': ['jets', 'winnipeg'],
};

const MLS_ALIASES = {
  'atlanta united': ['atlanta united', 'atl united'],
  'austin fc': ['austin fc', 'austin'],
  'chicago fire': ['chicago fire', 'fire'],
  'colorado rapids': ['rapids', 'colorado rapids'],
  'columbus crew': ['crew', 'columbus crew'],
  'dc united': ['dc united', 'united'],
  'fc cincinnati': ['fc cincinnati', 'cincinnati fc'],
  'fc dallas': ['fc dallas', 'dallas fc'],
  'houston dynamo': ['dynamo', 'houston dynamo'],
  'inter miami': ['inter miami', 'miami fc', 'miami'],
  'la galaxy': ['galaxy', 'la galaxy', 'los angeles galaxy'],
  'lafc': ['lafc', 'los angeles fc', 'la fc'],
  'minnesota united': ['minnesota united', 'loons'],
  'montreal impact': ['impact', 'montreal', 'cf montreal'],
  'nashville sc': ['nashville sc', 'nashville soccer'],
  'new england revolution': ['revolution', 'revs', 'new england revolution'],
  'new york city fc': ['nycfc', 'nyc fc', 'new york city fc'],
  'new york red bulls': ['red bulls', 'ny red bulls'],
  'orlando city': ['orlando city', 'orlando sc'],
  'philadelphia union': ['union', 'philadelphia union'],
  'portland timbers': ['timbers', 'portland timbers'],
  'real salt lake': ['real salt lake', 'rsl'],
  'san jose earthquakes': ['earthquakes', 'quakes', 'san jose earthquakes'],
  'seattle sounders': ['sounders', 'seattle sounders'],
  'sporting kansas city': ['sporting kc', 'sporting kansas city', 'skc'],
  'st louis city': ['st louis city', 'stl city'],
  'toronto fc': ['toronto fc', 'tfc'],
  'vancouver whitecaps': ['whitecaps', 'vancouver whitecaps'],
};

const EPL_ALIASES = {
  'arsenal': ['arsenal fc', 'the gunners', 'gunners'],
  'aston villa': ['villa', 'aston villa fc'],
  'brentford': ['brentford fc', 'the bees'],
  'brighton': ['brighton fc', 'brighton hove albion', 'seagulls'],
  'burnley': ['burnley fc', 'clarets'],
  'chelsea': ['chelsea fc', 'the blues'],
  'crystal palace': ['palace', 'crystal palace fc', 'eagles'],
  'everton': ['everton fc', 'toffees'],
  'fulham': ['fulham fc', 'cottagers'],
  'liverpool': ['liverpool fc', 'reds', 'the reds'],
  'luton town': ['luton', 'the hatters'],
  'manchester city': ['man city', 'manchester city fc', 'city'],
  'manchester united': ['man utd', 'manchester united fc', 'united', 'man united'],
  'newcastle united': ['newcastle', 'newcastle fc', 'magpies', 'toon'],
  'nottingham forest': ['forest', 'nottm forest', 'nffc'],
  'sheffield united': ['sheffield utd', 'blades'],
  'tottenham hotspur': ['spurs', 'tottenham', 'thfc'],
  'west ham united': ['west ham', 'hammers'],
  'wolverhampton wanderers': ['wolves', 'wolverhampton', 'wanderers'],
};

// ── Golf Players ──────────────────────────────────────────────────────────────
const GOLF_PLAYERS = {
  'scottie scheffler': ['scheffler', 's scheffler', 's. scheffler'],
  'rory mcilroy': ['mcilroy', 'r mcilroy', 'r. mcilroy'],
  'jon rahm': ['rahm', 'j rahm', 'j. rahm'],
  'viktor hovland': ['hovland', 'v hovland', 'v. hovland'],
  'xander schauffele': ['schauffele', 'x schauffele', 'x. schauffele'],
  'patrick cantlay': ['cantlay', 'p cantlay', 'p. cantlay'],
  'collin morikawa': ['morikawa', 'c morikawa', 'c. morikawa'],
  'tommy fleetwood': ['fleetwood', 't fleetwood', 't. fleetwood'],
  'tony finau': ['finau', 't finau', 't. finau'],
  'matt fitzpatrick': ['fitzpatrick', 'm fitzpatrick', 'm. fitzpatrick'],
  'max homa': ['homa', 'm homa', 'm. homa'],
  'hideki matsuyama': ['matsuyama', 'h matsuyama', 'h. matsuyama'],
  'justin thomas': ['jt', 'j thomas', 'j. thomas'],
  'jordan spieth': ['spieth', 'j spieth', 'j. spieth'],
  'brooks koepka': ['koepka', 'b koepka', 'b. koepka'],
  'dustin johnson': ['dj', 'd johnson', 'd. johnson'],
  'bryson dechambeau': ['dechambeau', 'bryson', 'b dechambeau', 'b. dechambeau'],
  'wyndham clark': ['clark', 'w clark', 'w. clark'],
  'brian harman': ['harman', 'b harman', 'b. harman'],
  'cameron smith': ['cam smith', 'c smith', 'c. smith'],
  'adam scott': ['a scott', 'a. scott'],
  'jason day': ['j day', 'j. day'],
  'keegan bradley': ['bradley', 'k bradley', 'k. bradley'],
  'tyrrell hatton': ['hatton', 't hatton', 't. hatton'],
  'sepp straka': ['straka', 's straka', 's. straka'],
  'robert macintyre': ['macintyre', 'r macintyre', 'r. macintyre', 'bob mac'],
  'russell henley': ['henley', 'r henley', 'r. henley'],
  'lucas glover': ['glover', 'l glover', 'l. glover'],
  'akshay bhatia': ['bhatia', 'a bhatia', 'a. bhatia'],
  'sahith theegala': ['theegala', 's theegala', 's. theegala'],
  'sungjae im': ['im', 's im', 's. im'],
  'si woo kim': ['si woo', 'siwoo kim', 's kim'],
  'corey conners': ['conners', 'c conners', 'c. conners'],
  'cameron young': ['c young', 'c. young'],
  'taylor pendrith': ['pendrith', 't pendrith', 't. pendrith'],
  'min woo lee': ['min woo', 'minwoo lee', 'm lee'],
  'tom kim': ['t kim', 't. kim'],
  'ludvig aberg': ['aberg', 'l aberg', 'l. aberg'],
  'patrick reed': ['reed', 'p reed', 'p. reed'],
  'shane lowry': ['lowry', 's lowry', 's. lowry'],
  'lee westwood': ['westwood', 'l westwood'],
  'webb simpson': ['simpson', 'w simpson', 'w. simpson'],
  'bubba watson': ['bubba', 'b watson', 'b. watson'],
  'rickie fowler': ['fowler', 'r fowler', 'r. fowler'],
  'phil mickelson': ['mickelson', 'lefty', 'p mickelson', 'p. mickelson'],
  'tiger woods': ['tiger', 't woods', 't. woods'],
  'rory mcilroy': ['rory'],
  'nick taylor': ['n taylor', 'n. taylor'],
  'harris english': ['english', 'h english', 'h. english'],
  'sam burns': ['burns', 's burns', 's. burns'],
  'billy horschel': ['horschel', 'b horschel', 'b. horschel'],
  'chris kirk': ['c kirk', 'c. kirk'],
  'adam hadwin': ['hadwin', 'a hadwin', 'a. hadwin'],
  'denny mccarthy': ['mccarthy', 'd mccarthy', 'd. mccarthy'],
  'eric cole': ['e cole', 'e. cole'],
  'emiliano grillo': ['grillo', 'e grillo', 'e. grillo'],
};

// ── Tennis Players (ATP) ──────────────────────────────────────────────────────
const TENNIS_ATP = {
  'novak djokovic': ['djokovic', 'nole', 'n djokovic', 'n. djokovic'],
  'carlos alcaraz': ['alcaraz', 'c alcaraz', 'c. alcaraz'],
  'jannik sinner': ['sinner', 'j sinner', 'j. sinner'],
  'daniil medvedev': ['medvedev', 'd medvedev', 'd. medvedev'],
  'alexander zverev': ['zverev', 'sascha', 'a zverev', 'a. zverev'],
  'andrey rublev': ['rublev', 'a rublev', 'a. rublev'],
  'holger rune': ['rune', 'h rune', 'h. rune'],
  'casper ruud': ['ruud', 'c ruud', 'c. ruud'],
  'stefanos tsitsipas': ['tsitsipas', 's tsitsipas', 's. tsitsipas'],
  'taylor fritz': ['fritz', 't fritz', 't. fritz'],
  'ben shelton': ['shelton', 'b shelton', 'b. shelton'],
  'frances tiafoe': ['tiafoe', 'f tiafoe', 'f. tiafoe'],
  'felix auger-aliassime': ['auger-aliassime', 'faa', 'felix auger', 'f auger'],
  'hubert hurkacz': ['hurkacz', 'hubi', 'h hurkacz', 'h. hurkacz'],
  'grigor dimitrov': ['dimitrov', 'g dimitrov', 'g. dimitrov'],
  'tommy paul': ['t paul', 't. paul'],
  'sebastian korda': ['korda', 's korda', 's. korda'],
  'ugo humbert': ['humbert', 'u humbert', 'u. humbert'],
  'lorenzo musetti': ['musetti', 'l musetti', 'l. musetti'],
  'karen khachanov': ['khachanov', 'k khachanov', 'k. khachanov'],
  'tomas machac': ['machac', 't machac', 't. machac'],
  'nicolas jarry': ['jarry', 'n jarry', 'n. jarry'],
  'alex de minaur': ['de minaur', 'demon', 'a de minaur'],
  'jack draper': ['draper', 'j draper', 'j. draper'],
  'arthur fils': ['fils', 'a fils', 'a. fils'],
  'flavio cobolli': ['cobolli', 'f cobolli', 'f. cobolli'],
  'jiri lehecka': ['lehecka', 'j lehecka', 'j. lehecka'],
  'nikoloz basilashvili': ['basilashvili', 'n basilashvili'],
  'pablo carreno busta': ['carreno busta', 'pcb', 'p carreno'],
  'rafael nadal': ['nadal', 'rafa', 'r nadal', 'r. nadal'],
  'roger federer': ['federer', 'fed', 'r federer', 'r. federer'],
};

// ── Tennis Players (WTA) ──────────────────────────────────────────────────────
const TENNIS_WTA = {
  'aryna sabalenka': ['sabalenka', 'a sabalenka', 'a. sabalenka'],
  'iga swiatek': ['swiatek', 'i swiatek', 'i. swiatek'],
  'coco gauff': ['gauff', 'c gauff', 'c. gauff'],
  'elena rybakina': ['rybakina', 'e rybakina', 'e. rybakina'],
  'jessica pegula': ['pegula', 'j pegula', 'j. pegula'],
  'karolina muchova': ['muchova', 'k muchova', 'k. muchova'],
  'marketa vondrousova': ['vondrousova', 'm vondrousova', 'm. vondrousova'],
  'madison keys': ['keys', 'm keys', 'm. keys'],
  'emma navarro': ['navarro', 'e navarro', 'e. navarro'],
  'barbora krejcikova': ['krejcikova', 'b krejcikova', 'b. krejcikova'],
  'mirra andreeva': ['andreeva', 'm andreeva', 'm. andreeva'],
  'daria kasatkina': ['kasatkina', 'd kasatkina', 'd. kasatkina'],
  'beatriz haddad maia': ['haddad maia', 'bia haddad', 'b haddad'],
  'jasmine paolini': ['paolini', 'j paolini', 'j. paolini'],
  'danielle collins': ['collins', 'd collins', 'd. collins'],
  'anna kalinskaya': ['kalinskaya', 'a kalinskaya', 'a. kalinskaya'],
  'marta kostyuk': ['kostyuk', 'm kostyuk', 'm. kostyuk'],
  'linda noskova': ['noskova', 'l noskova', 'l. noskova'],
  'paula badosa': ['badosa', 'p badosa', 'p. badosa'],
  'donna vekic': ['vekic', 'd vekic', 'd. vekic'],
  'victoria azarenka': ['azarenka', 'vika', 'v azarenka', 'v. azarenka'],
  'elina svitolina': ['svitolina', 'e svitolina', 'e. svitolina'],
  'maria sakkari': ['sakkari', 'm sakkari', 'm. sakkari'],
  'qinwen zheng': ['zheng', 'q zheng', 'q. zheng'],
  'anna putintseva': ['putintseva', 'a putintseva', 'a. putintseva'],
  'elise mertens': ['mertens', 'e mertens', 'e. mertens'],
  'sorana cirstea': ['cirstea', 's cirstea', 's. cirstea'],
  'petra kvitova': ['kvitova', 'p kvitova', 'p. kvitova'],
  'simona halep': ['halep', 's halep', 's. halep'],
  'serena williams': ['serena', 's williams'],
};

// ── NASCAR Drivers ────────────────────────────────────────────────────────────
const NASCAR_DRIVERS = {
  'kyle larson': ['larson', 'k larson', 'k. larson'],
  'denny hamlin': ['hamlin', 'd hamlin', 'd. hamlin'],
  'ryan blaney': ['blaney', 'r blaney', 'r. blaney'],
  'william byron': ['byron', 'w byron', 'w. byron'],
  'martin truex jr': ['truex', 'martin truex', 'mtj', 'm truex'],
  'tyler reddick': ['reddick', 't reddick', 't. reddick'],
  'kyle busch': ['k busch', 'k. busch'],
  'chase elliott': ['elliott', 'c elliott', 'c. elliott'],
  'ross chastain': ['chastain', 'r chastain', 'r. chastain'],
  'joey logano': ['logano', 'j logano', 'j. logano'],
  'christopher bell': ['bell', 'c bell', 'c. bell'],
  'austin cindric': ['cindric', 'a cindric', 'a. cindric'],
  'brad keselowski': ['keselowski', 'b keselowski', 'b. keselowski'],
  'bubba wallace': ['bubba', 'b wallace', 'b. wallace'],
  'alex bowman': ['bowman', 'a bowman', 'a. bowman'],
  'chase briscoe': ['briscoe', 'c briscoe', 'c. briscoe'],
  'chris buescher': ['buescher', 'c buescher', 'c. buescher'],
  'ricky stenhouse jr': ['stenhouse', 'r stenhouse', 'rsj'],
  'michael mcdowell': ['mcdowell', 'm mcdowell', 'm. mcdowell'],
  'corey lajoie': ['lajoie', 'c lajoie', 'c. lajoie'],
  'aric almirola': ['almirola', 'a almirola', 'a. almirola'],
  'daniel suarez': ['suarez', 'd suarez', 'd. suarez'],
  'noah gragson': ['gragson', 'n gragson', 'n. gragson'],
  'austin dillon': ['a dillon', 'a. dillon'],
  'ty gibbs': ['gibbs', 't gibbs', 't. gibbs'],
};

// ── Formula 1 Drivers ─────────────────────────────────────────────────────────
const F1_DRIVERS = {
  'max verstappen': ['verstappen', 'max', 'm verstappen', 'm. verstappen'],
  'lewis hamilton': ['hamilton', 'l hamilton', 'l. hamilton'],
  'charles leclerc': ['leclerc', 'c leclerc', 'c. leclerc'],
  'carlos sainz': ['sainz', 'c sainz', 'c. sainz'],
  'lando norris': ['norris', 'l norris', 'l. norris'],
  'fernando alonso': ['alonso', 'f alonso', 'f. alonso'],
  'george russell': ['russell', 'g russell', 'g. russell'],
  'sergio perez': ['perez', 'checo', 's perez', 's. perez'],
  'oscar piastri': ['piastri', 'o piastri', 'o. piastri'],
  'lance stroll': ['stroll', 'l stroll', 'l. stroll'],
  'pierre gasly': ['gasly', 'p gasly', 'p. gasly'],
  'esteban ocon': ['ocon', 'e ocon', 'e. ocon'],
  'valtteri bottas': ['bottas', 'v bottas', 'v. bottas'],
  'guanyu zhou': ['zhou', 'g zhou', 'g. zhou'],
  'nico hulkenberg': ['hulkenberg', 'hulk', 'n hulkenberg', 'n. hulkenberg'],
  'kevin magnussen': ['magnussen', 'k-mag', 'k magnussen', 'k. magnussen'],
  'alexander albon': ['albon', 'a albon', 'a. albon'],
  'yuki tsunoda': ['tsunoda', 'y tsunoda', 'y. tsunoda'],
  'daniel ricciardo': ['ricciardo', 'd ricciardo', 'd. ricciardo'],
  'logan sargeant': ['sargeant', 'l sargeant', 'l. sargeant'],
  'oliver bearman': ['bearman', 'o bearman', 'o. bearman'],
  'jack doohan': ['doohan', 'j doohan', 'j. doohan'],
  'isack hadjar': ['hadjar', 'i hadjar', 'i. hadjar'],
  'andrea kimi antonelli': ['antonelli', 'kimi antonelli', 'a antonelli'],
  'gabriel bortoleto': ['bortoleto', 'g bortoleto', 'g. bortoleto'],
  'liam lawson': ['lawson', 'l lawson', 'l. lawson'],
  'franco colapinto': ['colapinto', 'f colapinto', 'f. colapinto'],
};

// ── Build combined alias map ──────────────────────────────────────────────────
const TEAM_ALIASES = {
  ...NFL_ALIASES,
  ...NBA_ALIASES,
  ...MLB_ALIASES,
  ...NHL_ALIASES,
  ...MLS_ALIASES,
  ...EPL_ALIASES,
  ...GOLF_PLAYERS,
  ...TENNIS_ATP,
  ...TENNIS_WTA,
  ...NASCAR_DRIVERS,
  ...F1_DRIVERS,
};

function normalize(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

function buildAliasMap() {
  const map = {};
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const normCanonical = normalize(canonical);
    map[normCanonical] = normCanonical;
    for (const alias of aliases) {
      map[normalize(alias)] = normCanonical;
    }
  }
  return map;
}

const ALIAS_MAP = buildAliasMap();

// ── Caches — same names repeat thousands of times across bookmakers ───────────
const _canonCache  = new Map();
const _scoreCache  = new Map();

export function canonicalTeamName(raw) {
  if (_canonCache.has(raw)) return _canonCache.get(raw);

  const n = normalize(raw);
  let result = ALIAS_MAP[n];

  if (!result && n.length >= 4) {
    for (const [key, canonical] of Object.entries(ALIAS_MAP)) {
      if (key.length >= 4 && (n.includes(key) || key.includes(n))) {
        result = canonical;
        break;
      }
    }
  }

  result = result ?? n;
  _canonCache.set(raw, result);
  return result;
}

// Word-level token overlap — useful for player names (e.g. "Scheffler" vs "S. Scheffler")
function tokenOverlapScore(a, b) {
  const ta = normalize(a).split(' ').filter(t => t.length > 2);
  const tb = normalize(b).split(' ').filter(t => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  const shared = [...sa].filter(t => sb.has(t)).length;
  return shared / Math.max(sa.size, sb.size);
}

// Score how well two team/player names match (0–1)
// Cached — the same (a,b) pair is checked across many bookmakers/markets.
export function teamMatchScore(a, b) {
  // Symmetric key
  const key = a <= b ? `${a}|||${b}` : `${b}|||${a}`;
  if (_scoreCache.has(key)) return _scoreCache.get(key);

  const ca = canonicalTeamName(a);
  const cb = canonicalTeamName(b);

  let score = 0;
  if (ca === cb) {
    score = 1;
  } else {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) {
      score = 1;
    } else {
      // Require the shorter string to be >= 50% the length of the longer before
      // awarding a substring-match bonus.  Without this, "jordan" (6 chars)
      // would score 0.85 against "jordan spieth" (13 chars).
      const longer  = Math.max(na.length, nb.length);
      const shorter = Math.min(na.length, nb.length);
      if (shorter / longer >= 0.5 && (na.includes(nb) || nb.includes(na))) {
        score = 0.85;
      } else {
        const overlap = tokenOverlapScore(a, b);
        if (overlap >= 0.8)      score = 0.8;
        else if (overlap >= 0.5) score = 0.65;
      }
    }
  }

  _scoreCache.set(key, score);
  return score;
}

// ── Sports-only market filter ─────────────────────────────────────────────────
// Rejects political, entertainment, financial, and other non-sports questions.
const NON_SPORTS_KEYWORDS = [
  // Politics
  'president', 'election', 'elect', 'nominee', 'nomination', 'democrat',
  'republican', 'senate', 'congress', 'house of representatives', 'vote',
  'voting', 'ballot', 'primary', 'candidate', 'governor', 'mayor', 'minister',
  'parliament', 'referendum', 'polling', 'impeach', 'inaugur',
  // Entertainment / awards
  'oscar', 'emmy', 'grammy', 'golden globe', 'academy award', 'bafta',
  'celebrity', 'actor', 'actress', 'director', 'film', 'movie', 'album',
  'song', 'music', 'billboard', 'gramophone', 'reality tv', 'bachelor',
  'rihanna', 'taylor swift', 'beyonce', 'drake', 'kanye west',
  // Tech / gaming (non-sports)
  'gta vi', 'gta 6', 'video game', 'playstation', 'xbox release',
  // Finance / crypto
  'bitcoin', 'ethereum', 'crypto', 'stock', 's&p', 'nasdaq', 'dow jones',
  'fed rate', 'interest rate', 'gdp', 'inflation', 'recession',
  // Science / nature
  'spacex', 'rocket', 'launch', 'climate', 'temperature', 'hurricane',
  'earthquake', 'vaccine', 'clinical trial',
  // Sports-adjacent non-bettable (no sportsbook equivalent)
  'head coach of', 'fired as coach', 'hired as coach',
  'trade deadline', 'drafted by', 'sign with the',
  // LIV Golf / player movement (no sportsbook market to cross-reference)
  'join liv', 'joins liv', 'liv golf', 'defect to liv', 'move to liv',
  'sign with liv', 'return to pga', 'suspended by pga', 'pga tour ban',
];

export function isSportsMarket(question) {
  const q = question.toLowerCase();
  return !NON_SPORTS_KEYWORDS.some(kw => q.includes(kw));
}

// Extract the subject team/player from a Polymarket question string.
// Returns the canonical name, or null if no pattern matched.
export function extractTeamFromQuestion(question) {
  const patterns = [
    // "Spread: White Sox (-3.5)" / "Set Handicap: Berrettini (-2.5)" — team before point spread
    /^(?:spread|set handicap|run line|puck line|handicap):\s*(.+?)\s*\([+-]?\d/i,
    // "Will the Heat beat/defeat/top/overcome the Celtics?"
    /will (?:the )?(.+?) (?:beat|defeat|overcome|outperform|top|outplay|outlast)/i,
    // "Will the Chiefs win/make/advance/clinch…?"
    /will (?:the )?(.+?) (?:win|make|reach|advance|be named|finish|clinch|capture|claim|repeat|retain|cover|go undefeated)/i,
    // "Will the Bears be eliminated/knocked out/miss the playoffs?"
    /will (?:the )?(.+?) (?:be eliminated|get eliminated|be knocked out|be upset|lose in|miss (?:the )?playoffs?|fail to (?:make|qualify|advance|reach)|be relegated)/i,
    // "Chiefs to win/beat/advance"
    /(?:^|[^a-z])(?:the )?(.+?) to (?:win|beat|defeat|make|reach|advance|qualify|clinch|retain)/i,
    // "Heat vs Celtics" / "Will the Heat vs Celtics" / "NBA: Heat vs Celtics"
    // — extract the team appearing immediately before "vs"
    /(?:^|[:\-–]\s*)(?:the )?([A-Za-z][A-Za-z ]{1,30}?) vs\.?(?:\s|$)/i,
    // "Will the Chiefs win the championship/title" (backup)
    /(?:^|will )(?:the )?(.+?) (?:win|championship|title|cup|trophy)/i,
    // "Kansas City Chiefs Super Bowl winner?" / "Thunder NBA Finals odds?"
    /^(?:the )?(.+?) (?:super bowl|championship|stanley cup|world series|nba finals|pennant|trophy|odds|chance)/i,
    // "Who wins the Super Bowl — Chiefs?" — team after dash or em-dash
    /[—\-–]\s*(?:the )?([A-Z][a-z]+(?: [A-Z][a-z]+)+)/,
    // "Super Bowl winner: Kansas City Chiefs?" — team after colon
    /(?:championship|cup|title|trophy|super bowl|world series|nba finals|wimbledon|masters|open|winner|champion)[^:]*:\s*(?:the )?(.+?)(?:\?|$)/i,
    // "Will [Player] win [Tournament]" already covered, but add "earn/take/grab/lead"
    /will (?:the )?(.+?) \b(?:earn|take|grab|secure|sweep|lead|host)\b/i,
    // "[Team] to miss/fail/not make playoffs" — negative phrasing team extraction
    /(?:^|[^a-z])(?:the )?(.+?) (?:to miss|to fail|to not make)/i,
    // "Can [A] beat/defeat/win against [B]?"
    /can (?:the )?(.+?) (?:beat|defeat|win against|win over|win tonight|win game)/i,
    // "Who wins: [A] or [B]?" — extract left-side team
    /who wins[^:]*[:\s]+(?:the )?([A-Za-z][A-Za-z ]{1,30}?)\s+(?:or|and)\s+/i,
    // "Is [Team] going to win?" / "Are [Team] winning tonight?"
    /(?:is|are) (?:the )?(.+?) (?:going to win|winning tonight|likely to win)/i,
  ];

  for (const re of patterns) {
    const m = question.match(re);
    if (m?.[1]) {
      const candidate = m[1].trim().replace(/\?$/, '');
      const canonical = canonicalTeamName(candidate);
      if (canonical && canonical.length > 2) return canonical;
    }
  }
  return null;
}
