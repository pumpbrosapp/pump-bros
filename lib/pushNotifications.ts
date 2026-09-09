// Client-side half of push notifications: asking for permission,
// getting this device's Expo push token, and syncing it (and the
// user's on/off preferences from NotificationSettingsScreen) up to
// Supabase so the send-push Edge Function knows who to notify and how.
//
// Deliberately does nothing in local/demo mode (no Supabase configured)
// — there's no backend to register a token with, same as the rest of
// the app's remote-vs-local split.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { reportError } from './errorReporting';

// Show an alert + play a sound for a notification that arrives while
// the app is already open in the foreground, instead of it silently
// only showing up in the OS tray.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId ??
    undefined
  );
}

// Requests permission (if not already granted/denied) and returns this
// device's Expo push token, or null if the user declined, this is a
// simulator/emulator (push tokens need a real device), or the project
// isn't linked to EAS yet (see NOTIFICATIONS_SETUP.md).
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulators/emulators can't receive real pushes.
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    // Not fatal — the app just can't get a real push token yet. See
    // NOTIFICATIONS_SETUP.md for the `eas init` step that sets this.
    console.warn('[push] No EAS projectId configured; skipping push token fetch.');
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (err) {
    // Was console.warn-only before, so this failed invisibly in
    // production. No toast — there's nothing actionable for the user to
    // do about it, but it should still show up somewhere.
    reportError(err, { context: 'push_token_fetch' });
    return null;
  }
}

// Checks whether the *backend* half of push (the Vault secrets
// notify_push_webhook needs — see NOTIFICATIONS_SETUP.md step 4) is
// actually set up. This is the step that fails silently: everything
// else (permission, token, EAS project) has an obvious symptom when
// it's missing, but a project that skipped the one-time `vault.create_
// secret` calls looks completely healthy — the client registers a
// token fine — and pushes just never arrive, with nothing pointing at
// why. Call this once a token is successfully registered/saved (see
// PushNotificationsContext.tsx) rather than polling it.
export async function checkPushBackendConfigured(): Promise<boolean> {
  if (!isSupabaseConfigured) return true; // nothing to warn about in local/demo mode
  const { data, error } = await supabase.rpc('push_backend_configured');
  if (error) {
    // Treat "can't tell" as "don't nag" — an RPC failure here (stale
    // client against an un-migrated database, a network blip) isn't
    // evidence the Vault secrets are actually missing.
    console.warn('[push] Could not check push backend configuration', error.message);
    return true;
  }
  return Boolean(data);
}

// Upserts this device's token against the signed-in user. Safe to call
// on every app foreground/login — tokens can rotate, and re-saving the
// same one is a no-op thanks to the (user_id, token) primary key.
export async function savePushToken(userId: string, token: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown';
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, platform, updated_at: new Date().toISOString() });
  if (error) {
    console.warn('[push] Failed to save push token', error.message);
  }
}

// Removes this device's token so a signed-out account stops receiving
// pushes meant for whoever signs in next on the same device.
export async function removePushToken(userId: string, token: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token);
  if (error) {
    console.warn('[push] Failed to remove push token', error.message);
  }
}

// Pushes the local NotificationSettingsScreen prefs up to the user's
// profile row, so the send-push Edge Function (which has no access to
// this device's AsyncStorage) can honor the same toggles server-side.
export async function syncNotificationPrefs(
  userId: string,
  prefs: Record<string, boolean>
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs })
    .eq('id', userId);
  if (error) {
    console.warn('[push] Failed to sync notification prefs', error.message);
  }
}
