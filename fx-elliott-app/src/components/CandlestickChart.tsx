import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Rect,
  Line,
  Text as SvgText,
  G,
  Circle,
  Path,
} from 'react-native-svg';
import { Candle, ElliottWavePattern, PivotPoint } from '../types';

interface Props {
  candles: Candle[];
  impulsePattern: ElliottWavePattern | null;
  correctivePattern: ElliottWavePattern | null;
  pivots: PivotPoint[];
  showWaveLabels: boolean;
  showFibLevels: boolean;
  width?: number;
  height?: number;
}

const PADDING = { top: 20, right: 10, bottom: 30, left: 55 };
const BULLISH_COLOR = '#26a69a';
const BEARISH_COLOR = '#ef5350';
const WAVE_IMPULSE_COLOR = '#ffd700';
const WAVE_CORRECTIVE_COLOR = '#ff9800';
const FIB_COLOR = 'rgba(100,181,246,0.4)';
const GRID_COLOR = 'rgba(255,255,255,0.08)';

const SCREEN_WIDTH = Dimensions.get('window').width;

function priceScale(
  price: number,
  minP: number,
  maxP: number,
  chartH: number,
  padTop: number
): number {
  return padTop + ((maxP - price) / (maxP - minP)) * chartH;
}

export default function CandlestickChart({
  candles,
  impulsePattern,
  correctivePattern,
  pivots,
  showWaveLabels,
  showFibLevels,
  width = SCREEN_WIDTH,
  height = 280,
}: Props) {
  const svgWidth = width;
  const svgHeight = height;
  const chartW = svgWidth - PADDING.left - PADDING.right;
  const chartH = svgHeight - PADDING.top - PADDING.bottom;

  const visible = useMemo(() => candles.slice(-60), [candles]);

  const { minP, maxP } = useMemo(() => {
    if (visible.length === 0) return { minP: 0, maxP: 1 };
    const lows = visible.map((c) => c.low);
    const highs = visible.map((c) => c.high);
    const lo = Math.min(...lows);
    const hi = Math.max(...highs);
    const pad = (hi - lo) * 0.05;
    return { minP: lo - pad, maxP: hi + pad };
  }, [visible]);

  const candleW = Math.max(2, chartW / visible.length - 1);
  const candleGap = chartW / visible.length;

  const toY = (p: number) => priceScale(p, minP, maxP, chartH, PADDING.top);
  const toX = (i: number) => PADDING.left + i * candleGap + candleGap / 2;

  const priceLabels = useMemo(() => {
    const steps = 5;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const price = minP + ((maxP - minP) * i) / steps;
      return { price, y: toY(price) };
    });
  }, [minP, maxP, chartH]);

  const wavePattern = impulsePattern ?? correctivePattern;

  const fibLines = useMemo(() => {
    if (!showFibLevels || !wavePattern || wavePattern.waves.length < 1) return [];
    const firstWave = wavePattern.waves[0];
    const lastWave = wavePattern.waves[wavePattern.waves.length - 1];
    const s = firstWave.startPivot.price;
    const e = lastWave.endPivot.price;
    const diff = e - s;
    return [0.236, 0.382, 0.5, 0.618, 0.786].map((r) => ({
      price: e - diff * r,
      label: `${(r * 100).toFixed(1)}%`,
    }));
  }, [showFibLevels, wavePattern]);

  // Map pivot index to visible index
  const firstVisibleIdx = candles.length - visible.length;
  const pivotToVisibleIdx = (pivotIdx: number) => pivotIdx - firstVisibleIdx;

  const waveLines = useMemo(() => {
    if (!showWaveLabels || !wavePattern) return [];
    return wavePattern.waves.map((w) => {
      const x1 = toX(pivotToVisibleIdx(w.startPivot.index));
      const y1 = toY(w.startPivot.price);
      const x2 = toX(pivotToVisibleIdx(w.endPivot.index));
      const y2 = toY(w.endPivot.price);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2 - 12;
      const color =
        wavePattern.patternType === 'impulse' ? WAVE_IMPULSE_COLOR : WAVE_CORRECTIVE_COLOR;
      return { x1, y1, x2, y2, midX, midY, label: w.label, color };
    });
  }, [showWaveLabels, wavePattern, visible, minP, maxP]);

  if (visible.length === 0) {
    return (
      <View style={[styles.container, { width: svgWidth, height: svgHeight }]}>
        <Text style={styles.empty}>データがありません</Text>
      </View>
    );
  }

  return (
    <View style={{ width: svgWidth, height: svgHeight }}>
      <Svg width={svgWidth} height={svgHeight}>
        {/* Grid lines */}
        {priceLabels.map((pl, i) => (
          <G key={`grid-${i}`}>
            <Line
              x1={PADDING.left}
              y1={pl.y}
              x2={svgWidth - PADDING.right}
              y2={pl.y}
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
            <SvgText
              x={PADDING.left - 4}
              y={pl.y + 4}
              fontSize={9}
              fill="#9e9e9e"
              textAnchor="end"
            >
              {pl.price.toFixed(pl.price > 10 ? 2 : 4)}
            </SvgText>
          </G>
        ))}

        {/* Fibonacci levels */}
        {fibLines.map((fl, i) => {
          const y = toY(fl.price);
          if (y < PADDING.top || y > svgHeight - PADDING.bottom) return null;
          return (
            <G key={`fib-${i}`}>
              <Line
                x1={PADDING.left}
                y1={y}
                x2={svgWidth - PADDING.right}
                y2={y}
                stroke={FIB_COLOR}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <SvgText
                x={svgWidth - PADDING.right + 2}
                y={y + 4}
                fontSize={8}
                fill="#64b5f6"
              >
                {fl.label}
              </SvgText>
            </G>
          );
        })}

        {/* Wave lines */}
        {waveLines.map((wl, i) => (
          <G key={`wave-${i}`}>
            <Line
              x1={wl.x1}
              y1={wl.y1}
              x2={wl.x2}
              y2={wl.y2}
              stroke={wl.color}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              opacity={0.8}
            />
            <Circle cx={wl.x1} cy={wl.y1} r={3} fill={wl.color} />
            <Rect
              x={wl.midX - 8}
              y={wl.midY - 8}
              width={16}
              height={14}
              rx={3}
              fill="rgba(0,0,0,0.7)"
            />
            <SvgText
              x={wl.midX}
              y={wl.midY + 3}
              fontSize={10}
              fontWeight="bold"
              fill={wl.color}
              textAnchor="middle"
            >
              {wl.label}
            </SvgText>
          </G>
        ))}

        {/* Candlesticks */}
        {visible.map((c, i) => {
          const x = toX(i);
          const openY = toY(c.open);
          const closeY = toY(c.close);
          const highY = toY(c.high);
          const lowY = toY(c.low);
          const isBull = c.close >= c.open;
          const color = isBull ? BULLISH_COLOR : BEARISH_COLOR;
          const bodyTop = Math.min(openY, closeY);
          const bodyH = Math.max(1, Math.abs(closeY - openY));

          return (
            <G key={`c-${i}`}>
              <Line
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={color}
                strokeWidth={1}
              />
              <Rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={color}
              />
            </G>
          );
        })}

        {/* Last price label */}
        {visible.length > 0 && (() => {
          const last = visible[visible.length - 1];
          const y = toY(last.close);
          const isBull = last.close >= last.open;
          return (
            <G>
              <Line
                x1={PADDING.left}
                y1={y}
                x2={svgWidth - PADDING.right}
                y2={y}
                stroke={isBull ? BULLISH_COLOR : BEARISH_COLOR}
                strokeWidth={0.8}
                strokeDasharray="3 2"
                opacity={0.7}
              />
              <Rect
                x={svgWidth - PADDING.right - 1}
                y={y - 8}
                width={50}
                height={16}
                rx={3}
                fill={isBull ? BULLISH_COLOR : BEARISH_COLOR}
              />
              <SvgText
                x={svgWidth - PADDING.right + 25}
                y={y + 4}
                fontSize={9}
                fill="#fff"
                textAnchor="middle"
              >
                {last.close.toFixed(last.close > 10 ? 3 : 5)}
              </SvgText>
            </G>
          );
        })()}

        {/* X-axis labels */}
        {visible
          .filter((_, i) => i % Math.max(1, Math.floor(visible.length / 5)) === 0)
          .map((c, i, arr) => {
            const origIdx =
              i * Math.max(1, Math.floor(visible.length / 5));
            const x = toX(origIdx);
            const label = c.time.length > 10 ? c.time.slice(5, 10) : c.time.slice(-5);
            return (
              <SvgText
                key={`xl-${i}`}
                x={x}
                y={svgHeight - 5}
                fontSize={8}
                fill="#9e9e9e"
                textAnchor="middle"
              >
                {label}
              </SvgText>
            );
          })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0d14',
  },
  empty: {
    color: '#9e9e9e',
    fontSize: 14,
  },
});
