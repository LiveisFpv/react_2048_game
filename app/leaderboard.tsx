import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type LeaderboardEntry = {
  id: string;
  name: string;
  location: string;
  score: number;
};

type RemoteUser = {
  id: number;
  name: string;
  address: { city: string };
};

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('https://jsonplaceholder.typicode.com/users?_limit=8');
        if (!response.ok) {
          throw new Error('Failed to load leaderboard');
        }
        const data = (await response.json()) as RemoteUser[];
        if (!isMounted) {
          return;
        }
        const mapped = data.map((user) => ({
          id: String(user.id),
          name: user.name,
          location: user.address?.city ?? 'Unknown city',
          score: 1800 + user.id * 128,
        }));
        setEntries(mapped);
      } catch {
        if (isMounted) {
          setError('Unable to reach the community leaderboard right now.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchLeaderboard();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Community leaderboard
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        Scores come from a placeholder API feed so you can swap in a real backend later.
      </ThemedText>
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#8f7a66" />
          <ThemedText style={styles.loadingText}>Fetching leaderboard...</ThemedText>
        </View>
      )}
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      <FlatList
        data={entries}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <ThemedText style={styles.rank}>{index + 1}</ThemedText>
            <View style={styles.rowContent}>
              <ThemedText style={styles.name}>{item.name}</ThemedText>
              <ThemedText style={styles.meta}>{item.location}</ThemedText>
            </View>
            <ThemedText style={styles.score}>{item.score}</ThemedText>
          </View>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <ThemedText style={styles.meta}>No entries just yet. Play a round to log data.</ThemedText>
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: '#776e65',
    marginBottom: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#776e65',
  },
  error: {
    color: '#b5472b',
  },
  listContent: {
    paddingTop: 8,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rank: {
    width: 32,
    textAlign: 'center',
    fontWeight: '700',
    color: '#8f7a66',
  },
  rowContent: {
    flex: 1,
    paddingRight: 12,
  },
  name: {
    fontWeight: '600',
    color: '#3c3a32',
  },
  meta: {
    color: '#8f7a66',
    fontSize: 12,
  },
  score: {
    fontWeight: '700',
    color: '#3c3a32',
  },
});
