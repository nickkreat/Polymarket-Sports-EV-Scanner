import { TrendingUp, Key, Search } from 'lucide-react';

export function NoApiKey({ onSettingsOpen }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-4">
        <Key className="w-8 h-8 text-zinc-500" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-100 mb-2">Add your Odds API key</h2>
      <p className="text-sm text-zinc-500 max-w-sm mb-6">
        You need a free API key from{' '}
        <a
          href="https://the-odds-api.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-400 hover:underline"
        >
          the-odds-api.com
        </a>{' '}
        to fetch sportsbook lines. Polymarket data is free and public.
      </p>
      <button
        onClick={onSettingsOpen}
        className="px-5 py-2.5 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg text-sm transition-colors"
      >
        Open Settings
      </button>
    </div>
  );
}

export function ReadyToScan({ onScan }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
        <Search className="w-8 h-8 text-green-400" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-100 mb-2">Ready to scan</h2>
      <p className="text-sm text-zinc-500 max-w-sm mb-6">
        Click Scan to fetch Polymarket sports markets and compare them against sportsbook odds to find positive EV opportunities.
      </p>
      <button
        onClick={onScan}
        className="px-5 py-2.5 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg text-sm transition-colors"
      >
        Start Scanning
      </button>
    </div>
  );
}

export function NoResults({ filters }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-3">
        <TrendingUp className="w-6 h-6 text-zinc-600" />
      </div>
      <h2 className="text-base font-semibold text-zinc-300 mb-1">No opportunities found</h2>
      <p className="text-sm text-zinc-500 max-w-xs">
        {filters?.query
          ? `No markets match "${filters.query}".`
          : 'No markets met your EV threshold or liquidity filter. Try lowering the minimum EV% in Settings.'}
      </p>
    </div>
  );
}

export function ScanError({ message }) {
  return (
    <div className="mx-auto max-w-lg mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
      <p className="text-sm font-semibold text-red-400 mb-1">Scan failed</p>
      <p className="text-xs text-red-400/80">{message}</p>
    </div>
  );
}

export function ScanningSpinner({ statusText }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-full border-2 border-green-500/20 border-t-green-500 animate-spin mb-4" />
      <p className="text-sm text-zinc-400">{statusText?.replace(/^scanning — /, '') ?? 'Scanning…'}</p>
    </div>
  );
}
