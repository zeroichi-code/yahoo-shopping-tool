import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import CandlestickChart from '../components/CandlestickChart';
import SignalPanel from '../components/SignalPanel';
import WaveLegend from '../components/WaveLegend';
import LoadingSpinner from '../components/LoadingSpinner';
import { TIME_FRAMES, TimeFrame } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function HomeScreen() {
  const {
    settings,
    candles,
    impulsePattern,
    correctivePattern,
    pivots,
    signal,
    isLoading,
    error,
    lastUpdated,
    loadData,
    setTimeFrame,
  } = useStore();

  useEffect(() => {
    loadData();
  }, []);

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null;
  const isJPY = settings.currencyPair.includes('JPY');
  const priceDecimals = isJPY ? 3 : 5;

  const formatTime = (d: Date | null) => {
    if (!d) return '--';
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading && candles.length === 0) {
    return <LoadingSpinner message="チャートデータを取得中..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={loadData}
            tintColor="#ffd700"
            colors={['#ffd700']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.pairText}>{settings.currencyPair}</Text>
            {currentPrice !== null && (
              <Text style={styles.priceText}>{currentPrice.toFixed(priceDecimals)}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.updateText}>更新: {formatTime(lastUpdated)}</Text>
            {settings.apiKey === 'demo' && (
              <View style={styles.demoBadge}>
                <Text style={styles.demoText}>DEMO</Text>
              </View>
            )}
          </View>
        </View>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Time frame selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tfScroll}
          contentContainerStyle={styles.tfContainer}
        >
          {TIME_FRAMES.map((tf) => (
            <TouchableOpacity
              key={tf.value}
              style={[
                styles.tfButton,
                settings.timeFrame === tf.value && styles.tfButtonActive,
              ]}
              onPress={() => setTimeFrame(tf.value as TimeFrame)}
            >
              <Text
                style={[
                  styles.tfText,
                  settings.timeFrame === tf.value && styles.tfTextActive,
                ]}
              >
                {tf.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Chart */}
        <View style={styles.chartContainer}>
          <CandlestickChart
            candles={candles}
            impulsePattern={impulsePattern}
            correctivePattern={correctivePattern}
            pivots={pivots}
            showWaveLabels={settings.showWaveLabels}
            showFibLevels={settings.showFibLevels}
            width={SCREEN_WIDTH}
            height={280}
          />
          <WaveLegend
            impulsePattern={impulsePattern}
            correctivePattern={correctivePattern}
          />
        </View>

        {/* Signal Panel */}
        <SignalPanel
          signal={signal}
          currentPrice={currentPrice}
          pairLabel={settings.currencyPair}
        />

        {/* Quick settings toggles */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggle, settings.showWaveLabels && styles.toggleActive]}
            onPress={() =>
              useStore.getState().updateSettings({ showWaveLabels: !settings.showWaveLabels })
            }
          >
            <Text style={styles.toggleText}>波ラベル</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggle, settings.showFibLevels && styles.toggleActive]}
            onPress={() =>
              useStore.getState().updateSettings({ showFibLevels: !settings.showFibLevels })
            }
          >
            <Text style={styles.toggleText}>フィボナッチ</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pairText: {
    color: '#ffd700',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  },
  priceText: {
    color: '#e0e0e0',
    fontSize: 26,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  updateText: {
    color: '#616161',
    fontSize: 11,
  },
  demoBadge: {
    backgroundColor: 'rgba(255,165,0,0.2)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,165,0,0.4)',
  },
  demoText: {
    color: '#ffa500',
    fontSize: 10,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: 'rgba(239,83,80,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#ef5350',
    marginHorizontal: 12,
    marginVertical: 4,
    padding: 10,
    borderRadius: 4,
  },
  errorText: {
    color: '#ef9a9a',
    fontSize: 12,
  },
  tfScroll: {
    maxHeight: 40,
  },
  tfContainer: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  tfButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tfButtonActive: {
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderColor: '#ffd700',
  },
  tfText: {
    color: '#9e9e9e',
    fontSize: 12,
    fontWeight: '500',
  },
  tfTextActive: {
    color: '#ffd700',
    fontWeight: '700',
  },
  chartContainer: {
    backgroundColor: '#0d0d14',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  toggleActive: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderColor: 'rgba(255,215,0,0.5)',
  },
  toggleText: {
    color: '#bdbdbd',
    fontSize: 12,
  },
});
