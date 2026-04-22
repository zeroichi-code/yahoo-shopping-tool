import { Candle, ElliottWavePattern, PivotPoint, WaveSegment, WaveSignal } from '../types';

export function findPivots(candles: Candle[], threshold: number = 0.01): PivotPoint[] {
  if (candles.length < 5) return [];

  const raw: PivotPoint[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isHigh =
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high;

    const isLow =
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low;

    if (isHigh) raw.push({ index: i, time: c.time, price: c.high, type: 'high' });
    else if (isLow) raw.push({ index: i, time: c.time, price: c.low, type: 'low' });
  }

  return applyZigZagFilter(raw, threshold);
}

function applyZigZagFilter(pivots: PivotPoint[], threshold: number): PivotPoint[] {
  if (pivots.length === 0) return [];
  const out: PivotPoint[] = [pivots[0]];

  for (let i = 1; i < pivots.length; i++) {
    const prev = out[out.length - 1];
    const curr = pivots[i];
    const move = Math.abs(curr.price - prev.price) / prev.price;

    if (curr.type === prev.type) {
      // Same direction: keep more extreme
      if (
        (curr.type === 'high' && curr.price > prev.price) ||
        (curr.type === 'low' && curr.price < prev.price)
      ) {
        out[out.length - 1] = curr;
      }
    } else if (move >= threshold) {
      out.push(curr);
    }
  }

  return out;
}

function impulseScore(p: PivotPoint[]): number {
  if (p.length < 6) return 0;

  const isUp = p[1].price > p[0].price;
  let score = 0;

  const wSize = (a: PivotPoint, b: PivotPoint) => Math.abs(b.price - a.price);
  const w1 = wSize(p[0], p[1]);
  const w2 = wSize(p[1], p[2]);
  const w3 = wSize(p[2], p[3]);
  const w4 = wSize(p[3], p[4]);
  const w5 = wSize(p[4], p[5]);

  // Rule 1: Wave 2 never retraces past wave 1 start
  if (isUp && p[2].price <= p[0].price) return 0;
  if (!isUp && p[2].price >= p[0].price) return 0;
  score++;

  // Rule 2: Wave 3 is not the shortest
  if (w3 < w1 && w3 < w5) return 0;
  score++;

  // Rule 3: Wave 4 never overlaps wave 1 territory
  if (isUp && p[4].price <= p[1].price) return 0;
  if (!isUp && p[4].price >= p[1].price) return 0;
  score++;

  // Fibonacci quality bonuses
  const w2Ratio = w2 / w1;
  if (w2Ratio >= 0.382 && w2Ratio <= 0.786) score += 0.5;

  const w3Ratio = w3 / w1;
  if (w3Ratio >= 1.382 && w3Ratio <= 2.618) score += 0.5;

  const w4Ratio = w4 / w3;
  if (w4Ratio >= 0.236 && w4Ratio <= 0.5) score += 0.5;

  const w5Ratio = w5 / w1;
  if (w5Ratio >= 0.618 && w5Ratio <= 1.0) score += 0.5;

  return score / 5.5;
}

function correctiveScore(p: PivotPoint[]): number {
  if (p.length < 4) return 0;

  const isUpA = p[1].price > p[0].price;
  const wA = Math.abs(p[1].price - p[0].price);
  const wB = Math.abs(p[2].price - p[1].price);
  const wC = Math.abs(p[3].price - p[2].price);

  let score = 0;

  // B must not exceed A start by more than 138.2%
  const bRatio = wB / wA;
  if (bRatio > 1.382) return 0;
  score++;

  if (bRatio >= 0.382 && bRatio <= 0.786) score += 0.5;

  // C roughly equals A
  const cRatio = wC / wA;
  if (cRatio >= 0.618 && cRatio <= 1.618) score += 0.5;

  // Direction alternation
  if (isUpA) {
    if (p[2].price < p[1].price && p[3].price < p[2].price) score++;
  } else {
    if (p[2].price > p[1].price && p[3].price > p[2].price) score++;
  }

  return Math.min(score / 3, 1);
}

export function detectElliottWaves(
  candles: Candle[],
  threshold: number = 0.01
): {
  impulsePattern: ElliottWavePattern | null;
  correctivePattern: ElliottWavePattern | null;
  pivots: PivotPoint[];
} {
  const pivots = findPivots(candles, threshold);

  let bestImpulse: ElliottWavePattern | null = null;
  let bestCorrective: ElliottWavePattern | null = null;

  const start = Math.max(0, pivots.length - 12);

  for (let i = start; i <= pivots.length - 6; i++) {
    const seg = pivots.slice(i, i + 6);
    const conf = impulseScore(seg);
    if (conf > 0 && (!bestImpulse || conf > bestImpulse.confidence)) {
      const labels = ['1', '2', '3', '4', '5'];
      const waves: WaveSegment[] = labels.map((label, idx) => ({
        startPivot: seg[idx],
        endPivot: seg[idx + 1],
        label,
        type: 'impulse',
      }));
      bestImpulse = { waves, patternType: 'impulse', confidence: conf };
    }
  }

  for (let i = start; i <= pivots.length - 4; i++) {
    const seg = pivots.slice(i, i + 4);
    const conf = correctiveScore(seg);
    if (conf > 0 && (!bestCorrective || conf > bestCorrective.confidence)) {
      const labels = ['A', 'B', 'C'];
      const waves: WaveSegment[] = labels.map((label, idx) => ({
        startPivot: seg[idx],
        endPivot: seg[idx + 1],
        label,
        type: 'corrective',
      }));
      bestCorrective = { waves, patternType: 'corrective', confidence: conf };
    }
  }

  return { impulsePattern: bestImpulse, correctivePattern: bestCorrective, pivots };
}

export function generateSignal(
  impulsePattern: ElliottWavePattern | null,
  correctivePattern: ElliottWavePattern | null,
  currentPrice: number
): WaveSignal {
  if (!impulsePattern && !correctivePattern) {
    return {
      currentWave: '不明',
      nextWaveLabel: '?',
      confidence: 0,
      direction: 'wait',
      reason: '波のパターンが検出できませんでした。データが不足しているか、設定のZigZag感度を調整してください。',
    };
  }

  const lastIdx = (p: ElliottWavePattern) =>
    p.waves[p.waves.length - 1].endPivot.index;

  const useImpulse =
    impulsePattern &&
    (!correctivePattern || lastIdx(impulsePattern) >= lastIdx(correctivePattern));

  if (useImpulse && impulsePattern) return buildImpulseSignal(impulsePattern, currentPrice);
  if (correctivePattern) return buildCorrectiveSignal(correctivePattern, currentPrice);

  return {
    currentWave: '不明',
    nextWaveLabel: '?',
    confidence: 0,
    direction: 'wait',
    reason: 'パターン分析中です。',
  };
}

function buildImpulseSignal(pattern: ElliottWavePattern, currentPrice: number): WaveSignal {
  const last = pattern.waves[pattern.waves.length - 1];
  const confidence = Math.round(pattern.confidence * 100);
  const isUp = pattern.waves[0].endPivot.price > pattern.waves[0].startPivot.price;

  const w1Size = Math.abs(
    pattern.waves[0].endPivot.price - pattern.waves[0].startPivot.price
  );

  switch (last.label) {
    case '1':
      return {
        currentWave: '第1波 完了',
        nextWaveLabel: '第2波（押し目調整）',
        confidence,
        direction: 'wait',
        reason: '第1波が完了しました。第2波の押し目（38.2〜61.8%戻し）を待ってから参入を検討してください。',
        targetPrice: isUp
          ? last.endPivot.price - w1Size * 0.618
          : last.endPivot.price + w1Size * 0.618,
      };
    case '2': {
      const entry = last.endPivot.price;
      return {
        currentWave: '第2波 完了',
        nextWaveLabel: '第3波（最強の推進波）',
        confidence,
        direction: isUp ? 'buy' : 'sell',
        reason: '第2波押し目が完了。第3波は最も強い推進波です。高確率の参入チャンス。',
        targetPrice: isUp ? entry + w1Size * 1.618 : entry - w1Size * 1.618,
        stopLoss: isUp
          ? pattern.waves[0].startPivot.price
          : pattern.waves[0].startPivot.price,
        entryPrice: currentPrice,
      };
    }
    case '3': {
      const w3Size = Math.abs(last.endPivot.price - last.startPivot.price);
      return {
        currentWave: '第3波 完了',
        nextWaveLabel: '第4波（調整）',
        confidence,
        direction: 'wait',
        reason: '第3波が完了しました。第4波の調整を待ちます。38.2%戻しが目安です。',
        targetPrice: isUp
          ? last.endPivot.price - w3Size * 0.382
          : last.endPivot.price + w3Size * 0.382,
      };
    }
    case '4': {
      const entry = last.endPivot.price;
      return {
        currentWave: '第4波 完了',
        nextWaveLabel: '第5波（最終推進波）',
        confidence,
        direction: isUp ? 'buy' : 'sell',
        reason: '第4波調整が完了。第5波の最終推進波。利益確定目標を設定して参入。',
        targetPrice: isUp ? entry + w1Size : entry - w1Size,
        stopLoss: isUp
          ? pattern.waves[2].endPivot.price
          : pattern.waves[2].endPivot.price,
        entryPrice: currentPrice,
      };
    }
    case '5':
      return {
        currentWave: '第5波 完了（推進波終了）',
        nextWaveLabel: 'A波（修正波開始）',
        confidence,
        direction: isUp ? 'sell' : 'buy',
        reason: '5波動の推進波が完了。修正波（A-B-C）の開始が予想されます。逆方向への転換を検討。',
        entryPrice: currentPrice,
      };
    default:
      return {
        currentWave: last.label,
        nextWaveLabel: '?',
        confidence,
        direction: 'wait',
        reason: '分析中です。',
      };
  }
}

function buildCorrectiveSignal(pattern: ElliottWavePattern, currentPrice: number): WaveSignal {
  const last = pattern.waves[pattern.waves.length - 1];
  const confidence = Math.round(pattern.confidence * 100);
  const isUpA = pattern.waves[0].endPivot.price > pattern.waves[0].startPivot.price;
  const aSize = Math.abs(
    pattern.waves[0].endPivot.price - pattern.waves[0].startPivot.price
  );

  switch (last.label) {
    case 'A':
      return {
        currentWave: 'A波 完了',
        nextWaveLabel: 'B波（反発）',
        confidence,
        direction: 'wait',
        reason: 'A波が完了しました。B波の反発（A波の38.2〜61.8%）を待ちます。',
        targetPrice: isUpA
          ? last.endPivot.price - aSize * 0.5
          : last.endPivot.price + aSize * 0.5,
      };
    case 'B': {
      const entry = last.endPivot.price;
      return {
        currentWave: 'B波 完了',
        nextWaveLabel: 'C波（最終調整）',
        confidence,
        direction: isUpA ? 'sell' : 'buy',
        reason: 'B波完了。C波はA波とほぼ同じ値幅が目安。最終調整波への参入チャンス。',
        targetPrice: isUpA ? entry - aSize : entry + aSize,
        stopLoss: pattern.waves[0].startPivot.price,
        entryPrice: currentPrice,
      };
    }
    case 'C':
      return {
        currentWave: 'C波 完了（修正波終了）',
        nextWaveLabel: '新たな推進波',
        confidence,
        direction: isUpA ? 'buy' : 'sell',
        reason: 'A-B-C修正波が完了しました。新たな推進波の開始が予想されます。トレンド転換シグナル。',
        entryPrice: currentPrice,
      };
    default:
      return {
        currentWave: last.label,
        nextWaveLabel: '?',
        confidence,
        direction: 'wait',
        reason: '分析中です。',
      };
  }
}

export function calculateFibLevels(
  startPrice: number,
  endPrice: number
): { ratio: number; price: number; label: string }[] {
  const diff = endPrice - startPrice;
  return [0.236, 0.382, 0.5, 0.618, 0.786].map((ratio) => ({
    ratio,
    price: endPrice - diff * ratio,
    label: `${(ratio * 100).toFixed(1)}%`,
  }));
}
