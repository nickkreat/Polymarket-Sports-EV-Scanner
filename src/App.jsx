import { useState, useEffect, useRef } from 'react';
import { useSettings } from './hooks/useSettings';
import { useScanner } from './hooks/useScanner';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ManualEvScanner from './components/ManualEvScanner';
import Settings from './components/Settings';
import { NoApiKey, ReadyToScan } from './components/EmptyState';

export default function App() {
  const { settings, setSettings, resetSettings } = useSettings();
  const { opportunities, status, error, lastScanned, scanStats, scan } = useScanner(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState('auto'); // 'auto' | 'manual'
  const autoTimer = useRef(null);

  const scanning = typeof status === 'string' && status.startsWith('scanning');
  const hasScanned = status === 'done' || status === 'error' || opportunities.length > 0;

  // Auto-refresh logic
  useEffect(() => {
    clearInterval(autoTimer.current);
    if (settings.autoRefresh && (settings.oddsApiKey || settings.oddspApiKey)) {
      autoTimer.current = setInterval(scan, settings.refreshIntervalMin * 60 * 1000);
    }
    return () => clearInterval(autoTimer.current);
  }, [settings.autoRefresh, settings.refreshIntervalMin, settings.oddsApiKey, settings.oddspApiKey, scan]);

  // Open settings on first load if no API key
  useEffect(() => {
    if (!settings.oddsApiKey && !settings.oddspApiKey) {
      setSettingsOpen(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0b]">
      <Header
        onSettingsOpen={() => setSettingsOpen(true)}
        onScan={scan}
        scanning={scanning}
        lastScanned={lastScanned}
        stats={scanStats}
        mode={mode}
        onModeChange={setMode}
      />

      {mode === 'manual' ? (
        <ManualEvScanner
          bankroll={settings.bankroll ?? 1000}
          kellyFraction={settings.kellyFraction ?? 0.5}
        />
      ) : !settings.oddsApiKey && !settings.oddspApiKey && !hasScanned ? (
        <NoApiKey onSettingsOpen={() => setSettingsOpen(true)} />
      ) : !hasScanned ? (
        <ReadyToScan onScan={scan} />
      ) : (
        <Dashboard
          opportunities={opportunities}
          status={status}
          error={error}
          scanStats={scanStats}
        />
      )}

      {/* Settings panel */}
      {settingsOpen && (
        <Settings
          settings={settings}
          onUpdate={setSettings}
          onClose={() => setSettingsOpen(false)}
          onReset={() => { resetSettings(); setSettingsOpen(false); }}
        />
      )}
    </div>
  );
}
