import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';

interface Props {
  message?: string;
}

export default function LoadingSpinner({ message = '読み込み中...' }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#ffd700" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
  },
  text: {
    color: '#9e9e9e',
    marginTop: 12,
    fontSize: 14,
  },
});
