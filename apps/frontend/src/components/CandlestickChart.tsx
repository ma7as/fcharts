'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { marketApi } from '@/lib/api-client';
import { MarketWebSocket } from '@/lib/websocket';

const ReactECharts = dynamic(() => import('echarts-for-react'), {
  ssr: false,
  loading: () => <div className="h-[600px] flex items-center justify-center bg-gray-900 text-gray-400">Loading chart...</div>,
});

// Badge colours per data source
const SOURCE_COLORS: Record<string, string> = {
  binance:      'bg-yellow-500/20 text-yellow-300 border-yellow-700',
  yahoo:        'bg-purple-500/20 text-purple-300 border-purple-700',
  finnhub:      'bg-sky-500/20 text-sky-300 border-sky-700',
  alphavantage: 'bg-orange-500/20 text-orange-300 border-orange-700',
  iol:          'bg-green-500/20 text-green-300 border-green-700',
};

const CURRENCY_COLORS: Record<string, string> = {
  USD: 'bg-blue-500/20 text-blue-300 border-blue-700',
  ARS: 'bg-emerald-500/20 text-emerald-300 border-emerald-700',
};

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  symbol: string;
  interval: string;
}

export function CandlestickChart({ symbol, interval }: Props) {
  const [realtimeCandles, setRealtimeCandles] = useState<CandleData[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<MarketWebSocket | null>(null);

  // Fetch historical data
  const { data, isLoading } = useQuery({
    queryKey: ['ohlc', symbol, interval],
    queryFn: () => marketApi.getOhlc({ symbol, interval, limit: 200 }),
  });

  // Fetch MA indicators
  const { data: indicatorData } = useQuery({
    queryKey: ['indicators', symbol, interval],
    queryFn: () => marketApi.getIndicators({ symbol, interval, ma: '20,50' }),
    enabled: !!data,
  });

  // Reset realtime candles when symbol/interval changes
  useEffect(() => {
    setRealtimeCandles([]);
  }, [symbol, interval]);

  // Setup WebSocket for real-time updates
  useEffect(() => {
    const socket = new MarketWebSocket();
    wsRef.current = socket;

    socket.onConnect(() => setWsConnected(true));
    socket.onDisconnect(() => setWsConnected(false));
    socket.onError(() => setWsConnected(false));

    socket.connect();

    socket.subscribe(symbol, interval, (candle: CandleData) => {
      setRealtimeCandles((prev) => {
        // If same timestamp as last candle, update it (live candle); otherwise append
        const last = prev[prev.length - 1];
        if (last && last.timestamp === candle.timestamp) {
          return [...prev.slice(0, -1), candle];
        }
        return [...prev, candle];
      });
    });

    return () => {
      socket.unsubscribe();
      socket.disconnect();
    };
  }, [symbol, interval]);

  // Enriched metadata from API response
  const meta = data || {};
  const currency: string = meta.currency || 'USD';
  const market: string = meta.market || '';
  const dataSource: string = meta.dataSource || '';
  const underlyingSymbol: string | null = meta.underlyingSymbol || null;
  const cedearRatio: number | null = meta.cedearRatio || null;

  // Merge historical + realtime candles
  const historicalData: CandleData[] = data?.data || [];
  const mergedData = useMemo(() => {
    if (realtimeCandles.length === 0) return historicalData;

    const merged = [...historicalData];
    for (const rt of realtimeCandles) {
      const idx = merged.findIndex((h) => h.timestamp === rt.timestamp);
      if (idx >= 0) {
        merged[idx] = rt; // Update existing candle
      } else {
        merged.push(rt); // Append new candle
      }
    }
    return merged;
  }, [historicalData, realtimeCandles]);

  if (isLoading) {
    return <div className="h-[600px] flex items-center justify-center bg-gray-900 text-gray-400">Loading...</div>;
  }

  const dates = mergedData.map((d) => new Date(d.timestamp).toLocaleString());
  const ohlc = mergedData.map((d) => [d.open, d.close, d.low, d.high]);
  const volumes = mergedData.map((d) => d.volume);

  // Build MA series from indicators API
  const maSeries: any[] = [];
  const maData: Record<string, number[]> = indicatorData?.ma || {};
  const maColors: Record<string, string> = { '20': '#f59e0b', '50': '#8b5cf6', '100': '#06b6d4', '200': '#ef4444' };

  for (const [period, values] of Object.entries(maData)) {
    if (Array.isArray(values) && values.length > 0) {
      maSeries.push({
        type: 'line',
        name: `MA${period}`,
        data: values,
        smooth: true,
        lineStyle: { width: 1.5, color: maColors[period] || '#9ca3af' },
        itemStyle: { color: maColors[period] || '#9ca3af' },
        symbol: 'none',
      });
    }
  }

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `${symbol} — ${interval}`,
      left: 'center',
      textStyle: {
        color: '#e5e7eb',
        fontSize: 16,
        fontWeight: 'bold',
      },
    },
    legend: {
      show: maSeries.length > 0,
      top: 30,
      textStyle: { color: '#9ca3af', fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: '#4b5563' },
        crossStyle: { color: '#4b5563' },
      },
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb' },
      formatter: (params: any) => {
        const candle = params[0]?.data;
        if (!candle) return '';
        return `
          <strong>${params[0].name}</strong><br/>
          Open: ${candle[0]}<br/>
          Close: ${candle[1]}<br/>
          Low: ${candle[2]}<br/>
          High: ${candle[3]}
        `;
      },
    },
    grid: [
      {
        left: '10%',
        right: '10%',
        height: '50%',
        borderColor: '#374151',
      },
      {
        left: '10%',
        right: '10%',
        top: '70%',
        height: '15%',
        borderColor: '#374151',
      },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { onZero: false, lineStyle: { color: '#374151' } },
        splitLine: { show: false },
        axisLabel: { color: '#9ca3af' },
        min: 'dataMin',
        max: 'dataMax',
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisLine: { onZero: false, lineStyle: { color: '#374151' } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
    ],
    yAxis: [
      {
        scale: true,
        axisLabel: { color: '#9ca3af' },
        axisLine: { lineStyle: { color: '#374151' } },
        splitLine: { lineStyle: { color: '#1f2937' } },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['rgba(31,41,55,0.3)', 'rgba(17,24,39,0.3)'],
          },
        },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: 80,
        end: 100,
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        bottom: 10,
        start: 80,
        end: 100,
        backgroundColor: '#111827',
        dataBackground: {
          lineStyle: { color: '#374151' },
          areaStyle: { color: '#1f2937' },
        },
        selectedDataBackground: {
          lineStyle: { color: '#3b82f6' },
          areaStyle: { color: '#1d4ed8' },
        },
        fillerColor: 'rgba(59,130,246,0.15)',
        borderColor: '#374151',
        textStyle: { color: '#9ca3af' },
        handleStyle: { color: '#4b5563', borderColor: '#6b7280' },
      },
    ],
    series: [
      {
        type: 'candlestick',
        name: symbol,
        data: ohlc,
        itemStyle: {
          color: '#00da3c',
          color0: '#ec0000',
          borderColor: '#008F28',
          borderColor0: '#8A0000',
        },
      },
      ...maSeries,
      {
        type: 'bar',
        name: 'Volume',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes,
        itemStyle: {
          color: '#7fbe9e',
        },
      },
    ],
  };

  return (
    <div className="w-full">
      {/* Metadata header */}
      <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
        {currency && (
          <span className={`text-xs px-2 py-0.5 rounded border font-mono ${CURRENCY_COLORS[currency] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
            {currency}
          </span>
        )}
        {market && (
          <span className="text-xs px-2 py-0.5 rounded border bg-gray-700/50 text-gray-300 border-gray-600 font-mono">
            {market}
          </span>
        )}
        {dataSource && (
          <span className={`text-xs px-2 py-0.5 rounded border font-mono ${SOURCE_COLORS[dataSource] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
            {dataSource}
          </span>
        )}
        {underlyingSymbol && cedearRatio && (
          <span className="text-xs px-2 py-0.5 rounded border bg-gray-700/50 text-gray-400 border-gray-600">
            subyacente: <strong className="text-white">{underlyingSymbol}</strong> · ratio {cedearRatio}:1
          </span>
        )}
        {/* WS connection indicator */}
        <span className={`text-xs px-2 py-0.5 rounded border font-mono ${wsConnected ? 'bg-green-500/20 text-green-300 border-green-700' : 'bg-red-500/20 text-red-400 border-red-700'}`}>
          {wsConnected ? '● live' : '○ offline'}
        </span>
      </div>

      <ReactECharts
        option={option}
        style={{ height: '600px', width: '100%' }}
        notMerge={true}
        lazyUpdate={true}
      />
      {realtimeCandles.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          +{realtimeCandles.length} live candle{realtimeCandles.length > 1 ? 's' : ''} merged
        </div>
      )}
    </div>
  );
}
