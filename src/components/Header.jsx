import { TrendingUp, Settings as SettingsIcon, RefreshCw, Activity } from 'lucide-react';

export default function Header({ onSettingsOpen, onScan, scanning, lastScanned, stats }) {
  return (
    <header className="sticky top-0 z-40 bg-[#0a0a0b]/95 backdrop-blur border-b border-[#27272a]">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-4 h-4 text-green-400" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-semibold text-zinc-100 leading-none">Polymarket EV Scanner</h1>
            <p className="text-xs text-zinc-500 leading-none mt-0.5">Sports futures mispricings</p>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="hidden md:flex items-center gap-4 ml-4 px-4 border-l border-[#27272a]">
            <Stat label="Poly markets" value={stats.polyMarketsScanned} />
            <Stat label="Odds events" value={stats.oddsEventsScanned} />
            <Stat label="Matched" value={stats.matchedMarkets} />
            <Stat label="+EV found" value={stats.positiveEv} highlight />
          </div>
        )}

        <div className="flex-1" />

        {/* Last scan time */}
        {lastScanned && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500">
            <Activity className="w-3 h-3" />
            <span>{formatTime(lastScanned)}</span>
          </div>
        )}

        {/* Scan button */}
        <button
          onClick={onScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-400 disabled:bg-green-900 disabled:text-green-600 text-black font-semibold text-sm transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Scan'}
        </button>

        {/* Settings */}
        <button
          onClick={onSettingsOpen}
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#27272a] transition-colors"
          aria-label="Settings"
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className="text-center">
      <div className={`text-base font-bold tabular-nums ${highlight ? 'text-green-400' : 'text-zinc-100'}`}>
        {value ?? '—'}
      </div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide leading-none mt-0.5">{label}</div>
    </div>
  );
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
