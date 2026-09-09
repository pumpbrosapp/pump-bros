import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  removePushToken,
  checkPushBackendConfigured,
} from '../lib/pushNotifications';
import { reportError } from '../lib/errorReporting';
import { PendingChatTarget, TabName } from '../types';

// Which tab a tapped notification should bring the user to. Landing on
// the Social tab, where both DMs and group chats live, gets the user to
// the right place; which friend/group to open once there is resolved
// below from the notification payload (see send-push/index.ts, which
// attaches fromUserId for DMs/friend activity and groupId for group
// chat) into a PendingChatTarget, since there's no routing/deep-link
// layer to hand a URL to — see App.tsx.
const NOTIFICATION_TAB: Record<string, TabName> = {
  friend_request: 'social',
  friend_accept: 'social',
  message: 'social',
  group_message: 'social',
};

interface PushNotificationsContextValue {
  // Set when the app was opened (or brought forward) by tapping a
  // notification. MainTabs consumes and clears this to jump to the
  // right tab (and, for message/group_message taps, to open the
  // specific conversation); nothing happens if no screen is listening.
  pendingTarget: PendingChatTarget | null;
  clearPendingTarget: () => void;
}

const PushNotificationsContext = createContext<PushNotificationsContextValue>({
  pendingTarget: null,
  clearPendingTarget: () => {},
});

function targetFromNotificationData(
  data: { type?: string; fromUserId?: string; groupId?: string } | undefined
): PendingChatTarget | null {
  const type = data?.type;
  const tab = type ? NOTIFICATION_TAB[type] : undefined;
  if (!tab) return null;

  if (type === 'message' && data?.fromUserId) {
    return { tab, friendId: data.fromUserId };
  }
  if (type === 'group_message' && data?.groupId) {
    return { tab, groupId: data.groupId };
  }
  // friend_request / friend_accept (or a message somehow missing
  // fromUserId) still get you to the Social tab, just not a specific
  // conversation — the notifications sheet there covers the rest.
  return { tab };
}

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [pendingTarget, setPendingTarget] = useState<PendingChatTarget | null>(null);
  const currentTokenRef = useRef<string | null>(null);
  // Only worth checking once per app session — the answer can't change
  // without a developer running the Vault setup and re-signing-in, and
  // this shouldn't turn into a background poll.
  const backendCheckedRef = useRef(false);

  // Register (or clean up) this device's push token whenever who's
  // signed in changes. Deliberately re-runs on every sign-in rather
  // than only once per install, since signing out and into a different
  // account on the same device needs the token to follow the new user.
  useEffect(() => {
    if (!isSupabaseConfigured || !isAuthenticated || !user) return;

    let cancelled = false;

    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (cancelled || !token) return;
      currentTokenRef.current = token;
      await savePushToken(user.id, token);

      if (!backendCheckedRef.current) {
        backendCheckedRef.current = true;
        const configured = await checkPushBackendConfigured();
        if (!cancelled && !configured) {
          // Reported the same way as any other silent failure in this
          // codebase (see registerForPushNotificationsAsync above) —
          // shows up in Sentry if it's configured, console.error if not
          // — rather than a console.warn that's easy to never see.
          reportError(new Error('Push backend not configured (Vault secrets missing)'), {
            context: 'push_backend_not_configured',
            hint: 'See NOTIFICATIONS_SETUP.md step 4 — vault.create_secret calls not run yet.',
          });
        }
      }
    })();

    // Expo can rotate a device's push token; keep Supabase current.
    const refreshSub = Notifications.addPushTokenListener(({ data: token }) => {
      currentTokenRef.current = token;
      savePushToken(user.id, token);
    });

    return () => {
      cancelled = true;
      refreshSub.remove();
    };
  }, [isAuthenticated, user?.id]);

  // Remove this device's token on sign-out so the account that signs
  // in next on the same device doesn't inherit someone else's pushes.
  useEffect(() => {
    if (isAuthenticated) return;
    const token = currentTokenRef.current;
    const previousUserId = user?.id;
    if (token && previousUserId) {
      removePushToken(previousUserId, token);
    }
    currentTokenRef.current = null;
    // Deliberately omits `user` from deps — this should only fire on
    // the isAuthenticated transition, using whatever token/id were
    // current at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Tapping a notification (app backgrounded, or cold-launched from
  // the OS tray) surfaces here so MainTabs can jump to the right tab.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; fromUserId?: string; groupId?: string }
        | undefined;
      const target = targetFromNotificationData(data);
      if (target) setPendingTarget(target);
    });

    // Covers the cold-launch-from-notification case, where the tap
    // happened before this listener was ever attached.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | { type?: string; fromUserId?: string; groupId?: string }
        | undefined;
      const target = targetFromNotificationData(data);
      if (target) setPendingTarget(target);
    });

    return () => sub.remove();
  }, []);

  return (
    <PushNotificationsContext.Provider
      value={{ pendingTarget, clearPendingTarget: () => setPendingTarget(null) }}
    >
      {children}
    </PushNotificationsContext.Provider>
  );
}

export function usePushNotifications() {
  return useContext(PushNotificationsContext);
}
