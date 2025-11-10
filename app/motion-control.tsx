import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGameContext } from '@/context/game-context';

export default function MotionControlScreen() {
  const { sensorEnabled, setSensorEnabled, sensorSupported, sensorData, notification } =
    useGameContext();

  const axis = [
    { label: 'X', value: sensorData.x },
    { label: 'Y', value: sensorData.y },
    { label: 'Z', value: sensorData.z },
  ];

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Motion control
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        Toggle the accelerometer-powered shake reset. Simulators usually report no sensors, so test
        on a real device when possible.
      </ThemedText>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText type="defaultSemiBold">Shake reset</ThemedText>
          <Switch
            value={sensorEnabled}
            onValueChange={setSensorEnabled}
            disabled={!sensorSupported}
            trackColor={{ false: '#d1c9bc', true: '#8f7a66' }}
            thumbColor="#f9f6f2"
            ios_backgroundColor="#d1c9bc"
          />
        </View>
        {!sensorSupported ? (
          <ThemedText style={styles.helper}>
            Motion sensors are not available in this environment. Deploy to hardware to try it out.
          </ThemedText>
        ) : (
          <View style={styles.axisGrid}>
            {axis.map((reading) => (
              <View key={reading.label} style={styles.axisRow}>
                <ThemedText style={styles.axisLabel}>{reading.label}</ThemedText>
                <ThemedText style={styles.axisValue}>{reading.value.toFixed(2)}</ThemedText>
              </View>
            ))}
          </View>
        )}
        {notification && (
          <View style={styles.banner}>
            <ThemedText style={styles.bannerText}>{notification}</ThemedText>
          </View>
        )}
      </View>
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
  card: {
    backgroundColor: '#fdf8ef',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helper: {
    color: '#8f7a66',
  },
  axisGrid: {
    gap: 8,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontWeight: '600',
    color: '#3c3a32',
  },
  axisValue: {
    fontWeight: '600',
    color: '#3c3a32',
    fontVariant: ['tabular-nums'],
  },
  banner: {
    backgroundColor: '#e0f2e7',
    borderRadius: 8,
    padding: 10,
  },
  bannerText: {
    color: '#1d6633',
    fontWeight: '600',
  },
});
