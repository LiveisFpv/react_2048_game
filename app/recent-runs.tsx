import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { RecentRun, useGameContext } from '@/context/game-context';

export default function RecentRunsScreen() {
  const { recentRuns } = useGameContext();
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Recent runs
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        Every completed or shaken run gets logged here so you can review pacing and restart points.
      </ThemedText>
      <Pressable style={styles.linkButton} onPress={() => router.replace('/')}>
        <ThemedText type="defaultSemiBold" style={styles.linkText}>
          Jump back to the board
        </ThemedText>
      </Pressable>
      <FlatList
        data={recentRuns}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <HistoryRow run={item} />}
        ListEmptyComponent={
          <ThemedText style={styles.helper}>
            No runs yet. Finish a game or trigger the shake reset to start the log.
          </ThemedText>
        }
      />
    </ThemedView>
  );
}

function HistoryRow({ run }: { run: RecentRun }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowContent}>
        <ThemedText style={styles.score}>{run.score}</ThemedText>
        <ThemedText style={styles.meta}>
          {run.timestamp} ·{' '}
          {run.triggeredBy === 'sensor'
            ? 'Shake reset'
            : run.triggeredBy === 'menu'
              ? 'Menu action'
              : 'Manual'}
        </ThemedText>
      </View>
      <View style={styles.badge}>
        <ThemedText style={styles.badgeText}>{run.triggeredBy.toUpperCase()}</ThemedText>
      </View>
    </View>
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
  linkButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  linkText: {
    color: '#8f7a66',
  },
  listContent: {
    paddingTop: 8,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  helper: {
    color: '#8f7a66',
    textAlign: 'center',
    marginTop: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowContent: {
    flex: 1,
    paddingRight: 12,
  },
  score: {
    fontSize: 22,
    fontWeight: '700',
    color: '#3c3a32',
  },
  meta: {
    color: '#8f7a66',
    fontSize: 12,
  },
  badge: {
    backgroundColor: '#eee0c8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#8f7a66',
    fontSize: 12,
    fontWeight: '600',
  },
});
