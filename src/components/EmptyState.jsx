import { TrendingUp, Key, Search, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

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
        Click Scan to fetch Polymarket sports markets and compare them against sportsbook odds to find EV opportunities.
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

export function NoResults({ filters, scanStats }) {
  const hasStats = scanStats != null;

  // Diagnose the most likely bottleneck
  let diagnosis = null;
  if (hasStats) {
    if (scanStats.polyMarketsScanned === 0) {
      diagnosis = { level: 'error', text: 'Polymarket returned 0 markets — the Gamma API may be down or tag slugs changed.' };
    } else if (scanStats.oddsEventsScanned === 0) {
      diagnosis = { level: 'error', text: 'The Odds API returned 0 events — check your API key or quota. All sport keys may be off-season.' };
    } else if (scanStats.binaryNoQuestionMatch > 0 && scanStats.binaryNoOddsMatch === 0 && scanStats.matchedMarkets === 0) {
      diagnosis = { level: 'warn', text: 'Markets were fetched but question patterns didn\'t extract team names. Open the browser console to see sample questions.' };
    } else if (scanStats.binaryNoOddsMatch > 0 && scanStats.matchedMarkets === 0) {
      diagnosis = { level: 'warn', text: 'Team names were extracted but no sportsbook odds matched them. The Odds API may not have futures for those sports right now.' };
    } else if (scanStats.matchedMarkets > 0 && scanStats.filteredByEv > 0) {
      diagnosis = { level: 'ok', text: `${scanStats.matchedMarkets} market(s) matched but all fell below your EV or liquidity threshold. Try lowering Min EV% or Min Liquidity in Settings.` };
    } else if (scanStats.filteredByLiquidity > 0) {
      diagnosis = { level: 'warn', text: 'Some matches were filtered out by the liquidity threshold. Try lowering Min Liquidity in Settings.' };
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-3">
          <TrendingUp className="w-6 h-6 text-zinc-600" />
        </div>
        <h2 className="text-base font-semibold text-zinc-300 mb-1">No opportunities found</h2>
        <p className="text-sm text-zinc-500 max-w-xs">
          {filters?.query
            ? `No markets match "${filters.query}".`
            : 'No markets passed your current filters.'}
        </p>
      </div>

      {/* Diagnosis banner */}
      {diagnosis && (
        <div className={`flex items-start gap-3 p-3 rounded-lg border mb-6 text-sm ${
          diagnosis.level === 'error'
            ? 'bg-red-500/10 border-red-500/20 text-red-300'
            : diagnosis.level === 'warn'
            ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
            : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{diagnosis.text}</span>
        </div>
      )}

      {/* Scan pipeline breakdown */}
      {hasStats && (
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3 font-medium">Scan pipeline</p>
          <div className="space-y-2">
            <PipelineRow
              label="Polymarket markets fetched"
              value={scanStats.polyMarketsScanned}
              ok={scanStats.polyMarketsScanned > 0}
            />
            <PipelineRow
              label="Odds API events fetched"
              value={scanStats.oddsEventsScanned}
              ok={scanStats.oddsEventsScanned > 0}
            />
            <div className="border-t border-[#27272a] pt-2 mt-2 space-y-2">
              <PipelineRow
                label="Binary markets checked"
                value={scanStats.binaryMarketsChecked}
                neutral
              />
              <PipelineRow
                label="→ No team extracted from question"
                value={scanStats.binaryNoQuestionMatch}
                ok={scanStats.binaryNoQuestionMatch === 0}
                invert
                indent
              />
              <PipelineRow
                label="→ No sportsbook odds matched"
                value={scanStats.binaryNoOddsMatch}
                ok={scanStats.binaryNoOddsMatch === 0}
                invert
                indent
              />
            </div>
            <div className="border-t border-[#27272a] pt-2 mt-2 space-y-2">
              <PipelineRow
                label="Multi-outcome slots checked"
                value={scanStats.multiOutcomesChecked}
                neutral
              />
              <PipelineRow
                label="→ No sportsbook odds matched"
                value={scanStats.multiNoOddsMatch}
                ok={scanStats.multiNoOddsMatch === 0}
                invert
                indent
              />
            </div>
            <div className="border-t border-[#27272a] pt-2 mt-2 space-y-2">
              <PipelineRow
                label="Filtered by liquidity"
                value={scanStats.filteredByLiquidity}
                neutral
                indent
              />
              <PipelineRow
                label="Filtered by EV threshold"
                value={scanStats.filteredByEv}
                neutral
                indent
              />
            </div>
            <div className="border-t border-[#27272a] pt-2 mt-2">
              <PipelineRow
                label="Opportunities displayed"
                value={scanStats.matchedMarkets}
                ok={scanStats.matchedMarkets > 0}
                bold
              />
            </div>
          </div>
          <p className="text-[11px] text-zinc-600 mt-3">
            Open browser DevTools → Console for detailed match logs.
          </p>
        </div>
      )}
    </div>
  );
}

function PipelineRow({ label, value, ok, invert, neutral, bold, indent }) {
  let iconEl = null;
  if (!neutral) {
    const isGood = invert ? value === 0 : value > 0;
    iconEl = isGood
      ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
      : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
  }

  return (
    <div className={`flex items-center justify-between gap-2 ${indent ? 'pl-4' : ''}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {iconEl ?? <div className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className={`text-xs truncate ${bold ? 'text-zinc-200 font-semibold' : 'text-zinc-400'}`}>
          {label}
        </span>
      </div>
      <span className={`text-xs tabular-nums font-mono flex-shrink-0 ${
        bold ? 'text-zinc-100 font-bold' :
        neutral ? 'text-zinc-400' :
        (invert ? value === 0 : value > 0) ? 'text-green-400' : 'text-red-400'
      }`}>
        {value ?? '—'}
      </span>
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
