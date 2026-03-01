'use client';

import { CandlestickChart } from '@/components/CandlestickChart';
import { SymbolSelector } from '@/components/SymbolSelector';
import { IntervalSelector } from '@/components/IntervalSelector';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ChartsPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="bg-gray-900 border-b border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-white">Financial Charts</h1>
              {user && (
                <div className="flex space-x-4">
                  <Link
                    href="/dashboard"
                    className="text-gray-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/charts"
                    className="text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Charts
                  </Link>
                  <Link
                    href="/ccl"
                    className="text-gray-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                  >
                    CCL
                  </Link>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <span className="text-sm text-gray-300">
                    {user?.firstName || user?.username || 'User'}
                  </span>
                  <button
                    onClick={logout}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-gray-900 rounded-lg shadow-lg p-6 border border-gray-800">
            <div className="flex gap-4 mb-6">
              <SymbolSelector value={symbol} onChange={setSymbol} />
              <IntervalSelector value={interval} onChange={setInterval} />
            </div>

            <CandlestickChart symbol={symbol} interval={interval} />
          </div>
        </div>
      </main>
    </div>
  );
}
