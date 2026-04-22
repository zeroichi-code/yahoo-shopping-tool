import { create } from 'zustand';
import {
  AppSettings,
  Candle,
  CurrencyPair,
  ElliottWavePattern,
  PivotPoint,
  TimeFrame,
  WaveSignal,
} from '../types';
import { fetchCandles, generateDemoCandles } from '../services/fxApi';
import { detectElliottWaves, generateSignal } from '../algorithms/elliottWave';

interface StoreState {
  settings: AppSettings;
  candles: Candle[];
  pivots: PivotPoint[];
  impulsePattern: ElliottWavePattern | null;
  correctivePattern: ElliottWavePattern | null;
  signal: WaveSignal | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;

  updateSettings: (partial: Partial<AppSettings>) => void;
  loadData: () => Promise<void>;
  setPair: (pair: CurrencyPair) => void;
  setTimeFrame: (tf: TimeFrame) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: 'demo',
  currencyPair: 'USD/JPY',
  timeFrame: 'daily',
  zigzagThreshold: 0.008,
  showWaveLabels: true,
  showFibLevels: true,
};

export const useStore = create<StoreState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  candles: [],
  pivots: [],
  impulsePattern: null,
  correctivePattern: null,
  signal: null,
  isLoading: false,
  error: null,
  lastUpdated: null,

  updateSettings: (partial) => {
    set((s) => ({ settings: { ...s.settings, ...partial } }));
  },

  setPair: (pair) => {
    set((s) => ({ settings: { ...s.settings, currencyPair: pair } }));
    get().loadData();
  },

  setTimeFrame: (tf) => {
    set((s) => ({ settings: { ...s.settings, timeFrame: tf } }));
    get().loadData();
  },

  loadData: async () => {
    const { settings } = get();
    set({ isLoading: true, error: null });

    try {
      let candles: Candle[];

      if (settings.apiKey === 'demo') {
        candles = generateDemoCandles(settings.currencyPair, 120);
      } else {
        candles = await fetchCandles(
          settings.currencyPair,
          settings.timeFrame,
          settings.apiKey
        );
      }

      const { impulsePattern, correctivePattern, pivots } = detectElliottWaves(
        candles,
        settings.zigzagThreshold
      );

      const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
      const signal = generateSignal(impulsePattern, correctivePattern, currentPrice);

      set({
        candles,
        pivots,
        impulsePattern,
        correctivePattern,
        signal,
        isLoading: false,
        lastUpdated: new Date(),
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'データの取得に失敗しました。',
      });
    }
  },
}));
