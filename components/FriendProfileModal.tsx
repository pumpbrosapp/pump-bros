import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { Friend, FriendProfileStats } from '../types';
import { colorForLabel } from '../data/splits';
import { useFriends } from '../context/FriendsContext';
import { useTrainers } from '../context/TrainersContext';
import ChatScreen from './ChatScreen';
import ReportUserModal from './ReportUserModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  friend: Friend | null;
}

export default function FriendProfileModal({ visible, onClose, friend }: Props) {
  const { fetchFriendProfile, isFriend, meId, isBlocked, blockUser, unblockUser } = useFriends();
  const { isTrainerId, getTrainerProfileStats, removeTrainer } = useTrainers();
  const [stats, setStats] = useState<FriendProfileStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  const isTrainer = !!friend && isTrainerId(friend.id);

  useEffect(() => {
    if (!visible || !friend) {
      setStats(null);
      setChatVisible(false);
      setReportVisible(false);
      return;
    }

    // AI trainers aren't backed by a real account — their stats are
    // simulated locally, so there's nothing to await.
    if (isTrainerId(friend.id)) {
      setStats(getTrainerProfileStats(friend.id));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchFriendProfile(friend.id).then((result) => {
      if (!cancelled) {
        setStats(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, friend, fetchFriendProfile, isTrainerId, getTrainerProfileStats]);

  if (!friend) return null;

  const handleRemoveTrainer = () => {
    Alert.alert(
      `Remove ${friend.name}?`,
      "They'll disappear from your leaderboard. You can bring them back any time from Manage Trainers.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeTrainer(friend.id);
            onClose();
          },
        },
      ]
    );
  };

  const blocked = isBlocked(friend.id);

  const handleBlock = () => {
    Alert.alert(
      `Block ${friend.name}?`,
      "They won't be able to message you or see your profile. You can unblock them any time.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            blockUser(friend.id);
          },
        },
      ]
    );
  };

  const handleUnblock = () => {
    Alert.alert(`Unblock ${friend.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: () => {
          unblockUser(friend.id);
        },
      },
    ]);
  };

  // Discreet "..." menu in the header — replaces the old full-width
  // Block/Report buttons under the avatar. Order mirrors the message
  // long-press sheet in ChatScreen: destructive/blocking action first,
  // then Report, Cancel always last.
  const handleMoreOptions = () => {
    Alert.alert(friend.name, undefined, [
      blocked
        ? { text: 'Unblock', onPress: handleUnblock }
        : { text: 'Block User', style: 'destructive', onPress: handleBlock },
      { text: 'Report User', onPress: () => setReportVisible(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const xp = stats?.xp ?? friend.xp;
  const dayStreak = stats?.dayStreak;
  const splitDays = stats?.splitDays;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          {/* AI trainers and your own profile have nothing to block or
              report, so the menu button is swapped for a plain spacer
              to keep the back button centered. */}
          {!isTrainer && friend.id !== meId ? (
            <TouchableOpacity style={styles.headerBtn} onPress={handleMoreOptions} hitSlop={8}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroWrap}>
            {friend.avatarUrl ? (
              <Image
                source={{ uri: friend.avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: friend.color }]}>
                <Text style={styles.avatarText}>{friend.initials}</Text>
              </View>
            )}
            <Text style={styles.name}>{friend.name}</Text>
            <Text style={styles.username}>@{friend.username}</Text>

            {/* AI trainers get a Remove Trainer action instead of Chat/Message,
                since there's no one on the other end to message. */}
            {isTrainer ? (
              <TouchableOpacity
                style={styles.removeTrainerButton}
                activeOpacity={0.8}
                onPress={handleRemoveTrainer}
              >
                <Ionicons name="person-remove-outline" size={16} color="#E0483E" />
                <Text style={styles.removeTrainerButtonText}>Remove Trainer</Text>
              </TouchableOpacity>
            ) : (
              // Only friends can be messaged — search results you haven't
              // added yet, and your own profile, don't get this button.
              // Also hidden once blocked (mirrors the Unblock action
              // below) so there's no button that would just fail to
              // send — note `blocked` only ever reflects a block *we*
              // placed; if the other person blocked us instead, the
              // button still shows and the send fails server-side.
              friend.id !== meId &&
              isFriend(friend.id) &&
              !blocked && (
                <TouchableOpacity
                  style={styles.messageButton}
                  activeOpacity={0.8}
                  onPress={() => setChatVisible(true)}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.iconOnDark} />
                  <Text style={styles.messageButtonText}>Message</Text>
                </TouchableOpacity>
              )
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="flame" size={18} color="#FF8A3D" />
              <Text style={styles.statValue}>{loading ? '—' : dayStreak ?? 0}</Text>
              <Text style={styles.statLabel}>Day streak</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="flash" size={18} color={colors.iconDark} />
              <Text style={styles.statValue}>{xp.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total XP</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Workout split</Text>
          {loading ? (
            <View style={styles.splitCard}>
              <Text style={styles.splitEmptyText}>Loading…</Text>
            </View>
          ) : splitDays ? (
            <View style={styles.splitCard}>
              {stats?.splitName ? <Text style={styles.splitName}>{stats.splitName}</Text> : null}
              {splitDays.map((d, i) => (
                <View key={i} style={[styles.splitDayRow, i === splitDays.length - 1 && styles.splitDayRowLast]}>
                  <Text style={styles.splitDayAbbrev}>{d.day}</Text>
                  {d.label ? (
                    <View style={[styles.labelPill, { backgroundColor: `${colorForLabel(d.label)}1A` }]}>
                      <View style={[styles.labelDot, { backgroundColor: colorForLabel(d.label) }]} />
                      <Text style={[styles.labelPillText, { color: colorForLabel(d.label) }]} numberOfLines={1}>
                        {d.label}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.splitDayPlaceholder}>Rest day</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.splitCard}>
              <Text style={styles.splitEmptyText}>No split set yet.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>

      <ChatScreen
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        friend={friend}
        onViewProfile={() => setChatVisible(false)}
      />
      <ReportUserModal visible={reportVisible} onClose={() => setReportVisible(false)} friend={friend} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 48,
  },
  heroWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    ...shadow.card,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 30,
  },
  name: {
    fontSize: type.pageTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  username: {
    fontSize: type.body,
    color: colors.textTertiary,
    marginTop: 2,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 7,
    marginTop: 16,
  },
  messageButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.iconOnDark,
  },
  removeTrainerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(224, 72, 62, 0.12)',
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 7,
    marginTop: 16,
  },
  removeTrainerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E0483E',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 16,
    gap: 4,
    ...shadow.card,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  sectionTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  splitCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    ...shadow.card,
  },
  splitName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  splitEmptyText: {
    fontSize: type.body,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  splitDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  splitDayRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  splitDayAbbrev: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    width: 40,
  },
  splitDayPlaceholder: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  labelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 6,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  labelPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
