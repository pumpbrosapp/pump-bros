import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, Easing, View, Text, Image, FlatList, RefreshControl, StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentWeekDates } from '../data/workout';
import { useWorkout } from '../context/WorkoutContext';
import { useFriends } from '../context/FriendsContext';
import { useTrainers } from '../context/TrainersContext';
import LeaderboardRow from '../components/LeaderboardRow';
import NotificationsModal from '../components/NotificationsModal';
import FriendProfileModal from '../components/FriendProfileModal';
import ChatScreen from '../components/ChatScreen';
import ChatOverviewModal from '../components/ChatOverviewModal';
import { HapticTouchableOpacity as TouchableOpacity } from '../components/Haptic';
import { colors, radius, shadow, type } from '../theme';
import { Friend } from '../types';
import { useChat } from '../context/ChatContext';

export default function HomeScreen({
  active = true,
  xpModalVisible = false,
}: {
  active?: boolean;
  xpModalVisible?: boolean;
}) {
  const scrollRef = useRef<FlatList<Friend>>(null);
  const { dayStreak, streakWeek, xp } = useWorkout();
  const { friends, meId, incomingRequests, acceptFriendRequest, declineFriendRequest } = useFriends();
  const { visibleTrainers } = useTrainers();
  const { unreadConversations, totalUnreadMessages } = useChat();
  // Keep the leaderboard in sync with the live XP total instead of the
  // static placeholder that used to live on the friends list. AI trainers
  // are folded in alongside real friends so the board is always
  // You + Real Friends + AI Trainers, regardless of how many real friends
  // have been added.
  const friendsWithLiveXp = friends.map((f) => (f.id === meId ? { ...f, xp } : f));
  const sorted = [...friendsWithLiveXp, ...visibleTrainers].sort((a, b) => b.xp - a.xp);
  const weekDates = getCurrentWeekDates(streakWeek);

  const streakScale = useRef(new Animated.Value(1)).current;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    Animated.sequence([
      Animated.spring(streakScale, {
        toValue: 1.35,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.spring(streakScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dayStreak, streakScale]);

  // The XP total updates in context the moment a workout is logged, but the
  // log-workout sheet is still covering the screen at that point. Rather
  // than counting up while it's hidden, we hold the displayed number at the
  // last value the user actually saw and only animate it up to the real
  // total once that sheet has finished closing — so the count-up plays out
  // in full view on the home screen.
  const xpAnim = useRef(new Animated.Value(xp)).current;
  const [displayedXp, setDisplayedXp] = useState(xp);
  const xpScale = useRef(new Animated.Value(1)).current;
  const committedXpRef = useRef(xp);
  const wasXpModalVisibleRef = useRef(xpModalVisible);

  useEffect(() => {
    const id = xpAnim.addListener(({ value }) => setDisplayedXp(Math.round(value)));
    return () => xpAnim.removeListener(id);
  }, [xpAnim]);

  useEffect(() => {
    const wasVisible = wasXpModalVisibleRef.current;
    wasXpModalVisibleRef.current = xpModalVisible;
    const justClosed = wasVisible && !xpModalVisible;

    if (justClosed && xp !== committedXpRef.current) {
      Animated.timing(xpAnim, {
        toValue: xp,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      Animated.sequence([
        Animated.timing(xpScale, {
          toValue: 1.12,
          duration: 220,
          delay: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(xpScale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
      ]).start();
      committedXpRef.current = xp;
    } else if (!xpModalVisible) {
      // Stay in sync for any change that happens while the sheet is closed
      // (e.g. the very first render) without animating.
      committedXpRef.current = xp;
      xpAnim.setValue(xp);
    }
  }, [xp, xpModalVisible, xpAnim, xpScale]);

  useEffect(() => {
    if (active) {
      scrollRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [active]);

  const { width: screenWidth } = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  // Extend the gradient up by the status-bar inset so it reaches the true
  // top edge of the screen instead of stopping where the safe area begins.
  const gradientHeight = 340 + insets.top;

  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const unreadNotificationCount = incomingRequests.length + totalUnreadMessages;

  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const openFriendProfile = (candidate: Friend) => {
    if (candidate.id === meId) return; // tapping your own row does nothing here
    setSelectedFriend(candidate);
  };

  // Opened when tapping a "sent you a message" row in the notifications
  // page — goes straight to the chat rather than the friend's profile.
  const [messageFriend, setMessageFriend] = useState<Friend | null>(null);

  // The chat overview sheet behind Home's message icon — one row per
  // friend with a preview of the latest message, tapping a row opens
  // the same ChatScreen as everywhere else.
  const [chatOverviewVisible, setChatOverviewVisible] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);

  return (
    <View style={styles.container}>
      <Svg
        style={styles.bgGradient}
        width={screenWidth}
        height={gradientHeight}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="bgFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.backgroundGradientTop} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={screenWidth} height={gradientHeight} fill="url(#bgFade)" />
      </Svg>

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.brandRow}>
          <Image
            source={require('../assets/splash-icon.png')}
            style={styles.brandMark}
            resizeMode="contain"
            accessibilityLabel="Pump Bros"
          />
          <Text style={styles.headerTitle}>Pump Bros</Text>
        </View>

        <View style={styles.headerRight}>
          <Animated.View style={[styles.streakBadge, { transform: [{ scale: streakScale }] }]}>
            <Ionicons name="flame" size={14} color="#FF8A3D" />
            <Text style={styles.streakBadgeText}>{dayStreak}</Text>
          </Animated.View>

          <TouchableOpacity
            style={styles.chatButton}
            activeOpacity={0.7}
            onPress={() => setNotificationsVisible(true)}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={18} color={colors.textPrimary} />
            {unreadNotificationCount > 0 && (
              <View style={styles.notificationDot}>
                <Text style={styles.notificationDotText}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.chatButton}
            activeOpacity={0.7}
            onPress={() => setChatOverviewVisible(true)}
            accessibilityLabel="Messages"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textPrimary} />
            {totalUnreadMessages > 0 && (
              <View style={styles.notificationDot}>
                <Text style={styles.notificationDotText}>
                  {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.iconDark}
            colors={[colors.iconDark]}
          />
        }
        data={sorted}
        keyExtractor={(friend) => friend.id}
        renderItem={({ item, index }) => (
          <LeaderboardRow friend={item} rank={index + 1} onPress={openFriendProfile} />
        )}
        ListHeaderComponent={
          <>
            <View style={styles.weekRow}>
              {weekDates.map((item, index) => (
                <View key={index} style={styles.weekCol}>
                  <View
                    style={[
                      styles.weekLetterCircle,
                      item.completed && styles.weekLetterCircleCompleted,
                      item.isToday && !item.completed && styles.weekLetterCircleToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekLetterText,
                        item.completed && styles.weekLetterTextCompleted,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.weekDateText,
                      item.isToday && styles.weekDateTextToday,
                    ]}
                  >
                    {item.date}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.xpCard}>
              <View>
                <Animated.Text style={[styles.xpValue, { transform: [{ scale: xpScale }] }]}>
                  {displayedXp.toLocaleString()}
                </Animated.Text>
                <Text style={styles.xpLabel}>total xp</Text>
              </View>
            </View>

            <View style={styles.leaderboardSection}>
              <Text style={styles.sectionTitle}>Friends</Text>
            </View>
          </>
        }
      />

      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
        requests={incomingRequests}
        onAccept={acceptFriendRequest}
        onDecline={declineFriendRequest}
        messages={unreadConversations}
        onPressMessage={(conversation) => {
          setNotificationsVisible(false);
          setMessageFriend(conversation.friend);
        }}
      />

      <FriendProfileModal
        visible={!!selectedFriend}
        onClose={() => setSelectedFriend(null)}
        friend={selectedFriend}
      />

      <ChatScreen
        visible={!!messageFriend}
        onClose={() => setMessageFriend(null)}
        friend={messageFriend}
        onViewProfile={() => {
          const friend = messageFriend;
          setMessageFriend(null);
          setSelectedFriend(friend);
        }}
      />

      <ChatOverviewModal
        visible={chatOverviewVisible}
        onClose={() => setChatOverviewVisible(false)}
        onSelectFriend={(friend) => {
          setChatOverviewVisible(false);
          setMessageFriend(friend);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  header: {
    paddingBottom: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    marginRight: 8,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: type.pageTitle,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...shadow.card,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  notificationDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#FF4D4F',
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDotText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 12,
  },
  streakBadgeText: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textPrimary,
    marginLeft: 4,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 18,
  },
  weekCol: {
    alignItems: 'center',
  },
  weekLetterCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderStyle: 'dotted',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekLetterCircleCompleted: {
    backgroundColor: colors.iconDark,
    borderColor: colors.iconDark,
    borderStyle: 'solid',
  },
  weekLetterCircleToday: {
    borderColor: colors.textPrimary,
    borderStyle: 'dashed',
    borderWidth: 1.5,
  },
  weekLetterText: {
    fontSize: type.label,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  weekLetterTextCompleted: {
    color: colors.iconOnDark,
  },
  weekDateText: {
    fontSize: type.caption,
    color: colors.textTertiary,
    marginTop: 4,
  },
  weekDateTextToday: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  xpCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginTop: 4,
    ...shadow.card,
  },
  xpLabel: {
    fontSize: type.body,
    color: colors.textSecondary,
    marginTop: 6,
  },
  xpValue: {
    fontSize: type.giant,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  leaderboardSection: {
    paddingTop: 26,
  },
  sectionTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 12,
  },
});
