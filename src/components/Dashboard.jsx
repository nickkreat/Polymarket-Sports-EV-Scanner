import { useState, useMemo } from 'react';
import MarketCard from './MarketCard';
import FilterBar from './FilterBar';
import { NoResults, ScanError, ScanningSpinner } from './EmptyState';

export default function Dashboard({ opportunities, status, error, scanStats }) {
  const [filters, setFilters] = useState({
    query: '',
    sport: '',
    sort: 'ev_desc',
  });

  const updateFilter = (patch) => setFilters(f => ({ ...f, ...patch }));

  const filtered = useMemo(() => {
    let items = [...opportunities];

    if (filters.query) {
      const q = filters.query.toLowerCase();
      items = items.filter(o => o.question.toLowerCase().includes(q));
    }

    if (filters.sport) {
      items = items.filter(o => o.sport === filters.sport);
    }

    switch (filters.sort) {
      case 'ev_asc':
        items.sort((a, b) => a.evPct - b.evPct);
        break;
      case 'liquidity_desc':
        items.sort((a, b) => b.liquidity - a.liquidity);
        break;
      case 'kelly_desc':
        items.sort((a, b) => b.kelly.betSize - a.kelly.betSize);
        break;
      default:
        items.sort((a, b) => b.evPct - a.evPct);
    }

    return items;
  }, [opportunities, filters]);

  const scanning = typeof status === 'string' && status.startsWith('scanning');

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 w-full">
      {/* Filter bar — only when we have results or have scanned */}
      {(opportunities.length > 0 || status === 'done') && (
        <div className="mb-5">
          <FilterBar
            filters={filters}
            onChange={updateFilter}
            total={opportunities.length}
            shown={filtered.length}
          />
        </div>
      )}

      {/* Error */}
      {status === 'error' && <ScanError message={error} />}

      {/* Scanning spinner */}
      {scanning && <ScanningSpinner statusText={status} />}

      {/* Results grid */}
      {!scanning && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(opp => (
            <MarketCard key={opp.id} opp={opp} />
          ))}
        </div>
      )}

      {/* No results */}
      {!scanning && status === 'done' && filtered.length === 0 && (
        <NoResults filters={filters} scanStats={scanStats} />
      )}
    </main>
  );
}
