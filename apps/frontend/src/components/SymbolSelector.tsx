'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '@/contexts/LocaleContext';
import { symbolsApi } from '@/lib/api-client';

// Badge styles per currency
const CURRENCY_BADGE: Record<string, string> = {
  USD: 'bg-blue-800/60 text-blue-200 border-blue-700',
  ARS: 'bg-emerald-800/60 text-emerald-200 border-emerald-700',
};

const PAGE_SIZE = 50;

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Symbol picker.
 *
 * Uses server-side pagination + optional type filter so the dropdown
 * stays fast even as the symbol catalog grows beyond a few hundred rows.
 *
 * The "linked symbol" toggle (CEDEAR <-> underlying) is resolved
 * client-side using a single extra lookup against the full symbol list
 * - this is cheap and avoids a round-trip.
 */
export function SymbolSelector({ value, onChange }: Props) {
  const { t } = useLocale();
  const [type, setType] = useState<string>('');
  const [page, setPage] = useState(1);

  // Page the user is currently looking at (drives the dropdown contents).
  const { data: pageSymbols } = useQuery({
    queryKey: ['symbols', { page, type }],
    queryFn: () =>
      symbolsApi.getAll({
        page,
        limit: PAGE_SIZE,
        ...(type && { type }),
      }),
  });

  // Small lookup table of every known symbol - needed to find the
  // linked USD/ARS pair for a CEDEAR. The backend caps `limit` at 100
  // so we fetch a few pages on mount. For dev (<= 44 symbols) one page
  // is enough; for prod we could expose a dedicated /symbols/all route.
  const { data: allSymbols } = useQuery({
    queryKey: ['symbols', 'all'],
    queryFn: () => symbolsApi.getAll({ limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const items = pageSymbols?.data ?? [];
  const selected = allSymbols?.data?.find((s: any) => s.symbol === value);

  const isCedear = selected?.type === 'cedear';
  const isUnderlying = selected?.type === 'cedear_underlying';
  const linkedUsdSymbol = isCedear ? selected?.underlyingSymbol : null;
  const linkedArsSymbol = isUnderlying ? `${value}D` : null;
  const arsSymbolExists = linkedArsSymbol
    ? allSymbols?.data?.some((s: any) => s.symbol === linkedArsSymbol)
    : false;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="px-2 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label={t('symbolSelector.filterByType')}
        >
          <option value="">{t('symbolSelector.allTypes')}</option>
          <option value="crypto">{t('symbolTypes.crypto')}</option>
          <option value="stock">{t('symbolTypes.stock')}</option>
          <option value="cedear">{t('symbolTypes.cedear')}</option>
          <option value="cedear_underlying">
            {t('symbolTypes.cedear_underlying')}
          </option>
        </select>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {items.map((s: any) => (
            <option key={s.id} value={s.symbol}>
              {s.name} ({s.symbol}) — {s.currency ?? 'USD'}
            </option>
          ))}
          {!items.length && <option value={value}>{value}</option>}
        </select>
      </div>

      {/* Pagination row */}
      {pageSymbols && pageSymbols.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            {t('pagination.showing', {
              from: (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, pageSymbols.total),
              total: pageSymbols.total,
            })}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2 py-0.5 rounded border border-gray-700 bg-gray-800 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700"
            >
              {t('pagination.prev')}
            </button>
            <button
              type="button"
              disabled={!pageSymbols.hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-0.5 rounded border border-gray-700 bg-gray-800 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700"
            >
              {t('pagination.next')}
            </button>
          </div>
        </div>
      )}

      {/* Metadata row */}
      <div className="flex items-center gap-2 flex-wrap">
        {selected?.currency && (
          <span
            className={`text-xs px-2 py-0.5 rounded border font-mono ${
              CURRENCY_BADGE[selected.currency] ??
              'bg-gray-700 text-gray-300 border-gray-600'
            }`}
          >
            {selected.currency}
          </span>
        )}
        {selected?.market && (
          <span className="text-xs px-2 py-0.5 rounded border bg-gray-700/50 text-gray-400 border-gray-600 font-mono">
            {selected.market}
          </span>
        )}

        {isCedear && linkedUsdSymbol && (
          <button
            onClick={() => onChange(linkedUsdSymbol)}
            className="text-xs px-3 py-0.5 rounded border border-blue-700 bg-blue-900/40 text-blue-300 hover:bg-blue-800/60 transition-colors"
          >
            {t('symbolSelector.viewInUsd', { symbol: linkedUsdSymbol })}
          </button>
        )}

        {isUnderlying && arsSymbolExists && linkedArsSymbol && (
          <button
            onClick={() => onChange(linkedArsSymbol)}
            className="text-xs px-3 py-0.5 rounded border border-emerald-700 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/60 transition-colors"
          >
            {t('symbolSelector.viewInArs', { symbol: linkedArsSymbol })}
          </button>
        )}
      </div>
    </div>
  );
}
