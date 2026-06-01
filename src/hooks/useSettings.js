import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'pmev_settings';

const DEFAULTS = {
  oddsApiKey: '',
  oddspApiKey: '',
  enableOddsPapi: true,
  enableDraftKingsGolfFallback: true,
  claudeApiKey: '',
  enableClaudeMatcher: true,
  claudeModel: 'claude-haiku-4-5-20251001',
  bankroll: 1000,
  kellyFraction: 0.5,
  minEvPct: 5,
  minLiquidity: 500,
  minVolume: 0,
  autoRefresh: false,
  refreshIntervalMin: 5,
  preferredRegions: 'us,us2',
  deviGMethod: 'multiplicative',
  showNegativeEv: false,
  sportsFilter: [],        // empty = all
  marketsFilter: 'futures',
  maxKellyPct: 25,         // cap Kelly bet at X% of bankroll
  hideSuspiciousEv: true,  // filter markets with EV > 200% (likely data artifacts)
};

export function useSettings() {
  const [settings, setSettingsState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULTS;
  });

  const setSettings = useCallback((updater) => {
    setSettingsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettingsState(DEFAULTS);
  }, []);

  return { settings, setSettings, resetSettings, DEFAULTS };
}
