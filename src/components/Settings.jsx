import { useState } from 'react';
import { X, Eye, EyeOff, RotateCcw, ExternalLink, HelpCircle, Loader2, Search } from 'lucide-react';
import { probeGolfOddsSources } from '../services/oddsProviders';

const KELLY_PRESETS = [
  { label: 'Full Kelly (1×)', value: 1 },
  { label: 'Half Kelly (0.5×)', value: 0.5 },
  { label: 'Quarter Kelly (0.25×)', value: 0.25 },
  { label: 'Eighth Kelly (0.125×)', value: 0.125 },
];

export default function Settings({ settings, onUpdate, onClose, onReset }) {
  const [showKey, setShowKey] = useState(false);
  const [showPapiKey, setShowPapiKey] = useState(false);
  const [customKelly, setCustomKelly] = useState(false);
  const [probeState, setProbeState] = useState(null);
  const [probing, setProbing] = useState(false);

  const update = (key, val) => onUpdate({ [key]: val });

  const isPreset = KELLY_PRESETS.some(p => p.value === settings.kellyFraction);

  const runGolfProbe = async () => {
    setProbing(true);
    setProbeState(null);
    try {
      const result = await probeGolfOddsSources({
        oddspApiKey: settings.oddspApiKey,
        testDraftKings: settings.enableDraftKingsGolfFallback !== false,
      });
      setProbeState(result);
    } catch (err) {
      setProbeState({ error: err.message ?? String(err) });
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md h-screen bg-[#111113] border-l border-[#27272a] overflow-y-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#111113] border-b border-[#27272a] px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-zinc-100">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#27272a] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-7 flex-1">

          {/* API Keys */}
          <Section title="API Keys">
            <Field label="The Odds API Key" hint={<a href="https://the-odds-api.com" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline flex items-center gap-0.5">Get free key <ExternalLink className="w-3 h-3" /></a>}>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings.oddsApiKey}
                  onChange={e => update('oddsApiKey', e.target.value)}
                  placeholder="Enter your API key…"
                  className="input pr-9"
                  autoComplete="off"
                />
                <button
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  type="button"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-600 mt-1">Stored only in your browser. Used for NBA/NFL game lines and major golf futures.</p>
            </Field>

            <Field label="OddsPapi Key (PGA Tour)" hint={<a href="https://oddspapi.io" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline flex items-center gap-0.5">Free tier at oddspapi.io <ExternalLink className="w-3 h-3" /></a>}>
              <div className="relative">
                <input
                  type={showPapiKey ? 'text' : 'password'}
                  value={settings.oddspApiKey ?? ''}
                  onChange={e => update('oddspApiKey', e.target.value)}
                  placeholder="Optional — weekly PGA Tour outrights (Charles Schwab, etc.)"
                  className="input pr-9"
                  autoComplete="off"
                />
                <button
                  onClick={() => setShowPapiKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  type="button"
                >
                  {showPapiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-600 mt-1">Supplements The Odds API for weekly PGA events not covered by the four majors.</p>
            </Field>

            <Field label="Supplemental golf sources">
              <div className="space-y-2">
                <Toggle
                  checked={settings.enableOddsPapi !== false}
                  onChange={v => update('enableOddsPapi', v)}
                  label="Use OddsPapi for PGA Tour outrights when key is set"
                />
                <Toggle
                  checked={settings.enableDraftKingsGolfFallback !== false}
                  onChange={v => update('enableDraftKingsGolfFallback', v)}
                  label="Try DraftKings golf fallback in browser (best-effort)"
                />
              </div>
            </Field>

            <div className="pt-1">
              <button
                type="button"
                onClick={runGolfProbe}
                disabled={probing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-[#27272a] bg-[#18181b] text-sm text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                {probing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Test Golf Odds Sources
              </button>
              {probeState && (
                <div className="mt-2 p-3 rounded-lg bg-[#18181b] border border-[#27272a] text-xs space-y-2">
                  {probeState.error ? (
                    <p className="text-red-400">{probeState.error}</p>
                  ) : (
                    <>
                      <ProbeLine
                        label="OddsPapi"
                        ok={probeState.oddspapi?.charlesSchwabFound || (probeState.oddspapi?.ok && !probeState.oddspapi?.error && !probeState.oddspapi?.schwabOddsError)}
                        detail={
                          probeState.oddspapi?.charlesSchwabFound
                            ? `Charles Schwab odds OK (${probeState.oddspapi?.samplePlayers?.slice(0, 3).join(', ')}…)`
                            : probeState.oddspapi?.schwabOddsError
                            ?? probeState.oddspapi?.error
                            ?? (probeState.oddspapi?.charlesSchwabListed
                              ? 'Charles Schwab listed — waiting for odds'
                              : `${probeState.oddspapi?.tournamentCount ?? 0} tournaments`) +
                               (probeState.oddspapi?.bookmakersUsed ? ` via ${probeState.oddspapi.bookmakersUsed}` : '')
                        }
                      />
                      <ProbeLine
                        label="DraftKings fallback"
                        ok={probeState.draftKings?.ok}
                        detail={
                          probeState.draftKings?.ok
                            ? `${probeState.draftKings.playerCount ?? '?'} players`
                            : probeState.draftKings?.error
                            ?? 'Unavailable (browser CORS/geo — expected; OddsPapi is primary)'
                        }
                      />
                      {probeState.recommendation && (
                        <p className="text-zinc-400 pt-1 border-t border-[#27272a]">{probeState.recommendation}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* Bankroll */}
          <Section title="Bankroll">
            <Field label="Total bankroll ($)">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={settings.bankroll}
                  onChange={e => update('bankroll', Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input flex-1"
                />
              </div>
            </Field>
          </Section>

          {/* Kelly Criterion */}
          <Section title="Kelly Criterion">
            <Field
              label="Kelly fraction"
              hint={<Tip text="Fractional Kelly reduces variance. Half Kelly (0.5) is the most common practical choice." />}
            >
              <div className="grid grid-cols-2 gap-2 mb-2">
                {KELLY_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { update('kellyFraction', p.value); setCustomKelly(false); }}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      !customKelly && settings.kellyFraction === p.value
                        ? 'bg-green-500/15 text-green-400 border-green-500/30'
                        : 'bg-[#18181b] text-zinc-400 border-[#27272a] hover:border-zinc-600'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCustomKelly(v => !v)}
                  className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                    customKelly ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'text-zinc-500 border-[#27272a] hover:border-zinc-600'
                  }`}
                >
                  Custom
                </button>
                {customKelly && (
                  <input
                    type="number"
                    min={0.01}
                    max={1}
                    step={0.01}
                    value={settings.kellyFraction}
                    onChange={e => update('kellyFraction', Math.min(1, Math.max(0.01, parseFloat(e.target.value) || 0.5)))}
                    className="input w-24"
                  />
                )}
              </div>
            </Field>

            <Field
              label="Max bet size (% of bankroll)"
              hint={<Tip text="Caps any single bet regardless of Kelly output. Protects against model errors." />}
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={settings.maxKellyPct}
                  onChange={e => update('maxKellyPct', Number(e.target.value))}
                  className="flex-1 accent-green-500"
                />
                <span className="text-sm text-zinc-100 w-10 text-right tabular-nums">{settings.maxKellyPct}%</span>
              </div>
              <p className="text-xs text-zinc-600 mt-1">
                Max single bet: ${((settings.maxKellyPct / 100) * settings.bankroll).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </Field>
          </Section>

          {/* Scanner Filters */}
          <Section title="Scanner Filters">
            <Field label="Minimum EV%" hint={<Tip text="Only show opportunities where the edge is at least this %. Higher = fewer but higher-confidence picks." />}>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={settings.minEvPct}
                  onChange={e => update('minEvPct', Number(e.target.value))}
                  className="flex-1 accent-green-500"
                />
                <span className="text-sm text-zinc-100 w-10 text-right tabular-nums">{settings.minEvPct}%</span>
              </div>
            </Field>

            <Field label="Minimum liquidity ($)">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={settings.minLiquidity}
                  onChange={e => update('minLiquidity', Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input flex-1"
                />
              </div>
            </Field>

            <Field label="Show negative EV markets">
              <Toggle
                checked={settings.showNegativeEv}
                onChange={v => update('showNegativeEv', v)}
                label="Show markets where you're being mispriced against"
              />
            </Field>

            <Field
              label="Hide suspicious EV (>200%)"
              hint={<Tip text="Filters out results with extreme EV% that are almost always data artifacts — stale lines, bad matches, or near-resolved markets." />}
            >
              <Toggle
                checked={settings.hideSuspiciousEv ?? true}
                onChange={v => update('hideSuspiciousEv', v)}
                label="Hide results with EV above 200% (recommended)"
              />
            </Field>
          </Section>

          {/* Sportsbook Settings */}
          <Section title="Sportsbook Settings">
            <Field label="Regions" hint={<Tip text="'us,us2' covers DraftKings, FanDuel, BetMGM, Pinnacle (US). Add 'eu' or 'uk' for more books." />}>
              <input
                type="text"
                value={settings.preferredRegions}
                onChange={e => update('preferredRegions', e.target.value)}
                placeholder="us,us2"
                className="input"
              />
            </Field>

            <Field label="Vig removal method" hint={<Tip text="Multiplicative: scales all probs by 1/total. This is standard. Power devig is more precise but complex." />}>
              <select
                value={settings.deviGMethod}
                onChange={e => update('deviGMethod', e.target.value)}
                className="input"
              >
                <option value="multiplicative">Multiplicative (recommended)</option>
                <option value="additive">Additive</option>
              </select>
            </Field>
          </Section>

          {/* Auto Refresh */}
          <Section title="Auto Refresh">
            <Field label="Auto-refresh">
              <Toggle
                checked={settings.autoRefresh}
                onChange={v => update('autoRefresh', v)}
                label="Automatically re-scan at interval"
              />
            </Field>
            {settings.autoRefresh && (
              <Field label="Refresh interval (minutes)">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.refreshIntervalMin}
                  onChange={e => update('refreshIntervalMin', Math.max(1, parseInt(e.target.value) || 5))}
                  className="input"
                />
              </Field>
            )}
          </Section>

        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#111113] border-t border-[#27272a] px-5 py-4 flex justify-between items-center">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-red-400 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg text-sm transition-colors"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-sm font-medium text-zinc-300">{label}</label>
        {hint && <span className="text-zinc-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-green-500' : 'bg-[#27272a]'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
      {label && <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">{label}</span>}
    </label>
  );
}

function Tip({ text }) {
  return (
    <span title={text} className="cursor-help">
      <HelpCircle className="w-3.5 h-3.5 text-zinc-600 hover:text-zinc-400 transition-colors" />
    </span>
  );
}

function ProbeLine({ label, ok, detail }) {
  return (
    <div className="flex items-start gap-2">
      <span className={ok ? 'text-green-400' : 'text-yellow-500'}>{ok ? '✓' : '○'}</span>
      <div>
        <span className="text-zinc-300 font-medium">{label}: </span>
        <span className="text-zinc-500">{detail}</span>
      </div>
    </div>
  );
}
