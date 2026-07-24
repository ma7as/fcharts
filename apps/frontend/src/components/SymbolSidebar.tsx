'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '@/contexts/LocaleContext';
import { symbolsApi } from '@/lib/api-client';

interface Symbol {
  id: string;
  symbol: string;
  name: string;
  type: string;
  currency?: string;
  market?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
}

type TypeFilter = '' | 'crypto' | 'stock' | 'cedear' | 'cedear_underlying';

/**
 * Sidebar symbol picker.
 *
 * Pinned to the left of the charts page. Shows every active symbol
 * with a quick-search box and type filter pills. The visible listbox
 * is fully keyboard-navigable (ArrowUp/Down, Home/End, PageUp/Down)
 * and the selected row is scrolled into view automatically.
 *
 * The whole list is fetched in one paginated batch (PAGE_SIZE = 100)
 * so filtering is pure client-side - no extra round-trips as the user
 * types or changes the filter pill.
 */
const PAGE_SIZE = 100;

export function SymbolSidebar({ value, onChange }: Props) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('');
  const listRef = useRef<HTMLUListElement>(null);

  // Fetch the full catalog in one shot. With <= 100 symbols (our current
  // cap) this avoids page-by-page queries while keeping the dropdown
  // sort/filter in the client. If the catalog grows past 100 we should
  // paginate here too.
  const { data: symbolsResp, isLoading } = useQuery({
    queryKey: ['symbols', 'sidebar', { limit: PAGE_SIZE }],
    queryFn: () => symbolsApi.getAll({ limit: PAGE_SIZE }),
    staleTime: 5 * 60 * 1000,
  });

  const allSymbols: Symbol[] = useMemo(
    () => (symbolsResp?.data ?? []) as Symbol[],
    [symbolsResp],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSymbols.filter((s) => {
      if (type && s.type !== type) return false;
      if (!q) return true;
      return (
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q)
      );
    });
  }, [allSymbols, search, type]);

  const selectedIndex = filtered.findIndex((s) => s.symbol === value);

  // Keep the selected row in view whenever the selection or list changes.
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (filtered.length === 0) return;

    const move = (next: number) => {
      e.preventDefault();
      const clamped = (next + filtered.length) % filtered.length;
      onChange(filtered[clamped].symbol);
    };

    const PAGE = 10;
    switch (e.key) {
      case 'ArrowDown':
        move(selectedIndex + 1);
        break;
      case 'ArrowUp':
        move(selectedIndex - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(filtered.length - 1);
        break;
      case 'PageDown':
        move(selectedIndex + PAGE);
        break;
      case 'PageUp':
        move(selectedIndex - PAGE);
        break;
    }
  };

  const PILLS: { key: TypeFilter; label: string }[] = [
    { key: '', label: t('symbolSelector.allTypes') },
    { key: 'stock', label: t('symbolTypes.stock') },
    { key: 'crypto', label: t('symbolTypes.crypto') },
    { key: 'cedear', label: t('symbolTypes.cedear') },
    { key: 'cedear_underlying', label: t('symbolTypes.cedear_underlying') },
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900 border border-gray-800 rounded-lg flex flex-col h-[calc(100vh-9rem)]">
      {/* Search */}
      <div className="p-3 border-b border-gray-800">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('symbolSidebar.search')}
          aria-label={t('symbolSidebar.search')}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded text-sm placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-800">
        {PILLS.map((pill) => (
          <button
            key={pill.key || 'all'}
            type="button"
            onClick={() => setType(pill.key)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              type === pill.key
                ? 'border-blue-500 bg-blue-900/40 text-blue-200'
                : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Helper hint */}
      <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-gray-800">
        {t('symbolSidebar.keyboardHint')}
      </div>

      {/* Listbox */}
      {isLoading ? (
        <div className="p-4 text-sm text-gray-400">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="p-4 text-sm text-gray-400">
          {t('symbolSidebar.empty')}
        </div>
      ) : (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label={t('symbolSidebar.listLabel')}
          onKeyDown={handleKeyDown}
          className="flex-1 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {filtered.map((s, idx) => {
            const isSelected = s.symbol === value;
            return (
              <li
                key={s.id}
                data-idx={idx}
                role="option"
                aria-selected={isSelected}
                onClick={() => onChange(s.symbol)}
                onDoubleClick={() => onChange(s.symbol)}
                className={`px-3 py-2 cursor-pointer border-l-2 transition-colors ${
                  isSelected
                    ? 'bg-blue-900/40 border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium truncate">
                    {s.symbol}
                  </span>
                  {s.currency && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-mono flex-shrink-0 ${
                        s.currency === 'USD'
                          ? 'border-blue-700/60 text-blue-300/80'
                          : 'border-emerald-700/60 text-emerald-300/80'
                      }`}
                    >
                      {s.currency}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate mt-0.5">
                  {s.name}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer count */}
      <div className="px-3 py-2 text-[10px] text-gray-500 border-t border-gray-800">
        {t('symbolSidebar.count', { count: filtered.length })}
      </div>
    </aside>
  );
}
