'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { marketApi, symbolsApi } from '@/lib/api-client';

const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] flex items-center justify-center bg-gray-900 text-gray-400">
      Loading chart...
    </div>
  ),
});

export default function CclPage() {
  const { user, logout } = useAuth();
  const [cedear, setCedear] = useState('GGAL');

  // Load all symbols to populate the CEDEAR selector
  const { data: symbols } = useQuery({
    queryKey: ['symbols'],
    queryFn: symbolsApi.getAll,
  });

  const cedears = (symbols as any[] | undefined)?.filter((s) => s.type === 'cedear') ?? [];

  // Load CCL series for selected CEDEAR
  const { data: cclData, isLoading } = useQuery({
    queryKey: ['ccl', cedear],
    queryFn: () => marketApi.getCcl(cedear),
    enabled: Boolean(cedear),
  });

  const series = cclData?.series ?? [];
  const latestCcl = series.length > 0 ? series[series.length - 1]?.ccl : null;

  const dates = series.map((d: any) => d.date);
  const cclValues = series.map((d: any) => d.ccl);
  const arsValues = series.map((d: any) => d.priceArs);
  const usdValues = series.map((d: any) => d.priceUsd);

  const echartsOption = {
    backgroundColor: 'transparent',
    title: {
      text: `CCL Implícito — ${cedear}`,
      left: 'center',
      textStyle: { color: '#e5e7eb', fontSize: 16, fontWeight: 'bold' },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb' },
      formatter: (params: any[]) => {
        const date = params[0]?.axisValue ?? '';
        const ccl = params.find((p) => p.seriesName === 'CCL')?.value ?? '—';
        const ars = params.find((p) => p.seriesName === 'Precio ARS')?.value ?? '—';
        const usd = params.find((p) => p.seriesName === 'Precio USD')?.value ?? '—';
        return `
          <strong>${date}</strong><br/>
          CCL implícito: <strong style="color:#60a5fa">$${ccl}</strong><br/>
          Precio ARS: $${typeof ars === 'number' ? ars.toLocaleString('es-AR') : ars}<br/>
          Precio USD: $${usd}
        `;
      },
    },
    legend: {
      bottom: 40,
      textStyle: { color: '#9ca3af' },
    },
    grid: [
      { left: '8%', right: '8%', top: '60px', height: '45%' },
      { left: '8%', right: '8%', top: '62%', height: '20%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#374151' } },
        axisLabel: { color: '#9ca3af', fontSize: 11 },
        splitLine: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#374151' } },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        name: 'CCL (ARS/USD)',
        nameTextStyle: { color: '#9ca3af', fontSize: 11 },
        scale: true,
        axisLabel: { color: '#9ca3af', formatter: (v: number) => `$${v}` },
        axisLine: { lineStyle: { color: '#374151' } },
        splitLine: { lineStyle: { color: '#1f2937' } },
      },
      {
        name: 'Precio',
        nameTextStyle: { color: '#9ca3af', fontSize: 11 },
        gridIndex: 1,
        scale: true,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        bottom: 10,
        backgroundColor: '#111827',
        fillerColor: 'rgba(59,130,246,0.15)',
        borderColor: '#374151',
        textStyle: { color: '#9ca3af' },
        handleStyle: { color: '#4b5563' },
        dataBackground: {
          lineStyle: { color: '#374151' },
          areaStyle: { color: '#1f2937' },
        },
        selectedDataBackground: {
          lineStyle: { color: '#3b82f6' },
          areaStyle: { color: '#1d4ed8' },
        },
      },
    ],
    series: [
      {
        name: 'CCL',
        type: 'line',
        data: cclValues,
        smooth: true,
        lineStyle: { color: '#60a5fa', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(96,165,250,0.3)' },
              { offset: 1, color: 'rgba(96,165,250,0.02)' },
            ],
          },
        },
        symbol: 'none',
      },
      {
        name: 'Precio ARS',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: arsValues,
        smooth: true,
        lineStyle: { color: '#34d399', width: 1.5 },
        symbol: 'none',
      },
      {
        name: 'Precio USD',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: usdValues,
        smooth: true,
        lineStyle: { color: '#a78bfa', width: 1.5 },
        symbol: 'none',
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="bg-gray-900 border-b border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-white">Financial Charts</h1>
              {user && (
                <div className="flex space-x-4">
                  <Link href="/dashboard" className="text-gray-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                    Dashboard
                  </Link>
                  <Link href="/charts" className="text-gray-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium">
                    Charts
                  </Link>
                  <Link href="/ccl" className="text-emerald-400 px-3 py-2 rounded-md text-sm font-medium">
                    CCL
                  </Link>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {user && (
                <>
                  <span className="text-sm text-gray-300">{user?.firstName || user?.username}</span>
                  <button onClick={logout} className="text-sm text-gray-400 hover:text-white">
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">CCL Implícito por CEDEAR</h2>
          <p className="text-gray-400 text-sm">
            El tipo de cambio contado con liquidación (CCL) implícito se calcula como:{' '}
            <code className="bg-gray-800 px-1 rounded text-emerald-300">CCL = Precio ARS / (Precio USD × Ratio)</code>
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label className="block text-sm text-gray-400 mb-1">CEDEAR</label>
            <select
              value={cedear}
              onChange={(e) => setCedear(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {cedears.map((s: any) => (
                <option key={s.id} value={s.symbol}>
                  {s.name} ({s.symbol})
                </option>
              ))}
              {cedears.length === 0 && <option value={cedear}>{cedear}</option>}
            </select>
          </div>

          {latestCcl !== null && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg px-5 py-3 text-center">
              <div className="text-xs text-gray-400 mb-0.5">CCL actual</div>
              <div className="text-2xl font-bold text-emerald-400">
                ${latestCcl.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {cclData?.ratio && (
                <div className="text-xs text-gray-500 mt-0.5">ratio {cclData.ratio}:1</div>
              )}
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          {isLoading ? (
            <div className="h-[400px] flex items-center justify-center text-gray-400">Cargando datos...</div>
          ) : series.length === 0 ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-gray-400 gap-2">
              <span className="text-4xl">📊</span>
              <span>No hay datos disponibles para {cedear}.</span>
              <span className="text-sm text-gray-500">
                Asegurate de tener configuradas las credenciales de IOL y Finnhub, y de haber ejecutado el seed.
              </span>
            </div>
          ) : (
            <ReactECharts option={echartsOption} style={{ height: '500px', width: '100%' }} notMerge={true} />
          )}
        </div>

        {/* Info table */}
        {series.length > 0 && (
          <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-950">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Fecha</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Precio ARS</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Precio USD ({cclData?.underlying})</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">CCL Implícito</th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().slice(0, 10).map((row: any) => (
                  <tr key={row.date} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-300 font-mono">{row.date}</td>
                    <td className="px-4 py-2.5 text-right text-gray-200">
                      ${row.priceArs.toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-200">
                      ${row.priceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-400">
                      ${row.ccl.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
