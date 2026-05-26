import { Search, SlidersHorizontal } from 'lucide-react';

const SPORTS = ['All', 'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'Soccer', 'UFC/MMA'];
const SORT_OPTIONS = [
  { value: 'ev_desc', label: 'EV: High → Low' },
  { value: 'ev_asc', label: 'EV: Low → High' },
  { value: 'liquidity_desc', label: 'Liquidity: High → Low' },
  { value: 'kelly_desc', label: 'Kelly Bet: High → Low' },
];

export default function FilterBar({ filters, onChange, total, shown }) {
  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-xl p-3 flex flex-wrap gap-3 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search markets…"
          value={filters.query}
          onChange={e => onChange({ query: e.target.value })}
          className="w-full bg-[#18181b] border border-[#27272a] rounded-lg pl-8 pr-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
        />
      </div>

      {/* Sport tabs */}
      <div className="flex gap-1 flex-wrap">
        {SPORTS.map(s => (
          <button
            key={s}
            onClick={() => onChange({ sport: s === 'All' ? '' : s })}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              (filters.sport === '' && s === 'All') || filters.sport === s
                ? 'bg-green-500/15 text-green-400 border border-green-500/25'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#27272a]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
        <select
          value={filters.sort}
          onChange={e => onChange({ sort: e.target.value })}
          className="bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 transition-colors"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Count */}
      <div className="text-xs text-zinc-500 ml-auto whitespace-nowrap">
        {shown} / {total} opportunities
      </div>
    </div>
  );
}
