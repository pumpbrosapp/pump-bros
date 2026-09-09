import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow, type } from '../theme';

export type ToastType = 'info' | 'success' | 'error';

interface ToastRequest {
  id: number;
  message: string;
  toastType: ToastType;
  duration: number;
}

interface ToastContextValue {
  // Replaces the silent `.catch(() => {})` / console.error-only failure
  // paths elsewhere in the app with something the user actually sees.
  // Defaults to 'info' and a 2.5s auto-dismiss.
  showToast: (message: string, toastType?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

const DOT_COLOR: Record<ToastType, string> = {
  info: '#6C9BF5',
  success: '#4CAF7D',
  error: '#E4584C',
};

const DEFAULT_DURATION = 2500;
// How long the slide/fade transition itself takes, in and out.
const TRANSITION_MS = 220;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastRequest | null>(null);
  // Toasts requested while one is already showing (or mid-exit-animation)
  // queue up here instead of stepping on the one in progress.
  const queueRef = useRef<ToastRequest[]>([]);
  const nextIdRef = useRef(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const runNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      setCurrent(null);
      return;
    }
    setCurrent(next);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: TRANSITION_MS,
      useNativeDriver: true,
    }).start();

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: TRANSITION_MS,
        useNativeDriver: true,
      }).start(() => runNext());
    }, next.duration);
  }, [progress]);

  const showToast = useCallback(
    (message: string, toastType: ToastType = 'info', duration: number = DEFAULT_DURATION) => {
      const request: ToastRequest = {
        id: nextIdRef.current++,
        message,
        toastType,
        duration,
      };
      queueRef.current.push(request);
      // Only kick off the runner if nothing is showing — otherwise the
      // dismiss timeout above will pick this one up when it's done.
      if (!current) runNext();
    },
    [current, runNext]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            { bottom: insets.bottom + 16, opacity: progress, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.toast}>
            <View style={[styles.dot, { backgroundColor: DOT_COLOR[current.toastType] }]} />
            <Text style={styles.message} numberOfLines={2}>
              {current.message}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    backgroundColor: colors.navActive,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 18,
    ...shadow.nav,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 10,
  },
  message: {
    color: colors.iconOnDark,
    fontSize: type.body,
    flexShrink: 1,
  },
});
