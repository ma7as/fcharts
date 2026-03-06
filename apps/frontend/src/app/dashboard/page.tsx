'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { portfoliosApi } from '@/lib/api-client';

interface Position {
  id: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  symbol: {
    id: string;
    symbol: string;
    name: string;
    type: string;
  };
}

interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  isDefault: boolean;
  positions: Position[];
  _count: {
    positions: number;
    transactions: number;
  };
}

export default function DashboardPage() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { t } = useLocale();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      fetchPortfolios();
    }
  }, [user, authLoading]);

  const fetchPortfolios = async () => {
    try {
      const data = await portfoliosApi.getAll();
      setPortfolios(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        router.push('/login');
        return;
      }
      setError(err?.response?.data?.message || err.message || t('dashboard.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const calculateTotals = () => {
    let totalValue = 0;
    let totalCost = 0;

    portfolios.forEach((portfolio) => {
      portfolio.positions.forEach((position) => {
        totalValue += Number(position.marketValue) || 0;
        totalCost += Number(position.costBasis) || 0;
      });
    });

    const totalPnL = totalValue - totalCost;
    const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    return { totalValue, totalCost, totalPnL, totalPnLPct };
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-lg text-gray-300">{t('common.loading')}</div>
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="bg-gray-900 border-b border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-white">{t('nav.brand')}</h1>
              <div className="flex space-x-4">
                <Link
                  href="/dashboard"
                  className="text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                >
                  {t('nav.dashboard')}
                </Link>
                <Link
                  href="/charts"
                  className="text-gray-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
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
            </div>
            <div className="flex items-center space-x-4">
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
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">{t('dashboard.title')}</h2>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-red-900/20 border border-red-800 p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 rounded-lg shadow border border-gray-800 p-6">
              <p className="text-sm text-gray-400">{t('dashboard.totalValue')}</p>
              <p className="text-2xl font-bold text-white">
                ${totals.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-gray-900 rounded-lg shadow border border-gray-800 p-6">
              <p className="text-sm text-gray-400">{t('dashboard.totalCost')}</p>
              <p className="text-2xl font-bold text-white">
                ${totals.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-gray-900 rounded-lg shadow border border-gray-800 p-6">
              <p className="text-sm text-gray-400">{t('dashboard.totalPnl')}</p>
              <p className={`text-2xl font-bold ${totals.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${totals.totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-gray-900 rounded-lg shadow border border-gray-800 p-6">
              <p className="text-sm text-gray-400">{t('dashboard.totalReturn')}</p>
              <p className={`text-2xl font-bold ${totals.totalPnLPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totals.totalPnLPct.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Portfolios */}
          <div className="space-y-6">
            {portfolios.map((portfolio) => (
              <div key={portfolio.id} className="bg-gray-900 rounded-lg shadow border border-gray-800">
                <div className="px-6 py-4 border-b border-gray-700">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {portfolio.name}
                        {portfolio.isDefault && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900 text-blue-300">
                            {t('common.default')}
                          </span>
                        )}
                      </h3>
                      {portfolio.description && (
                        <p className="text-sm text-gray-400">{portfolio.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">
                        {t('dashboard.positionSummary', { positions: portfolio._count.positions, transactions: portfolio._count.transactions })}
                      </p>
                    </div>
                  </div>
                </div>

                {portfolio.positions.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500">
                    {t('dashboard.noPositions')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                      <thead className="bg-gray-800">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t('dashboard.symbol')}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t('dashboard.quantity')}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t('dashboard.avgPrice')}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t('dashboard.currentPrice')}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t('dashboard.marketValue')}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t('dashboard.costBasis')}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t('dashboard.pnl')}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {t('dashboard.return')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-gray-900 divide-y divide-gray-700">
                        {portfolio.positions.map((position) => (
                          <tr key={position.id} className="hover:bg-gray-800 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-white">
                                {position.symbol.symbol}
                              </div>
                              <div className="text-sm text-gray-400">
                                {position.symbol.name}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-200">
                              {Number(position.quantity).toFixed(4)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-200">
                              ${Number(position.averagePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-200">
                              ${Number(position.currentPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-200">
                              ${Number(position.marketValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-200">
                              ${Number(position.costBasis).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                              Number(position.unrealizedPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              ${Number(position.unrealizedPnL || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                              Number(position.unrealizedPnLPct || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {Number(position.unrealizedPnLPct || 0).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            {portfolios.length === 0 && (
              <div className="bg-gray-900 rounded-lg shadow border border-gray-800 p-8 text-center">
                <p className="text-gray-500">{t('dashboard.noPortfolios')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
