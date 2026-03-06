'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from '@/contexts/LocaleContext';
import { symbolsApi } from '@/lib/api-client';

// Badge styles per currency
const CURRENCY_BADGE: Record<string, string> = {
  USD: 'bg-blue-800/60 text-blue-200 border-blue-700',
  ARS: 'bg-emerald-800/60 text-emerald-200 border-emerald-700',
};

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function SymbolSelector({ value, onChange }: Props) {
  const { t } = useLocale();
  const { data: symbols } = useQuery({
    queryKey: ['symbols'],
    queryFn: symbolsApi.getAll,
  });

  // Find the currently selected symbol object
  const selected = (symbols as any[] | undefined)?.find((s) => s.symbol === value);

  // Group symbols by type, preserving insertion order
  const groups: Record<string, any[]> = {};
  (symbols as any[] | undefined)?.forEach((s) => {
    const key = s.type ?? 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });

  // ARS ↔ USD toggle logic
  const isCedear = selected?.type === 'cedear';
  const isUnderlying = selected?.type === 'cedear_underlying';

  // If current is a CEDEAR, its underlying is in underlyingSymbol field
  const linkedUsdSymbol = isCedear ? selected?.underlyingSymbol : null;
  // If current is an underlying, BYMA CEDEAR symbol is base + 'D'
  const linkedArsSymbol = isUnderlying ? `${value}D` : null;
  const arsSymbolExists = linkedArsSymbol
    ? (symbols as any[] | undefined)?.some((s) => s.symbol === linkedArsSymbol)
    : false;

  return (
    <div className="flex flex-col gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {Object.entries(groups).map(([type, items]) => (
          <optgroup key={type} label={t(`symbolTypes.${type}`) ?? type}>
            {items.map((s: any) => (
              <option key={s.id} value={s.symbol}>
                {s.name} ({s.symbol}) — {s.currency ?? 'USD'}
              </option>
            ))}
          </optgroup>
        ))}
        {!symbols && <option value={value}>{value}</option>}
      </select>

      {/* Metadata row */}
      <div className="flex items-center gap-2 flex-wrap">
        {selected?.currency && (
          <span className={`text-xs px-2 py-0.5 rounded border font-mono ${CURRENCY_BADGE[selected.currency] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
            {selected.currency}
          </span>
        )}
        {selected?.market && (
          <span className="text-xs px-2 py-0.5 rounded border bg-gray-700/50 text-gray-400 border-gray-600 font-mono">
            {selected.market}
          </span>
        )}

        {/* Toggle: CEDEAR → view underlying in USD */}
        {isCedear && linkedUsdSymbol && (
          <button
            onClick={() => onChange(linkedUsdSymbol)}
            className="text-xs px-3 py-0.5 rounded border border-blue-700 bg-blue-900/40 text-blue-300 hover:bg-blue-800/60 transition-colors"
          >
            {t('symbolSelector.viewInUsd', { symbol: linkedUsdSymbol })}
          </button>
        )}

        {/* Toggle: underlying → view CEDEAR in ARS */}
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
