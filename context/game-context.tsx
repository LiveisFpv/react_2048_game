import { Accelerometer } from 'expo-sensors';
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const SHAKE_THRESHOLD = 1.8;
const SHAKE_DEBOUNCE_MS = 2200;

export type GameResetReason = 'manual' | 'sensor' | 'menu';

export type SensorVector = {
  x: number;
  y: number;
  z: number;
};

export type RecentRun = {
  id: number;
  score: number;
  timestamp: string;
  triggeredBy: GameResetReason;
};

type GameContextValue = {
  recentRuns: RecentRun[];
  addRecentRun: (score: number, reason: GameResetReason) => void;
  sensorSupported: boolean;
  sensorEnabled: boolean;
  setSensorEnabled: (value: boolean) => void;
  sensorData: SensorVector;
  registerShakeHandler: (handler: () => void) => () => void;
  notification: string | null;
  setNotification: (message: string | null) => void;
};

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [sensorSupported, setSensorSupported] = useState(true);
  const [sensorEnabled, setSensorEnabled] = useState(true);
  const [sensorData, setSensorData] = useState<SensorVector>({ x: 0, y: 0, z: 0 });
  const [notification, setNotificationState] = useState<string | null>(null);

  const shakeHandlers = useRef(new Set<() => void>());
  const lastShakeTimeRef = useRef(0);

  const addRecentRun = useCallback((score: number, reason: GameResetReason) => {
    if (score <= 0) {
      return;
    }

    setRecentRuns((runs) => {
      const nextEntry: RecentRun = {
        id: Date.now(),
        score,
        timestamp: new Date().toLocaleString(),
        triggeredBy: reason,
      };

      return [nextEntry, ...runs].slice(0, 10);
    });
  }, []);

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
    if (!sensorSupported || !sensorEnabled) {
      return undefined;
    }

    Accelerometer.setUpdateInterval(120);
    const subscription = Accelerometer.addListener((vector: SensorVector) => {
      setSensorData(vector);
      const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
      const now = Date.now();

      if (magnitude > SHAKE_THRESHOLD && now - lastShakeTimeRef.current > SHAKE_DEBOUNCE_MS) {
        lastShakeTimeRef.current = now;
        shakeHandlers.current.forEach((handler) => handler());
      }
    });

    return () => {
      subscription.remove();
    };
  }, [sensorEnabled, sensorSupported]);

  const registerShakeHandler = useCallback((handler: () => void) => {
    shakeHandlers.current.add(handler);

    return () => {
      shakeHandlers.current.delete(handler);
    };
  }, []);

  const setNotification = useCallback((message: string | null) => {
    setNotificationState(message);
  }, []);

  useEffect(() => {
    if (!notification) {
      return undefined;
    }

    const timeout = setTimeout(() => setNotificationState(null), 3500);
    return () => clearTimeout(timeout);
  }, [notification]);

  const value = useMemo(
    () => ({
      recentRuns,
      addRecentRun,
      sensorSupported,
      sensorEnabled,
      setSensorEnabled,
      sensorData,
      registerShakeHandler,
      notification,
      setNotification,
    }),
    [
      recentRuns,
      addRecentRun,
      sensorSupported,
      sensorEnabled,
      sensorData,
      registerShakeHandler,
      notification,
      setNotification,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
}

export { SHAKE_THRESHOLD };
