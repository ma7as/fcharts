'use client';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const intervals = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
  { value: '1w', label: '1 Week' },
  { value: '1mo', label: '1 Month' },
];

export function IntervalSelector({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    >
      {intervals.map((interval) => (
        <option key={interval.value} value={interval.value}>
          {interval.label}
        </option>
      ))}
    </select>
  );
}
