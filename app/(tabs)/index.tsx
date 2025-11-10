import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type Direction = 'up' | 'down' | 'left' | 'right';

type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  isNew: boolean;
  justMerged: boolean;
};

const BOARD_SIZE = 4;
const INITIAL_TILES = 2;
const BOARD_PADDING = 12;
const CELL_GAP = 12;

const TILE_COLORS: Record<number, { background: string; color: string }> = {
  0: { background: '#cdc1b4', color: '#776e65' },
  2: { background: '#eee4da', color: '#776e65' },
  4: { background: '#ede0c8', color: '#776e65' },
  8: { background: '#f2b179', color: '#f9f6f2' },
  16: { background: '#f59563', color: '#f9f6f2' },
  32: { background: '#f67c5f', color: '#f9f6f2' },
  64: { background: '#f65e3b', color: '#f9f6f2' },
  128: { background: '#edcf72', color: '#f9f6f2' },
  256: { background: '#edcc61', color: '#f9f6f2' },
  512: { background: '#edc850', color: '#f9f6f2' },
  1024: { background: '#edc53f', color: '#f9f6f2' },
  2048: { background: '#edc22e', color: '#f9f6f2' },
};

const MENU_ITEMS = [
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    description: 'Live community data',
  },
  {
    id: 'sensors',
    label: 'Motion Control',
    description: 'Shake for a new game',
  },
  {
    id: 'history',
    label: 'Recent Runs',
    description: 'Track your sessions',
  },
  {
    id: 'strategy',
    label: 'Strategy Center',
    description: 'Open the tips modal',
  },
] as const;

type MenuAction = (typeof MENU_ITEMS)[number]['id'];
type MenuSection = Exclude<MenuAction, 'strategy'>;

type LeaderboardEntry = {
  id: string;
  name: string;
  location: string;
  score: number;
};

type GameResetReason = 'manual' | 'sensor' | 'menu';

type RecentRun = {
  id: number;
  score: number;
  timestamp: string;
  triggeredBy: GameResetReason;
};

type SensorVector = {
  x: number;
  y: number;
  z: number;
};

const SHAKE_THRESHOLD = 1.8;
const SHAKE_DEBOUNCE_MS = 2200;

type MoveResult = {
  tiles: Tile[];
  moved: boolean;
  scoreGained: number;
};

type Coordinates = {
  row: number;
  col: number;
};

function generateInitialTiles(getId: () => number): Tile[] {
  let tiles: Tile[] = [];

  for (let i = 0; i < INITIAL_TILES; i += 1) {
    const emptyPositions = getEmptyPositions(tiles);
    if (emptyPositions.length === 0) {
      break;
    }

    const choice = emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
    const value = Math.random() < 0.9 ? 2 : 4;

    tiles = [
      ...tiles,
      {
        id: getId(),
        value,
        row: choice.row,
        col: choice.col,
        isNew: true,
        justMerged: false,
      },
    ];
  }

  return tiles;
}

function getEmptyPositions(tiles: Tile[]): Coordinates[] {
  const occupancy = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
  tiles.forEach((tile) => {
    occupancy[tile.row][tile.col] = true;
  });

  const empty: Coordinates[] = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (!occupancy[row][col]) {
        empty.push({ row, col });
      }
    }
  }

  return empty;
}

function addRandomTile(tiles: Tile[], getId: () => number): Tile[] {
  const emptyPositions = getEmptyPositions(tiles);

  if (emptyPositions.length === 0) {
    return tiles;
  }

  const choice = emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
  const value = Math.random() < 0.9 ? 2 : 4;

  return [
    ...tiles.map((tile) => ({ ...tile })),
    {
      id: getId(),
      value,
      row: choice.row,
      col: choice.col,
      isNew: true,
      justMerged: false,
    },
  ];
}

function containsTargetTile(tiles: Tile[], target: number) {
  return tiles.some((tile) => tile.value >= target);
}

function hasAvailableMoves(tiles: Tile[]) {
  if (tiles.length < BOARD_SIZE * BOARD_SIZE) {
    return true;
  }

  const grid = Array.from({ length: BOARD_SIZE }, () => Array<Tile | null>(BOARD_SIZE).fill(null));
  tiles.forEach((tile) => {
    grid[tile.row][tile.col] = tile;
  });

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const tile = grid[row][col];
      if (!tile) {
        continue;
      }

      const right = col + 1 < BOARD_SIZE ? grid[row][col + 1] : null;
      const down = row + 1 < BOARD_SIZE ? grid[row + 1][col] : null;

      if ((right && right.value === tile.value) || (down && down.value === tile.value)) {
        return true;
      }
    }
  }

  return false;
}

function slideRow(
  rowTiles: Tile[],
  row: number,
  direction: 'left' | 'right',
): { tiles: Tile[]; moved: boolean; score: number } {
  const sorted =
    direction === 'left'
      ? [...rowTiles].sort((a, b) => a.col - b.col)
      : [...rowTiles].sort((a, b) => b.col - a.col);

  const result: Tile[] = [];
  let moved = false;
  let score = 0;
  let targetIndex = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const tile = sorted[i];
    tile.justMerged = false;

    const targetCol = direction === 'left' ? targetIndex : BOARD_SIZE - 1 - targetIndex;
    const nextTile = sorted[i + 1];

    if (nextTile && nextTile.value === tile.value) {
      tile.value *= 2;
      tile.justMerged = true;
      score += tile.value;
      i += 1;
      moved = true;
    }

    if (tile.col !== targetCol || tile.row !== row) {
      moved = true;
    }

    tile.col = targetCol;
    tile.row = row;
    result.push(tile);
    targetIndex += 1;
  }

  return { tiles: result, moved, score };
}

function slideColumn(
  columnTiles: Tile[],
  col: number,
  direction: 'up' | 'down',
): { tiles: Tile[]; moved: boolean; score: number } {
  const sorted =
    direction === 'up'
      ? [...columnTiles].sort((a, b) => a.row - b.row)
      : [...columnTiles].sort((a, b) => b.row - a.row);

  const result: Tile[] = [];
  let moved = false;
  let score = 0;
  let targetIndex = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const tile = sorted[i];
    tile.justMerged = false;

    const targetRow = direction === 'up' ? targetIndex : BOARD_SIZE - 1 - targetIndex;
    const nextTile = sorted[i + 1];

    if (nextTile && nextTile.value === tile.value) {
      tile.value *= 2;
      tile.justMerged = true;
      score += tile.value;
      i += 1;
      moved = true;
    }

    if (tile.row !== targetRow || tile.col !== col) {
      moved = true;
    }

    tile.row = targetRow;
    tile.col = col;
    result.push(tile);
    targetIndex += 1;
  }

  return { tiles: result, moved, score };
}

function moveTiles(tiles: Tile[], direction: Direction): MoveResult {
  const clones = tiles.map((tile) => ({
    ...tile,
    isNew: false,
    justMerged: false,
  }));

  const grid = Array.from({ length: BOARD_SIZE }, () => Array<Tile | null>(BOARD_SIZE).fill(null));
  clones.forEach((tile) => {
    grid[tile.row][tile.col] = tile;
  });

  let moved = false;
  let scoreGained = 0;
  const updatedTiles: Tile[] = [];

  if (direction === 'left' || direction === 'right') {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      const rowTiles: Tile[] = [];
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const tile = grid[row][col];
        if (tile) {
          rowTiles.push(tile);
        }
      }

      if (rowTiles.length === 0) {
        continue;
      }

      const { tiles: collapsed, moved: rowMoved, score } = slideRow(rowTiles, row, direction);
      scoreGained += score;
      moved = moved || rowMoved;
      collapsed.forEach((tile) => {
        updatedTiles.push({ ...tile });
      });
    }
  } else {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const columnTiles: Tile[] = [];
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        const tile = grid[row][col];
        if (tile) {
          columnTiles.push(tile);
        }
      }

      if (columnTiles.length === 0) {
        continue;
      }

      const { tiles: collapsed, moved: colMoved, score } = slideColumn(columnTiles, col, direction);
      scoreGained += score;
      moved = moved || colMoved;
      collapsed.forEach((tile) => {
        updatedTiles.push({ ...tile });
      });
    }
  }

  if (!moved) {
    return {
      tiles: tiles.map((tile) => ({ ...tile, isNew: false, justMerged: false })),
      moved: false,
      scoreGained: 0,
    };
  }

  updatedTiles.sort((a, b) => {
    if (a.row !== b.row) {
      return a.row - b.row;
    }
    if (a.col !== b.col) {
      return a.col - b.col;
    }
    return a.id - b.id;
  });

  return {
    tiles: updatedTiles,
    moved: true,
    scoreGained,
  };
}

function getTileColors(value: number) {
  if (TILE_COLORS[value]) {
    return TILE_COLORS[value];
  }
  return { background: '#3c3a32', color: '#f9f6f2' };
}

export default function HomeScreen() {
  const router = useRouter();
  const tileIdRef = useRef(0);
  const getNextTileId = useCallback(() => {
    tileIdRef.current += 1;
    return tileIdRef.current;
  }, []);

  const [tiles, setTiles] = useState<Tile[]>(() => generateInitialTiles(getNextTileId));
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [hasWon, setHasWon] = useState(false);
  const [boardSize, setBoardSize] = useState(0);
  const [menuSelection, setMenuSelection] = useState<MenuSection>('leaderboard');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [sensorData, setSensorData] = useState<SensorVector>({ x: 0, y: 0, z: 0 });
  const [sensorEnabled, setSensorEnabled] = useState(true);
  const [sensorSupported, setSensorSupported] = useState(true);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);
  const lastShakeTimeRef = useRef(0);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const scoreRef = useRef(0);
  const [boardDragging, setBoardDragging] = useState(false);

  const tileSize =
    boardSize > 0
      ? (boardSize - BOARD_PADDING * 2 - CELL_GAP * (BOARD_SIZE - 1)) / BOARD_SIZE
      : 0;

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    let isMounted = true;

    const fetchLeaderboard = async () => {
      try {
        setLeaderboardLoading(true);
        setLeaderboardError(null);

        const response = await fetch('https://jsonplaceholder.typicode.com/users?_limit=6');
        if (!response.ok) {
          throw new Error('Leaderboard request failed');
        }

        type RemoteUser = { id: number; name: string; address: { city: string } };
        const data = (await response.json()) as RemoteUser[];

        if (!isMounted) {
          return;
        }

        const hydrated = data.map((user) => ({
          id: String(user.id),
          name: user.name,
          location: user.address?.city ?? 'Unknown city',
          score: 1800 + user.id * 128,
        }));

        setLeaderboard(hydrated);
      } catch {
        if (isMounted) {
          setLeaderboardError('Unable to reach the community leaderboard right now.');
        }
      } finally {
        if (isMounted) {
          setLeaderboardLoading(false);
        }
      }
    };

    fetchLeaderboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleBoardLayout = useCallback((event: LayoutChangeEvent) => {
    setBoardSize(event.nativeEvent.layout.width);
  }, []);

  const handleNewGame = useCallback(
    (reason: GameResetReason = 'manual') => {
      const previousScore = scoreRef.current;

      setRecentRuns((runs) => {
        if (previousScore <= 0) {
          return runs;
        }

        const nextEntry: RecentRun = {
          id: Date.now(),
          score: previousScore,
          timestamp: new Date().toLocaleTimeString(),
          triggeredBy: reason,
        };

        return [nextEntry, ...runs].slice(0, 5);
      });

      tileIdRef.current = 0;
      setTiles(generateInitialTiles(getNextTileId));
      setScore(0);
      setGameOver(false);
      setHasWon(false);
      if (reason === 'menu') {
        setSystemNotification('Score saved. Fresh board ready!');
      }
    },
    [getNextTileId],
  );

  useEffect(() => {
    let isMounted = true;

    Accelerometer.isAvailableAsync()
      .then((available) => {
        if (!isMounted) {
          return;
        }

        setSensorSupported(available);
        if (!available) {
          setSensorEnabled(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSensorSupported(false);
          setSensorEnabled(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sensorEnabled || !sensorSupported) {
      return undefined;
    }

    Accelerometer.setUpdateInterval(120);
    const subscription = Accelerometer.addListener((vector: SensorVector) => {
      setSensorData(vector);

      const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
      const now = Date.now();

      if (magnitude > SHAKE_THRESHOLD && now - lastShakeTimeRef.current > SHAKE_DEBOUNCE_MS) {
        lastShakeTimeRef.current = now;
        setSystemNotification('Shake detected! Starting a new game.');
        handleNewGame('sensor');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [sensorEnabled, sensorSupported, handleNewGame]);

  useEffect(() => {
    if (!systemNotification) {
      return undefined;
    }

    const timeout = setTimeout(() => setSystemNotification(null), 3500);
    return () => clearTimeout(timeout);
  }, [systemNotification]);

  const handleMove = useCallback(
    (direction: Direction) => {
      if (gameOver) {
        return;
      }

      setTiles((previousTiles) => {
        const { tiles: movedTiles, moved, scoreGained } = moveTiles(previousTiles, direction);

        if (!moved) {
          return previousTiles;
        }

        const withNewTile = addRandomTile(movedTiles, getNextTileId);

        setScore((prevScore) => {
          const nextScore = prevScore + scoreGained;
          setBestScore((prevBest) => Math.max(prevBest, nextScore));
          return nextScore;
        });

        const reached2048 = containsTargetTile(withNewTile, 2048);
        const noMovesLeft = !hasAvailableMoves(withNewTile);

        setHasWon((prevHasWon) => prevHasWon || reached2048);
        setGameOver(noMovesLeft);

        return withNewTile;
      });
    },
    [gameOver, getNextTileId],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const { key } = event;

      if (key.startsWith('Arrow')) {
        event.preventDefault();
      }

      switch (key) {
        case 'ArrowUp':
          handleMove('up');
          break;
        case 'ArrowDown':
          handleMove('down');
          break;
        case 'ArrowLeft':
          handleMove('left');
          break;
        case 'ArrowRight':
          handleMove('right');
          break;
        default:
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleMove]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 12 || Math.abs(gestureState.dy) > 12,
        onPanResponderGrant: () => {
          setBoardDragging(true);
        },
        onPanResponderTerminate: () => {
          setBoardDragging(false);
        },
        onPanResponderRelease: (_, gestureState) => {
          setBoardDragging(false);
          const { dx, dy } = gestureState;
          if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
            return;
          }

          if (Math.abs(dx) > Math.abs(dy)) {
            handleMove(dx > 0 ? 'right' : 'left');
          } else {
            handleMove(dy > 0 ? 'down' : 'up');
          }
        },
      }),
    [handleMove],
  );

  const axisReadings = [
    { label: 'X', value: sensorData.x },
    { label: 'Y', value: sensorData.y },
    { label: 'Z', value: sensorData.z },
  ];

  const formatAxisValue = (value: number) => value.toFixed(2);

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!boardDragging}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            2048
          </ThemedText>
          <View style={styles.scores}>
            <View style={[styles.scoreBox, styles.scoreBoxPrimary]}>
              <ThemedText type="defaultSemiBold" style={styles.scoreLabel}>
                Score
              </ThemedText>
              <ThemedText type="title" style={styles.scoreValue}>
                {score}
              </ThemedText>
            </View>
            <View style={styles.scoreBox}>
              <ThemedText type="defaultSemiBold" style={styles.scoreLabel}>
                Best
              </ThemedText>
              <ThemedText type="title" style={styles.scoreValue}>
                {bestScore}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.button} onPress={() => handleNewGame('manual')}>
            <ThemedText type="defaultSemiBold" style={styles.buttonText}>
              New Game
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.button, styles.secondaryButton, styles.buttonLast]}
            onPress={() => router.push('/modal')}>
            <ThemedText type="defaultSemiBold" style={styles.secondaryButtonText}>
              Strategy
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.statusContainer}>
          {hasWon && (
            <ThemedText type="defaultSemiBold" style={styles.statusText}>
              You reached 2048! Keep going for a higher score.
            </ThemedText>
          )}
          {gameOver && (
            <ThemedText type="defaultSemiBold" style={styles.statusText}>
              No moves left. Start a new game to try again.
            </ThemedText>
          )}
        </View>

        <View
          style={styles.boardContainer}
          onLayout={handleBoardLayout}
          {...panResponder.panHandlers}>
          {tileSize > 0 &&
            Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
              const row = Math.floor(index / BOARD_SIZE);
              const col = index % BOARD_SIZE;

              return (
                <View
                  key={`cell-${row}-${col}`}
                  style={[
                    styles.backgroundCell,
                    {
                      width: tileSize,
                      height: tileSize,
                      top: BOARD_PADDING + row * (tileSize + CELL_GAP),
                      left: BOARD_PADDING + col * (tileSize + CELL_GAP),
                    },
                  ]}
                />
              );
            })}

          {tileSize > 0 &&
            tiles.map((tile) => (
              <TileView
                key={tile.id}
                tile={tile}
                size={tileSize}
                gap={CELL_GAP}
                padding={BOARD_PADDING}
              />
            ))}
        </View>

        <View style={styles.menuContainer}>
          <ThemedText type="defaultSemiBold" style={styles.menuHeading}>
            Control Center
          </ThemedText>
          <FlatList
            data={MENU_ITEMS}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.menuList}
            renderItem={({ item }) => {
              const isAction = item.id === 'strategy';
              const isActive = !isAction && menuSelection === item.id;

              return (
                <Pressable
                  style={[
                    styles.menuCard,
                    isActive && styles.menuCardActive,
                    isAction && styles.menuCardStrategy,
                  ]}
                  onPress={() => {
                    if (isAction) {
                      router.push('/modal');
                      return;
                    }
                    setMenuSelection(item.id as MenuSection);
                  }}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.menuLabel, isAction && styles.menuLabelInverse]}>
                    {item.label}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.menuDescription,
                      isAction && styles.menuDescriptionInverse,
                    ]}>
                    {item.description}
                  </ThemedText>
                </Pressable>
              );
            }}
          />
        </View>

        <View style={styles.cardStack}>
          <View style={[styles.card, menuSelection === 'leaderboard' && styles.cardActive]}>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">Community leaderboard</ThemedText>
              {leaderboardLoading && <ActivityIndicator size="small" color="#8f7a66" />}
            </View>
            {leaderboardError ? (
              <ThemedText style={styles.errorText}>{leaderboardError}</ThemedText>
            ) : (
              <FlatList
                data={leaderboard}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item, index }) => (
                  <View style={styles.leaderboardRow}>
                    <ThemedText style={styles.leaderboardRank}>{index + 1}</ThemedText>
                    <View style={styles.leaderboardInfo}>
                      <ThemedText style={styles.leaderboardName}>{item.name}</ThemedText>
                      <ThemedText style={styles.leaderboardMeta}>{item.location}</ThemedText>
                    </View>
                    <ThemedText style={styles.leaderboardScore}>{item.score}</ThemedText>
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={styles.leaderboardDivider} />}
                ListEmptyComponent={
                  !leaderboardLoading ? (
                    <ThemedText style={styles.helperText}>
                      Leaderboard data will appear once we finish loading the feed.
                    </ThemedText>
                  ) : null
                }
              />
            )}
          </View>

          <View style={[styles.card, menuSelection === 'sensors' && styles.cardActive]}>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">Device motion</ThemedText>
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
              <ThemedText style={styles.helperText}>
                Motion sensors are not available in this environment.
              </ThemedText>
            ) : (
              <View style={styles.sensorGrid}>
                {axisReadings.map((axis) => (
                  <View key={axis.label} style={styles.sensorRow}>
                    <ThemedText style={styles.sensorAxis}>{axis.label}</ThemedText>
                    <ThemedText style={styles.sensorValue}>
                      {formatAxisValue(axis.value)}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
            <ThemedText style={styles.helperText}>
              Shake harder than {SHAKE_THRESHOLD.toFixed(1)}g to auto-start a new game.
            </ThemedText>
            {systemNotification && (
              <View style={styles.sensorBanner}>
                <ThemedText style={styles.sensorStatus}>{systemNotification}</ThemedText>
              </View>
            )}
          </View>

          <View style={[styles.card, menuSelection === 'history' && styles.cardActive]}>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">Recent runs</ThemedText>
              <ThemedText style={styles.cardMeta}>
                {recentRuns.length > 0 ? `Best ${recentRuns[0].score}` : 'Play to log runs'}
              </ThemedText>
            </View>
            <Pressable style={styles.linkButton} onPress={() => handleNewGame('menu')}>
              <ThemedText type="defaultSemiBold" style={styles.linkButtonText}>
                Save score & restart
              </ThemedText>
            </Pressable>
            {recentRuns.length === 0 ? (
              <ThemedText style={styles.helperText}>
                Finish a round or trigger the shake gesture to start building this history.
              </ThemedText>
            ) : (
              <FlatList
                data={recentRuns}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.historyRow}>
                    <View style={styles.historyScoreGroup}>
                      <ThemedText style={styles.historyScore}>{item.score}</ThemedText>
                      <ThemedText style={styles.historyMeta}>
                        {item.timestamp} ·{' '}
                        {item.triggeredBy === 'sensor'
                          ? 'Shake reset'
                          : item.triggeredBy === 'menu'
                            ? 'Menu action'
                            : 'Manual'}
                      </ThemedText>
                    </View>
                    <View style={styles.historyBadge}>
                      <ThemedText style={styles.historyBadgeText}>
                        {item.triggeredBy.toUpperCase()}
                      </ThemedText>
                    </View>
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={styles.historyDivider} />}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 64,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 48,
  },
  scores: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  scoreBox: {
    backgroundColor: '#bbada0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  scoreBoxPrimary: {
    marginRight: 8,
  },
  scoreLabel: {
    color: '#f9f6f2',
    fontSize: 14,
  },
  scoreValue: {
    color: '#f9f6f2',
    fontSize: 24,
    lineHeight: 28,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#8f7a66',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 8,
  },
  buttonLast: {
    marginRight: 0,
  },
  buttonText: {
    color: '#f9f6f2',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8f7a66',
  },
  secondaryButtonText: {
    color: '#8f7a66',
    fontSize: 16,
  },
  statusContainer: {
    minHeight: 24,
    marginBottom: 16,
  },
  statusText: {
    color: '#776e65',
  },
  boardContainer: {
    backgroundColor: '#bbada0',
    padding: BOARD_PADDING,
    borderRadius: 12,
    width: '100%',
    maxWidth: 420,
    aspectRatio: 1,
    position: 'relative',
    alignSelf: 'center',
    overflow: 'hidden',
    marginBottom: 24,
  },
  menuContainer: {
    marginBottom: 16,
  },
  menuHeading: {
    marginBottom: 8,
    color: '#776e65',
  },
  menuList: {
    paddingRight: 16,
  },
  menuCard: {
    backgroundColor: '#f2eadd',
    padding: 12,
    borderRadius: 12,
    marginRight: 12,
    width: 180,
  },
  menuCardActive: {
    borderWidth: 2,
    borderColor: '#8f7a66',
  },
  menuCardStrategy: {
    backgroundColor: '#3c3a32',
  },
  menuLabel: {
    color: '#3c3a32',
    fontSize: 16,
  },
  menuLabelInverse: {
    color: '#f9f6f2',
  },
  menuDescription: {
    color: '#776e65',
    fontSize: 13,
    marginTop: 4,
  },
  menuDescriptionInverse: {
    color: '#f9f6f2',
  },
  cardStack: {
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#fdf8ef',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardActive: {
    borderWidth: 2,
    borderColor: '#8f7a66',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardMeta: {
    color: '#8f7a66',
    fontSize: 13,
  },
  errorText: {
    color: '#b5472b',
  },
  helperText: {
    color: '#8f7a66',
    fontSize: 13,
    marginTop: 8,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  leaderboardRank: {
    width: 28,
    color: '#8f7a66',
    fontWeight: '700',
  },
  leaderboardInfo: {
    flex: 1,
    paddingRight: 12,
  },
  leaderboardName: {
    color: '#3c3a32',
    fontWeight: '600',
  },
  leaderboardMeta: {
    color: '#8f7a66',
    fontSize: 12,
  },
  leaderboardScore: {
    color: '#3c3a32',
    fontWeight: '700',
  },
  leaderboardDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  sensorGrid: {
    marginTop: 4,
  },
  sensorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sensorAxis: {
    color: '#3c3a32',
    fontWeight: '600',
  },
  sensorValue: {
    color: '#3c3a32',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  sensorBanner: {
    marginTop: 12,
    backgroundColor: '#e0f2e7',
    borderRadius: 8,
    padding: 10,
  },
  sensorStatus: {
    color: '#1d6633',
    fontWeight: '600',
  },
  linkButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingVertical: 6,
  },
  linkButtonText: {
    color: '#8f7a66',
    fontSize: 14,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  historyScoreGroup: {
    flex: 1,
    paddingRight: 12,
  },
  historyScore: {
    color: '#3c3a32',
    fontWeight: '700',
    fontSize: 20,
  },
  historyMeta: {
    color: '#8f7a66',
    fontSize: 12,
  },
  historyBadge: {
    backgroundColor: '#eee0c8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  historyBadgeText: {
    color: '#8f7a66',
    fontSize: 12,
    fontWeight: '600',
  },
  historyDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  backgroundCell: {
    position: 'absolute',
    backgroundColor: '#cdc1b4',
    borderRadius: 8,
  },
  tile: {
    position: 'absolute',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  tileText: {
    fontWeight: '700',
    textAlign: 'center',
  },
});

type TileViewProps = {
  tile: Tile;
  size: number;
  gap: number;
  padding: number;
};

function TileView({ tile, size, gap, padding }: TileViewProps) {
  const { background, color } = getTileColors(tile.value);
  const top = padding + tile.row * (size + gap);
  const left = padding + tile.col * (size + gap);

  const EMPHASIS_SCALE = 1.045;
  const scale = useSharedValue(tile.isNew || tile.justMerged ? EMPHASIS_SCALE : 1);

  useEffect(() => {
    if (tile.isNew || tile.justMerged) {
      scale.value = EMPHASIS_SCALE;
    }
    scale.value = withSpring(1, { damping: 14, stiffness: 240 });
  }, [scale, tile.isNew, tile.justMerged]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  let fontSize = 32;
  if (tile.value >= 2048) {
    fontSize = 22;
  } else if (tile.value >= 1024) {
    fontSize = 24;
  } else if (tile.value >= 512) {
    fontSize = 26;
  } else if (tile.value >= 128) {
    fontSize = 28;
  }

  return (
    <Animated.View
      layout={LinearTransition.springify().damping(32).stiffness(160)}
      entering={FadeIn.duration(120)}
      exiting={FadeOut.duration(100)}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          top,
          left,
          backgroundColor: background,
        },
        animatedStyle,
      ]}>
      <ThemedText
        type="title"
        style={[
          styles.tileText,
          {
            color,
            fontSize,
            lineHeight: fontSize * 1.1,
          },
        ]}>
        {tile.value}
      </ThemedText>
    </Animated.View>
  );
}
