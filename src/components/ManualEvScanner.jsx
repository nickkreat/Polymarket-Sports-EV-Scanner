import { useMemo, useState } from 'react';
import { Calculator, Copy, Check, Table2, Trash2 } from 'lucide-react';
import {
  analyzeAll,
  formatAmerican,
  parsePastedLines,
  SCHWAB_DEMO_LINES,
  toSheetsTsv,
} from '../utils/manualEv.js';

const DEFAULT_INPUT = `Mac Meissner\t+330\t+421
Russell Henley\t+450\t+502`;

export default function ManualEvScanner({ bankroll = 1000, kellyFraction = 0.5 }) {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [holdPct, setHoldPct] = useState(8);
  const [devigMethod, setDevigMethod] = useState('multiply');
  const [devigMultiplier, setDevigMultiplier] = useState(0.926);
  const [minEvPct, setMinEvPct] = useState(0);
  const [minKellyPct, setMinKellyPct] = useState(0.2);
  const [showAll, setShowAll] = useState(true);
  const [copied, setCopied] = useState(false);

  const options = useMemo(() => ({
    devigMethod,
    devigMultiplier,
    holdPct,
    kellyFraction,
    bankroll,
    minEvPct,
    minKellyPct,
  }), [devigMethod, devigMultiplier, holdPct, kellyFraction, bankroll, minEvPct, minKellyPct]);

  const results = useMemo(() => {
    const rows = parsePastedLines(input);
    return analyzeAll(rows, options);
  }, [input, options]);

  const positive = results.filter(r => r.passesFilter);

  async function copySheets(includeAll) {
    const tsv = toSheetsTsv(results, { includeAll });
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function loadDemo() {
    setInput(SCHWAB_DEMO_LINES.map(r =>
      `${r.name}\t+${r.dk}\t+${r.poly}`
    ).join('\n'));
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 w-full space-y-5">
      <div className="rounded-xl border border-[#27272a] bg-[#111113] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-green-400" />
              Manual DK vs Polymarket EV
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Paste player lines from DraftKings and Polymarket. DK is devigged to true probability;
              EV = (trueProb × polyDecimal) − 1. Copy output as TSV for Google Sheets.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadDemo}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#27272a] text-zinc-300 hover:border-zinc-500"
            >
              Load Schwab demo
            </button>
            <button
              type="button"
              onClick={() => setInput('')}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#27272a] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          <Field label="DK hold %">
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={holdPct}
              onChange={e => {
                const v = Number(e.target.value);
                setHoldPct(v);
                setDevigMultiplier(Number((1 / (1 + v / 100)).toFixed(3)));
              }}
              className={inputCls}
            />
          </Field>
          <Field label="Devig method">
            <select
              value={devigMethod}
              onChange={e => setDevigMethod(e.target.value)}
              className={inputCls}
            >
              <option value="multiply">× multiplier ({devigMultiplier})</option>
              <option value="divide">÷ (1 − hold)</option>
            </select>
          </Field>
          <Field label="Min EV %">
            <input
              type="number"
              step={0.1}
              value={minEvPct}
              onChange={e => setMinEvPct(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Min Kelly %">
            <input
              type="number"
              step={0.1}
              value={minKellyPct}
              onChange={e => setMinKellyPct(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label={`Kelly × ${kellyFraction}`}>
            <div className="text-sm text-zinc-400 py-2">From Settings</div>
          </Field>
          <Field label="Bankroll">
            <div className="text-sm text-zinc-400 py-2">${bankroll.toLocaleString()}</div>
          </Field>
        </div>

        <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">
          Paste odds (Player · DK · Poly — tab or comma separated)
        </label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={'Mac Meissner\t+330\t+421\nRussell Henley\t+450\t+502'}
          className="w-full rounded-lg border border-[#27272a] bg-[#0a0a0b] text-zinc-100 text-sm font-mono p-3 focus:outline-none focus:border-green-500/50 resize-y"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-400">
          <span className="text-green-400 font-semibold">{positive.length}</span> +EV plays
          {results.length !== positive.length && (
            <span> · {results.length} total lines</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={showAll}
              onChange={e => setShowAll(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Show all rows
          </label>
          <button
            type="button"
            onClick={() => copySheets(showAll)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm hover:bg-green-500/20"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy for Sheets'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#27272a] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#18181b] text-zinc-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Player</th>
                <th className="text-right px-3 py-3 font-medium">DK</th>
                <th className="text-right px-3 py-3 font-medium">DK%</th>
                <th className="text-right px-3 py-3 font-medium">Devig</th>
                <th className="text-right px-3 py-3 font-medium">Poly</th>
                <th className="text-right px-3 py-3 font-medium">Poly%</th>
                <th className="text-right px-3 py-3 font-medium">EV%</th>
                <th className="text-right px-3 py-3 font-medium">Kelly%</th>
                <th className="text-right px-4 py-3 font-medium">Bet $</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? results : positive).map(row => (
                <tr
                  key={row.name}
                  className={`border-t border-[#27272a] ${row.passesFilter ? 'bg-green-500/5' : 'bg-[#111113]'}`}
                >
                  <td className="px-4 py-2.5 text-zinc-100 font-medium">{row.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{formatAmerican(row.dkAmerican)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">{row.dkImpliedPct.toFixed(2)}%</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-200">{row.deviggedPct.toFixed(2)}%</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{formatAmerican(row.polyAmerican)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">{row.polyImpliedPct.toFixed(2)}%</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${row.evPct > 0 ? 'text-green-400' : 'text-red-400/80'}`}>
                    {row.evPct > 0 ? '+' : ''}{row.evPct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                    {row.kellyPct >= minKellyPct && row.evPct > minEvPct
                      ? `${row.kellyPct.toFixed(2)}%`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">
                    {row.passesFilter ? `$${row.betSize.toFixed(0)}` : '—'}
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                    <Table2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Paste player lines above — one per row: Name, DK odds, Poly odds
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-zinc-600 space-y-1">
        <p>EV% = (deviggedProb × polyDecimal − 1) × 100 · Kelly f* = (b×p − q) / b · b = polyDecimal − 1</p>
        <p>Default devig: DK implied × 0.926 (~8% hold). Toggle ÷(1−hold) for the alternate formula.</p>
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-[#27272a] bg-[#0a0a0b] text-zinc-100 text-sm px-2.5 py-1.5 focus:outline-none focus:border-green-500/50';
