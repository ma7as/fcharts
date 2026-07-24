'use client';

import { CandlestickChart } from '@/components/CandlestickChart';
import { SymbolSidebar } from '@/components/SymbolSidebar';
import { IntervalSelector } from '@/components/IntervalSelector';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ChartsPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="bg-gray-900 border-b border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-white">{t('nav.brand')}</h1>
              {user && (
                <div className="flex space-x-4">
                  <Link
                    href="/dashboard"
                    className="text-gray-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                  >
                    {t('nav.dashboard')}
                  </Link>
                  <Link
                    href="/charts"
                    className="text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    {t('nav.charts')}
                  </Link>
                  <Link
                    href="/ccl"
                    className="text-gray-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                  >
                    {t('nav.ccl')}
                  </Link>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <span className="text-sm text-gray-300">
                    {user?.firstName || user?.username || t('common.user')}
                  </span>
                  <LanguageSwitcher />
                  <button
                    onClick={logout}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    {t('nav.logout')}
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {t('nav.login')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex gap-4">
            <SymbolSidebar value={symbol} onChange={setSymbol} />

            <div className="flex-1 bg-gray-900 rounded-lg shadow-lg p-6 border border-gray-800 min-w-0">
              <div className="flex gap-4 mb-6">
                <IntervalSelector value={interval} onChange={setInterval} />
              </div>

              <CandlestickChart symbol={symbol} interval={interval} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
