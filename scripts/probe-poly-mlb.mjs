const urls = [
  'https://gamma-api.polymarket.com/events?tag_slug=mlb&active=true&closed=false&limit=50',
  'https://gamma-api.polymarket.com/events?tag_slug=sports&active=true&closed=false&limit=50',
  'https://gamma-api.polymarket.com/events?slug_contains=mlb&active=true&closed=false&limit=50',
];
const types = {};
const interesting = [];
for (const url of urls) {
  try {
    const events = await fetch(url).then(r => r.json());
    for (const ev of events) {
      const title = `${ev.title}`.toLowerCase();
      if (!title.includes(' vs ') && !title.includes(' at ') && !/o\/u|over|under|spread|parlay|run line/.test(title)) continue;
      for (const m of ev.markets ?? []) {
        const q = `${m.question ?? ''} ${ev.title ?? ''}`.toLowerCase();
        const t = m.sportsMarketType ?? 'none';
        types[t] = (types[t] ?? 0) + 1;
        if (interesting.length < 20 && /over|under|parlay|spread|run line|moneyline| vs | at /.test(q)) {
          interesting.push({
            event: ev.title,
            question: m.question,
            sportsMarketType: m.sportsMarketType,
            line: m.line,
            groupItemTitle: m.groupItemTitle,
            showGmpSeries: m.showGmpSeries,
            showGmpOutcome: m.showGmpOutcome,
            description: (m.description ?? '').slice(0, 100),
            outcomes: m.outcomes,
          });
        }
      }
    }
  } catch (e) { console.warn(url, e.message); }
}
console.log('types', types);
console.log(JSON.stringify(interesting, null, 2));
