import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, View, Platform } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { syncNotificationPrefs } from '../lib/pushNotifications';
import { colors, radius, shadow, type } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface NotificationPrefs {
  pushEnabled: boolean;
  friendRequests: boolean;
  messages: boolean;
  groupActivity: boolean;
  workoutReminders: boolean;
  streakReminders: boolean;
  // Index signature so this can be passed straight to
  // syncNotificationPrefs (Record<string, boolean>) without a cast.
  [key: string]: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: true,
  friendRequests: true,
  messages: true,
  groupActivity: true,
  workoutReminders: true,
  streakReminders: true,
};

// Local preference store, keyed per account so signing into a different
// device/account doesn't inherit someone else's settings. Also synced up
// to profiles.notification_prefs in Supabase (see persist() below) so
// the send-push Edge Function — which has no access to this device's
// AsyncStorage — can honor the same toggles when deciding who to push.
const prefsStorageKey = (userId: string) => `gymbro_notification_prefs_${userId}`;
const GUEST_KEY = 'gymbro_notification_prefs_guest';

interface ToggleRow {
  key: keyof Omit<NotificationPrefs, 'pushEnabled'>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}

const TOGGLE_ROWS: ToggleRow[] = [
  {
    key: 'friendRequests',
    icon: 'person-add-outline',
    label: 'Friend requests',
    description: 'When someone sends you a friend request.',
  },
  {
    key: 'messages',
    icon: 'chatbubble-ellipses-outline',
    label: 'Messages',
    description: 'New direct messages from friends.',
  },
  {
    key: 'groupActivity',
    icon: 'people-outline',
    label: 'Group activity',
    description: 'Group chat messages and leaderboard changes.',
  },
  {
    key: 'workoutReminders',
    icon: 'barbell-outline',
    label: 'Workout reminders',
    description: 'Nudges to log a workout on your split days.',
  },
  {
    key: 'streakReminders',
    icon: 'flame-outline',
    label: 'Streak reminders',
    description: "A heads up before you're about to lose your streak.",
  },
];

export default function NotificationSettingsScreen({ visible, onClose }: Props) {
  const { user } = useAuth();
  const storageKey = user ? prefsStorageKey(user.id) : GUEST_KEY;
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoaded(false);
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
          } catch {
            setPrefs(DEFAULT_PREFS);
          }
        } else {
          setPrefs(DEFAULT_PREFS);
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, storageKey]);

  const persist = (next: NotificationPrefs) => {
    setPrefs(next);
    AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
    if (user) {
      syncNotificationPrefs(user.id, next).catch(() => {});
    }
  };

  const handleTogglePush = (value: boolean) => {
    persist({ ...prefs, pushEnabled: value });
  };

  const handleToggleRow = (key: ToggleRow['key'], value: boolean) => {
    persist({ ...prefs, [key]: value });
  };

  const trackColors = { false: colors.ringTrack, true: colors.iconDark };
  const thumbColor = Platform.OS === 'android' ? '#FFFFFF' : undefined;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Notifications</Text>
            <View style={styles.headerBtn} />
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.settingsCard}>
              <View style={[styles.row, styles.rowLast]}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="notifications-outline" size={18} color={colors.iconDark} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowLabel}>Push notifications</Text>
                  <Text style={styles.rowDescription}>Master switch for everything below.</Text>
                </View>
                <Switch
                  value={prefs.pushEnabled}
                  onValueChange={handleTogglePush}
                  trackColor={trackColors}
                  thumbColor={thumbColor}
                  disabled={!loaded}
                />
              </View>
            </View>

            <Text style={styles.sectionTitle}>What you're notified about</Text>
            <View style={styles.settingsCard}>
              {TOGGLE_ROWS.map((row, index) => (
                <View
                  key={row.key}
                  style={[styles.row, index === TOGGLE_ROWS.length - 1 && styles.rowLast]}
                >
                  <View style={styles.rowIconWrap}>
                    <Ionicons name={row.icon} size={18} color={colors.iconDark} />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowDescription}>{row.description}</Text>
                  </View>
                  <Switch
                    value={prefs.pushEnabled && prefs[row.key]}
                    onValueChange={(value) => handleToggleRow(row.key, value)}
                    trackColor={trackColors}
                    thumbColor={thumbColor}
                    disabled={!loaded || !prefs.pushEnabled}
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  settingsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowDescription: {
    fontSize: type.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
});
