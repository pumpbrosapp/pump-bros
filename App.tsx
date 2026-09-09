import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from './screens/HomeScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import SocialScreen from './screens/SocialScreen';
import ProfileScreen from './screens/ProfileScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import AuthScreen from './screens/AuthScreen';
import BottomNav from './components/BottomNav';
import LogWorkoutModal from './components/LogWorkoutModal';
import { HapticTouchableOpacity as TouchableOpacity } from './components/Haptic';
import { WorkoutProvider } from './context/WorkoutContext';
import { FriendsProvider } from './context/FriendsContext';
import { TrainersProvider } from './context/TrainersContext';
import { GroupsProvider } from './context/GroupsContext';
import { ChatProvider } from './context/ChatContext';
import { UserProvider } from './context/UserContext';
import { SplitProvider } from './context/SplitContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PushNotificationsProvider, usePushNotifications } from './context/PushNotificationsContext';
import { ToastProvider } from './context/ToastContext';
import { initErrorReporting, ErrorBoundary } from './lib/errorReporting';
import { TabName } from './types';
import { colors, radius, type } from './theme';

// As early as possible — before any component has a chance to throw,
// and before anything else in this file runs. No-ops until a DSN is
// filled in in lib/errorReporting.ts.
initErrorReporting();

// Order must match the tabs rendered left-to-right so swipe position and
// nav-bar selection always agree.
const TAB_ORDER: TabName[] = ['home', 'workout', 'social', 'profile'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Persisted so the intro only ever shows on the very first launch, not
// every time the app is reopened or the JS context reloads.
const ONBOARDING_STORAGE_KEY = 'gymbro_has_onboarded';

// Same key FriendsContext reads from — see the comment there. Written
// here rather than in FriendsContext itself because an invite link
// (pumpbros://invite/<CODE>) can be opened before there's any signed-in
// session for FriendsProvider to even exist yet (mid onboarding, or
// sitting on the sign-up screen for a brand-new install). This top-level
// listener is mounted unconditionally so it can catch that case; once a
// session exists, FriendsContext takes over and redeems the code itself
// (see its own Linking listener, which handles the "already signed in"
// case directly instead of round-tripping through storage).
const PENDING_INVITE_CODE_KEY = 'gymbro_pending_invite_code';

function parseInviteCodeFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/invite\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

function stashPendingInviteCode(url: string | null) {
  const code = parseInviteCodeFromUrl(url);
  if (code) {
    AsyncStorage.setItem(PENDING_INVITE_CODE_KEY, code).catch(() => {});
  }
}

// Keep the native splash screen up past JS load — we manually hide it once
// the onboarding check below resolves, so there's no flash of blank screen
// in between.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((value) => setShowOnboarding(value !== 'true'))
      .catch(() => setShowOnboarding(true))
      .finally(() => {
        setOnboardingChecked(true);
        SplashScreen.hideAsync().catch(() => {});
      });
  }, []);

  // Unconditional (not gated on auth state) so an invite link tapped
  // before sign-up/sign-in still gets captured — see
  // stashPendingInviteCode's comment above for why this lives here
  // rather than only in FriendsContext.
  useEffect(() => {
    Linking.getInitialURL().then(stashPendingInviteCode).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => stashPendingInviteCode(url));
    return () => subscription.remove();
  }, []);

  const handleOnboardingDone = useCallback(() => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true').catch(() => {});
  }, []);

  return (
    // Outermost so it catches a crash anywhere below it, including inside
    // the providers it wraps. CrashFallback below is themed rather than a
    // bare error message, since this is the last line of defense before
    // the user just sees a white/blank screen.
    <ErrorBoundary fallback={(error, retry) => <CrashFallback error={error} onRetry={retry} />}>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <StatusBar style="dark" />

          {/* Sits above everything else that isn't the crash boundary
              itself, so any screen can show a toast — including the
              onboarding/auth flow below, not just the signed-in app. */}
          <ToastProvider>
            {/* SplitProvider lives above the onboarding gate so a split picked
                during the "set your split" onboarding step is already in place
                by the time the user reaches the Profile tab — same context
                instance, no extra plumbing needed to carry it over.

                AuthProvider now also wraps onboarding, since the final
                onboarding step is a real sign-up/sign-in screen and needs
                useAuth() to actually create/verify the account. */}
            <SplitProvider>
              <AuthProvider>
                {!onboardingChecked ? (
                  <View style={styles.container} />
                ) : showOnboarding ? (
                  <OnboardingScreen onDone={handleOnboardingDone} />
                ) : (
                  <AuthGate />
                )}
              </AuthProvider>
            </SplitProvider>
          </ToastProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

// Fallback UI rendered by the top-level ErrorBoundary when something
// throws during render. Deliberately has no dependency on any context
// provider (Auth/Toast/etc.) since one of those could be what crashed.
function CrashFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <SafeAreaView style={[styles.container, styles.crashContainer]}>
      <View style={styles.crashIconWrap}>
        <Ionicons name="warning" size={28} color={colors.iconOnDark} />
      </View>
      <Text style={styles.crashTitle}>Something went wrong</Text>
      <Text style={styles.crashMessage}>
        Pump Bros hit an unexpected error. You can try again, and if it keeps happening, restarting
        the app usually clears it up.
      </Text>
      {__DEV__ && <Text style={styles.crashDetail}>{error.message}</Text>}
      <TouchableOpacity style={styles.crashButton} onPress={onRetry} hapticStyle="confirm">
        <Text style={styles.crashButtonLabel}>Try again</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// The real sign-up/sign-in step lives at the end of OnboardingScreen, so on
// a first-ever launch the user already has a session by the time they get
// here. But onboarding only ever runs once per device — after that this is
// the only gate standing between a logged-out user and the app, so it has
// to check isAuthenticated itself. Otherwise logging out (or a session
// expiring) drops the user straight back into MainTabs in a signed-out
// state instead of back to the sign in / sign up screen.
function AuthGate() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <View style={styles.container} />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <PushNotificationsProvider>
      <UserProvider>
        <WorkoutProvider>
          <FriendsProvider>
            <TrainersProvider>
              <ChatProvider>
                <GroupsProvider>
                  <MainTabs />
                </GroupsProvider>
              </ChatProvider>
            </TrainersProvider>
          </FriendsProvider>
        </WorkoutProvider>
      </UserProvider>
    </PushNotificationsProvider>
  );
}

function MainTabs() {
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [logModalVisible, setLogModalVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const isProgrammaticScroll = useRef(false);
  // While the user has a finger down on the Weekly XP chart (scrubbing or
  // swiping between weeks), the outer tab pager must not also treat that
  // same horizontal drag as a page turn. WorkoutScreen toggles this via
  // onChartTouchStart/End around its own PanResponder's lifecycle.
  const [pagerSwipeEnabled, setPagerSwipeEnabled] = useState(true);
  const { pendingTarget, clearPendingTarget } = usePushNotifications();
  // Which DM/group chat SocialScreen should jump straight into once the
  // Social tab is showing. Handed off separately from pendingTarget
  // (which is cleared as soon as we've read it) since SocialScreen needs
  // its friends/groups lists to finish loading before it can resolve an
  // id to the actual object to open — see its own effect.
  const [pendingChatFriendId, setPendingChatFriendId] = useState<string | null>(null);
  const [pendingChatGroupId, setPendingChatGroupId] = useState<string | null>(null);

  const goToTab = useCallback((tab: TabName) => {
    const index = TAB_ORDER.indexOf(tab);
    isProgrammaticScroll.current = true;
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setActiveTab(tab);
  }, []);

  // Jump to the relevant tab when the app was opened (or brought
  // forward) by tapping a push notification, and hand off which
  // conversation (if any) it pointed at.
  useEffect(() => {
    if (!pendingTarget) return;
    goToTab(pendingTarget.tab);
    if (pendingTarget.friendId) setPendingChatFriendId(pendingTarget.friendId);
    if (pendingTarget.groupId) setPendingChatGroupId(pendingTarget.groupId);
    clearPendingTarget();
  }, [pendingTarget, goToTab, clearPendingTarget]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isProgrammaticScroll.current) {
        isProgrammaticScroll.current = false;
        return;
      }
      const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      const tab = TAB_ORDER[index];
      if (tab && tab !== activeTab) {
        setActiveTab(tab);
      }
    },
    [activeTab]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={pagerSwipeEnabled}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={styles.pager}
      >
        <View style={{ width: SCREEN_WIDTH }}>
          <HomeScreen active={activeTab === 'home'} xpModalVisible={logModalVisible} />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <WorkoutScreen
            active={activeTab === 'workout'}
            onChartTouchStart={() => setPagerSwipeEnabled(false)}
            onChartTouchEnd={() => setPagerSwipeEnabled(true)}
          />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <SocialScreen
            active={activeTab === 'social'}
            pendingChatFriendId={pendingChatFriendId}
            pendingChatGroupId={pendingChatGroupId}
            onConsumePendingChat={() => {
              setPendingChatFriendId(null);
              setPendingChatGroupId(null);
            }}
          />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <ProfileScreen active={activeTab === 'profile'} />
        </View>
      </ScrollView>

      <BottomNav active={activeTab} onChange={goToTab} onAddPress={() => setLogModalVisible(true)} />

      <LogWorkoutModal visible={logModalVisible} onClose={() => setLogModalVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pager: {
    flex: 1,
  },
  crashContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  crashIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.navActive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  crashTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  crashMessage: {
    fontSize: type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  crashDetail: {
    fontSize: type.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 20,
  },
  crashButton: {
    backgroundColor: colors.navActive,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  crashButtonLabel: {
    color: colors.iconOnDark,
    fontSize: type.body,
    fontWeight: '600',
  },
});
