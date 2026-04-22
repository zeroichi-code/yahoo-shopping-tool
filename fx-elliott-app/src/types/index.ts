export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PivotPoint {
  index: number;
  time: string;
  price: number;
  type: 'high' | 'low';
}

export interface WaveSegment {
  startPivot: PivotPoint;
  endPivot: PivotPoint;
  label: string;
  type: 'impulse' | 'corrective';
}

export interface ElliottWavePattern {
  waves: WaveSegment[];
  patternType: 'impulse' | 'corrective';
  confidence: number;
}

export interface WaveSignal {
  currentWave: string;
  nextWaveLabel: string;
  confidence: number;
  direction: 'buy' | 'sell' | 'wait';
  reason: string;
  targetPrice?: number;
  stopLoss?: number;
  entryPrice?: number;
}

export type TimeFrame = '1min' | '5min' | '15min' | '30min' | '60min' | 'daily' | 'weekly';

export type CurrencyPair =
  | 'USD/JPY'
  | 'EUR/USD'
  | 'EUR/JPY'
  | 'GBP/USD'
  | 'GBP/JPY'
  | 'AUD/USD'
  | 'USD/CHF';

export interface AppSettings {
  apiKey: string;
  currencyPair: CurrencyPair;
  timeFrame: TimeFrame;
  zigzagThreshold: number;
  showWaveLabels: boolean;
  showFibLevels: boolean;
}

export const CURRENCY_PAIRS: CurrencyPair[] = [
  'USD/JPY',
  'EUR/USD',
  'EUR/JPY',
  'GBP/USD',
  'GBP/JPY',
  'AUD/USD',
  'USD/CHF',
];

export const TIME_FRAMES: { label: string; value: TimeFrame }[] = [
  { label: '1分', value: '1min' },
  { label: '5分', value: '5min' },
  { label: '15分', value: '15min' },
  { label: '30分', value: '30min' },
  { label: '1時間', value: '60min' },
  { label: '日足', value: 'daily' },
  { label: '週足', value: 'weekly' },
];
