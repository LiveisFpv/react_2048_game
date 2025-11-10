import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
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
import { GameResetReason, useGameContext } from '@/context/game-context';

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
  const tileIdRef = useRef(0);
  const scoreRef = useRef(0);
  const { addRecentRun, registerShakeHandler, notification, setNotification } = useGameContext();

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

  const tileSize =
    boardSize > 0
      ? (boardSize - BOARD_PADDING * 2 - CELL_GAP * (BOARD_SIZE - 1)) / BOARD_SIZE
      : 0;

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const handleBoardLayout = useCallback((event: LayoutChangeEvent) => {
    setBoardSize(event.nativeEvent.layout.width);
  }, []);

  const handleNewGame = useCallback(
    (reason: GameResetReason = 'manual') => {
      addRecentRun(scoreRef.current, reason);
      tileIdRef.current = 0;
      setTiles(generateInitialTiles(getNextTileId));
      setScore(0);
      setGameOver(false);
      setHasWon(false);
      if (reason === 'sensor') {
        setNotification('Shake detected! Starting a new game.');
      }
    },
    [addRecentRun, getNextTileId, setNotification],
  );

  useEffect(
    () =>
      registerShakeHandler(() => {
        handleNewGame('sensor');
      }),
    [handleNewGame, registerShakeHandler],
  );

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
        onPanResponderRelease: (_, gestureState) => {
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

  return (
    <ThemedView style={styles.screen}>
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
      </View>

      {notification && (
        <View style={styles.notificationBanner}>
          <ThemedText style={styles.notificationText}>{notification}</ThemedText>
        </View>
      )}

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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    justifyContent: 'flex-start',
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
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#8f7a66',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#f9f6f2',
    fontSize: 16,
  },
  notificationBanner: {
    backgroundColor: '#e0f2e7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  notificationText: {
    color: '#1d6633',
    fontWeight: '600',
  },
  statusContainer: {
    minHeight: 24,
    marginBottom: 12,
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
  },
  backgroundCell: {
    position: 'absolute',
    backgroundColor: '#cdc1b4',
    borderRadius: 8,
  },
  drawerHint: {
    marginTop: 16,
    textAlign: 'center',
    color: '#776e65',
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
