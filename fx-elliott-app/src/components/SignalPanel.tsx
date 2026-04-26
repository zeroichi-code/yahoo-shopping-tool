import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WaveSignal } from '../types';

interface Props {
  signal: WaveSignal | null;
  currentPrice: number | null;
  pairLabel: string;
}

const DIRECTION_CONFIG = {
  buy: { label: '買い', color: '#26a69a', bg: 'rgba(38,166,154,0.15)', icon: '▲' },
  sell: { label: '売り', color: '#ef5350', bg: 'rgba(239,83,80,0.15)', icon: '▼' },
  wait: { label: '待機', color: '#9e9e9e', bg: 'rgba(158,158,158,0.1)', icon: '━' },
};

export default function SignalPanel({ signal, currentPrice, pairLabel }: Props) {
  if (!signal) return null;

  const cfg = DIRECTION_CONFIG[signal.direction];
  const isJPY = pairLabel.includes('JPY');
  const priceDecimals = isJPY ? 3 : 5;

  return (
    <View style={styles.container}>
      {/* Direction badge */}
      <View style={[styles.directionBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
        <Text style={[styles.directionIcon, { color: cfg.color }]}>{cfg.icon}</Text>
        <Text style={[styles.directionLabel, { color: cfg.color }]}>{cfg.label}</Text>
        <View style={styles.confidencePill}>
          <Text style={styles.confidenceText}>確率 {signal.confidence}%</Text>
        </View>
      </View>

      {/* Wave info */}
      <View style={styles.waveRow}>
        <View style={styles.waveItem}>
          <Text style={styles.waveItemLabel}>現在の波</Text>
          <Text style={styles.waveItemValue}>{signal.currentWave}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.waveItem}>
          <Text style={styles.waveItemLabel}>次の予測</Text>
          <Text style={styles.waveItemValue}>{signal.nextWaveLabel}</Text>
        </View>
      </View>

      {/* Reason */}
      <Text style={styles.reason}>{signal.reason}</Text>

      {/* Price targets */}
      {(signal.targetPrice || signal.stopLoss || signal.entryPrice) && (
        <View style={styles.priceRow}>
          {signal.entryPrice && (
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>参入</Text>
              <Text style={[styles.priceValue, { color: '#fff' }]}>
                {signal.entryPrice.toFixed(priceDecimals)}
              </Text>
            </View>
          )}
          {signal.targetPrice && (
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>目標</Text>
              <Text style={[styles.priceValue, { color: '#26a69a' }]}>
                {signal.targetPrice.toFixed(priceDecimals)}
              </Text>
            </View>
          )}
          {signal.stopLoss && (
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>損切</Text>
              <Text style={[styles.priceValue, { color: '#ef5350' }]}>
                {signal.stopLoss.toFixed(priceDecimals)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Disclaimer */}
      <Text style={styles.disclaimer}>
        ※ エリオット波動分析は参考情報です。投資判断は自己責任でお願いします。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#12121a',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
  },
  directionIcon: {
    fontSize: 22,
    fontWeight: 'bold',
    marginRight: 8,
  },
  directionLabel: {
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 2,
    flex: 1,
  },
  confidencePill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  confidenceText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
  },
  waveRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  waveItem: {
    flex: 1,
    alignItems: 'center',
  },
  waveItemLabel: {
    color: '#757575',
    fontSize: 10,
    marginBottom: 3,
  },
  waveItemValue: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 8,
  },
  reason: {
    color: '#bdbdbd',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  priceItem: {
    alignItems: 'center',
  },
  priceLabel: {
    color: '#757575',
    fontSize: 10,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  disclaimer: {
    color: '#616161',
    fontSize: 10,
    fontStyle: 'italic',
  },
});
