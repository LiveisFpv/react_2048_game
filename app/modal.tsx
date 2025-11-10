import { Link } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const STRATEGY_TIPS = [
  {
    id: 'corner',
    title: 'Play toward a corner',
    summary: 'Commit your highest tile to a single corner so every swipe funnels value there.',
    checklist: [
      'Pick a corner before you start moving tiles.',
      'Avoid swiping away from the corner unless the board is jammed.',
      'Use horizontal moves to set up merges before pushing upward.',
    ],
  },
  {
    id: 'stacking',
    title: 'Stack descending values',
    summary:
      'Descending values next to your mega tile keep merges predictable and free additional space.',
    checklist: [
      'Keep the second-highest tile adjacent to the corner tile.',
      'Mirror the pattern along the row before working on the next column.',
      'If you misplace a tile, undo quickly with the new Save & Restart action.',
    ],
  },
  {
    id: 'tempo',
    title: 'Control the tempo',
    summary:
      'Short, purposeful swipes limit accidental merges and reduce the odds of running out of moves.',
    checklist: [
      'Pause whenever a new tile appears to re-evaluate the plan.',
      'Use the motion sensor shake reset only when the board is unsalvageable.',
      'Log tough runs in the Recent Runs panel to learn from them later.',
    ],
  },
] as const;

export default function ModalScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Strategy Center
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        Quick coaching notes you can act on while you play the upgraded 2048 board.
      </ThemedText>
      <FlatList
        data={STRATEGY_TIPS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
              {item.title}
            </ThemedText>
            <ThemedText style={styles.cardSummary}>{item.summary}</ThemedText>
            {item.checklist.map((note) => (
              <View key={note} style={styles.checkRow}>
                <View style={styles.checkBullet} />
                <ThemedText style={styles.checkText}>{note}</ThemedText>
              </View>
            ))}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <ThemedText style={styles.footerText}>
              Need more? Open the Explore tab for templates or share your run with teammates.
            </ThemedText>
            <Link href="/" dismissTo style={styles.link}>
              <ThemedText type="link">Back to the board</ThemedText>
            </Link>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: '#776e65',
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fdf8ef',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    marginBottom: 6,
  },
  cardSummary: {
    color: '#776e65',
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  checkBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8f7a66',
    marginRight: 8,
  },
  checkText: {
    flex: 1,
    color: '#3c3a32',
  },
  footer: {
    marginTop: 12,
    alignItems: 'center',
  },
  footerText: {
    color: '#776e65',
    textAlign: 'center',
    marginBottom: 8,
  },
  link: {
    paddingVertical: 10,
  },
});
