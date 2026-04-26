import { Candle, CurrencyPair, TimeFrame } from '../types';

const BASE_URL = 'https://www.alphavantage.co/query';

function parsePair(pair: CurrencyPair): { from: string; to: string } {
  const [from, to] = pair.split('/');
  return { from, to };
}

function intervalForTimeFrame(tf: TimeFrame): string {
  switch (tf) {
    case '1min': return '1min';
    case '5min': return '5min';
    case '15min': return '15min';
    case '30min': return '30min';
    case '60min': return '60min';
    default: return '60min';
  }
}

export async function fetchCandles(
  pair: CurrencyPair,
  timeFrame: TimeFrame,
  apiKey: string,
  outputSize: 'compact' | 'full' = 'compact'
): Promise<Candle[]> {
  const { from, to } = parsePair(pair);
  let url: string;
  let dataKey: string;

  if (timeFrame === 'weekly') {
    url = `${BASE_URL}?function=FX_WEEKLY&from_symbol=${from}&to_symbol=${to}&apikey=${apiKey}`;
    dataKey = 'Time Series FX (Weekly)';
  } else if (timeFrame === 'daily') {
    url = `${BASE_URL}?function=FX_DAILY&from_symbol=${from}&to_symbol=${to}&outputsize=${outputSize}&apikey=${apiKey}`;
    dataKey = 'Time Series FX (Daily)';
  } else {
    const interval = intervalForTimeFrame(timeFrame);
    url = `${BASE_URL}?function=FX_INTRADAY&from_symbol=${from}&to_symbol=${to}&interval=${interval}&outputsize=${outputSize}&apikey=${apiKey}`;
    dataKey = `Time Series FX (${interval})`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`APIエラー: ${res.status}`);

  const data = await res.json();

  if (data['Note']) throw new Error('APIレート制限に達しました。しばらく待ってから再試行してください。');
  if (data['Error Message']) throw new Error(data['Error Message']);
  if (data['Information']) throw new Error('APIキーが無効または制限されています。設定で有効なAPIキーを入力してください。');

  const series = data[dataKey];
  if (!series) throw new Error('データが返されませんでした。通貨ペアまたは時間足を確認してください。');

  return (Object.entries(series) as [string, Record<string, string>][])
    .map(([time, v]) => ({
      time,
      open: parseFloat(v['1. open']),
      high: parseFloat(v['2. high']),
      low: parseFloat(v['3. low']),
      close: parseFloat(v['4. close']),
    }))
    .reverse();
}

export function generateDemoCandles(pair: CurrencyPair, count: number = 100): Candle[] {
  const basePrice = pair.includes('JPY') ? 150.0 : 1.08;
  const candles: Candle[] = [];
  let price = basePrice;
  const now = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const volatility = pair.includes('JPY') ? 0.003 : 0.002;
    const open = price;
    const change = (Math.random() - 0.48) * basePrice * volatility;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * basePrice * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * basePrice * volatility * 0.5;
    price = close;
    candles.push({
      time: date.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(pair.includes('JPY') ? 3 : 5)),
      high: parseFloat(high.toFixed(pair.includes('JPY') ? 3 : 5)),
      low: parseFloat(low.toFixed(pair.includes('JPY') ? 3 : 5)),
      close: parseFloat(close.toFixed(pair.includes('JPY') ? 3 : 5)),
    });
  }

  return candles;
}
