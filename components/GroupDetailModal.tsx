import React, { useEffect, useMemo, useState } from 'react';
import { Modal, FlatList, StyleSheet, Text, View } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LeaderboardRow from './LeaderboardRow';
import GroupChatPanel from './GroupChatPanel';
import GroupSettingsPanel from './GroupSettingsPanel';
import { colors, radius, shadow, type } from '../theme';
import { Group } from '../types';
import { estimateWeeklyXp } from '../utils/leaderboard';

type MainTab = 'leaderboard' | 'chat';
type LeaderboardSort = 'total' | 'weekly';

interface Props {
  visible: boolean;
  onClose: () => void;
  group: Group | null;
  meId: string;
  // Real weekly XP for the signed-in user, computed from their actual
  // logged workouts (see computeWeeklyXp in data/workout.ts) rather than
  // estimated like everyone else's.
  myWeeklyXp: number;
  isLeader: boolean;
  onPressFriend?: (friend: Group['members'][number]) => void;
  // Opens the "invite from friends" flow — only wired up for invite_only
  // groups, either from the leaderboard's leader panel or from Settings.
  onInvitePress: () => void;
  // Called after the leader deletes the group from Settings, so the
  // parent screen can close this modal and drop the selection.
  onGroupDeleted: () => void;
  // Which tab to land on the next time this modal opens — set by a
  // caller that already knows what the user wants to see (e.g. a group
  // chat notification deep link). Only consulted on the visible
  // false->true transition; normal in-modal tab taps aren't affected.
  initialTab?: MainTab;
}

export default function GroupDetailModal({
  visible,
  onClose,
  group,
  meId,
  myWeeklyXp,
  isLeader,
  onPressFriend,
  onInvitePress,
  onGroupDeleted,
  initialTab,
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>('leaderboard');
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>('total');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Land on `initialTab` (e.g. 'chat' for a group-message notification
  // tap) each time the modal is opened, rather than only on first mount
  // — this component stays alive across opens/closes in SocialScreen.
  useEffect(() => {
    if (visible) {
      setSettingsOpen(false);
      setMainTab(initialTab ?? 'leaderboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const friends = group?.members ?? [];
  const privacy = group?.privacy;

  const rankedFriends = useMemo(() => {
    const withWeekly = friends.map((f) => ({
      friend: f,
      weeklyXp: f.id === meId ? myWeeklyXp : estimateWeeklyXp(f),
    }));

    return [...withWeekly].sort((a, b) =>
      leaderboardSort === 'total' ? b.friend.xp - a.friend.xp : b.weeklyXp - a.weeklyXp
    );
  }, [friends, meId, myWeeklyXp, leaderboardSort]);

  const selectTab = (tab: MainTab) => {
    setSettingsOpen(false);
    setMainTab(tab);
  };

  if (!group) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
            </Text>
          </View>
          {isLeader ? (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => setSettingsOpen((prev) => !prev)}
              hitSlop={8}
              hapticStyle="none"
            >
              <Ionicons
                name={settingsOpen ? 'settings' : 'settings-outline'}
                size={22}
                color={settingsOpen ? colors.iconDark : colors.textSecondary}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, !settingsOpen && mainTab === 'leaderboard' && styles.tabBtnActive]}
            activeOpacity={0.85}
            onPress={() => selectTab('leaderboard')}
          >
            <Ionicons
              name="trophy-outline"
              size={15}
              color={!settingsOpen && mainTab === 'leaderboard' ? colors.textPrimary : colors.textSecondary}
              style={styles.tabIcon}
            />
            <Text style={[styles.tabText, !settingsOpen && mainTab === 'leaderboard' && styles.tabTextActive]}>
              Leaderboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, !settingsOpen && mainTab === 'chat' && styles.tabBtnActive]}
            activeOpacity={0.85}
            onPress={() => selectTab('chat')}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={15}
              color={!settingsOpen && mainTab === 'chat' ? colors.textPrimary : colors.textSecondary}
              style={styles.tabIcon}
            />
            <Text style={[styles.tabText, !settingsOpen && mainTab === 'chat' && styles.tabTextActive]}>Chat</Text>
          </TouchableOpacity>
        </View>

        {settingsOpen ? (
          <GroupSettingsPanel group={group} meId={meId} onInvitePress={onInvitePress} onDeleted={onGroupDeleted} />
        ) : mainTab === 'chat' ? (
          <GroupChatPanel
            groupId={group.id}
            groupName={group.name}
            members={friends}
            meId={meId}
            onPressProfile={onPressFriend}
          />
        ) : (
          <>
            {isLeader && privacy === 'invite_only' && (
              <View style={styles.leaderPanel}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderPanelLabel}>Invite only</Text>
                  <Text style={styles.leaderPanelHint}>Add people from your friends list — no self-join.</Text>
                </View>
                <TouchableOpacity style={styles.inviteBtn} activeOpacity={0.85} onPress={onInvitePress} hapticStyle="none">
                  <Ionicons name="person-add" size={15} color={colors.iconOnDark} />
                  <Text style={styles.inviteBtnText}>Invite</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.sortRow}>
              <TouchableOpacity
                style={[styles.sortBtn, leaderboardSort === 'total' && styles.sortBtnActive]}
                activeOpacity={0.85}
                onPress={() => setLeaderboardSort('total')}
              >
                <Text style={[styles.sortText, leaderboardSort === 'total' && styles.sortTextActive]}>Total</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortBtn, leaderboardSort === 'weekly' && styles.sortBtnActive]}
                activeOpacity={0.85}
                onPress={() => setLeaderboardSort('weekly')}
              >
                <Text style={[styles.sortText, leaderboardSort === 'weekly' && styles.sortTextActive]}>
                  This week
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              data={rankedFriends}
              keyExtractor={({ friend }) => friend.id}
              renderItem={({ item: { friend, weeklyXp }, index }) => (
                <LeaderboardRow
                  friend={friend}
                  rank={index + 1}
                  metricXp={leaderboardSort === 'weekly' ? weeklyXp : undefined}
                  metricCaption={leaderboardSort === 'weekly' ? 'this week' : undefined}
                  onPress={friend.id === meId ? undefined : onPressFriend}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="people-outline" size={22} color={colors.textTertiary} />
                  <Text style={styles.emptyText}>No members in this group yet.</Text>
                </View>
              }
            />
          </>
        )}
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
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: type.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },
  leaderPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 12,
    ...shadow.card,
  },
  leaderPanelLabel: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  leaderPanelHint: {
    fontSize: type.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.navActiveBg,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  codeChipText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  inviteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.iconOnDark,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 4,
    backgroundColor: colors.navActiveBg,
    borderRadius: radius.pill,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    marginRight: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.card,
    ...shadow.card,
  },
  tabText: {
    fontSize: type.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  sortRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 12,
    gap: 8,
  },
  sortBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sortBtnActive: {
    backgroundColor: colors.iconDark,
    borderColor: colors.iconDark,
  },
  sortText: {
    fontSize: type.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sortTextActive: {
    color: colors.iconOnDark,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: type.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
