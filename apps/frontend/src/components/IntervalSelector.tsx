'use client';

import { useLocale } from '@/contexts/LocaleContext';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const INTERVAL_KEYS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo'];

export function IntervalSelector({ value, onChange }: Props) {
  const { t } = useLocale();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      {INTERVAL_KEYS.map((key) => (
        <option key={key} value={key}>
          {t(`intervals.${key}`)}
        </option>
      ))}
    </select>
  );
}
