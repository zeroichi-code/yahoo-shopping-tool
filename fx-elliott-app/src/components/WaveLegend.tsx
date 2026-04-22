import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ElliottWavePattern } from '../types';

interface Props {
  impulsePattern: ElliottWavePattern | null;
  correctivePattern: ElliottWavePattern | null;
}

export default function WaveLegend({ impulsePattern, correctivePattern }: Props) {
  const pattern = impulsePattern ?? correctivePattern;
  if (!pattern) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.line, { backgroundColor: '#ffd700' }]} />
        <Text style={styles.text}>推進波 (1-2-3-4-5)</Text>
        <View style={[styles.line, { backgroundColor: '#ff9800', marginLeft: 12 }]} />
        <Text style={styles.text}>修正波 (A-B-C)</Text>
      </View>
      <Text style={styles.confidence}>
        検出信頼度: {Math.round(pattern.confidence * 100)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  line: {
    width: 20,
    height: 2,
    marginRight: 4,
  },
  text: {
    color: '#9e9e9e',
    fontSize: 10,
  },
  confidence: {
    color: '#757575',
    fontSize: 10,
  },
});
