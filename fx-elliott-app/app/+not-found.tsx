import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>ページが見つかりません</Text>
      <Link href="/" style={styles.link}>
        ホームに戻る
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#9e9e9e',
    fontSize: 16,
    marginBottom: 12,
  },
  link: {
    color: '#ffd700',
    fontSize: 14,
  },
});
