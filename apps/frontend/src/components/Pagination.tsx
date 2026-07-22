'use client';

import { useLocale } from '@/contexts/LocaleContext';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
}

/**
 * Minimal pagination control. Shows "Showing N-M of T" + Prev/Next buttons.
 * Designed for server-side pagination — does not load any data itself.
 */
export function Pagination({
  page,
  limit,
  total,
  hasMore,
  onPageChange,
}: PaginationProps) {
  const { t } = useLocale();

  if (total === 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const canPrev = page > 1;
  const canNext = hasMore;

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-3 text-sm">
      <span className="text-gray-400">
        {t('pagination.showing', { from, to, total })}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1 rounded border border-gray-700 bg-gray-800 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700"
        >
          {t('pagination.prev')}
        </button>
        <span className="px-2 py-1 text-gray-400">
          {t('pagination.page', { page })}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1 rounded border border-gray-700 bg-gray-800 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700"
        >
          {t('pagination.next')}
        </button>
      </div>
    </div>
  );
}
