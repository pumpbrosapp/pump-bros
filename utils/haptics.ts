import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// expo-haptics isn't supported on web; guard every call so this still runs
// fine there without throwing (mirrors the pattern already used for the
// slide-to-log gesture elsewhere in the app).
const isWeb = Platform.OS === 'web';

// Fire-and-forget light tap for everyday button presses. Wrapped so call
// sites don't need to import expo-haptics directly, and so we can silence
// the (rare) rejection on platforms/simulators without haptics support.
export function tapHaptic() {
  if (isWeb) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// Slightly stronger tap for primary/confirm actions (submit, save, add).
export function confirmHaptic() {
  if (isWeb) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

// Success/error feedback for outcomes (e.g. workout logged, auth succeeded).
export function successHaptic() {
  if (isWeb) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function errorHaptic() {
  if (isWeb) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
