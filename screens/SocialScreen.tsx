import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Alert, View, Text, RefreshControl, TextInput, StyleSheet } from 'react-native';
// Gesture-handler's ScrollView rather than the bare react-native one —
// this screen's group rows are wrapped in SwipeableRow (react-native-
// gesture-handler's Swipeable), and a plain ScrollView doesn't
// negotiate cleanly with a nested gesture-handler recognizer on iOS: the
// RefreshControl spinner would render pinned to the very top of the
// screen instead of tracking the scroll, unlike Home/Profile which have
// no gesture-handler children competing for the touch.
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticTouchableOpacity as TouchableOpacity } from '../components/Haptic';
import { Ionicons } from '@expo/vector-icons';
import { useFriends } from '../context/FriendsContext';
import { useGroups } from '../context/GroupsContext';
import FriendSearchRow from '../components/FriendSearchRow';
import GroupDetailModal from '../components/GroupDetailModal';
import GroupActionModal from '../components/GroupActionModal';
import InviteFriendsModal from '../components/InviteFriendsModal';
import PersonalInviteModal from '../components/PersonalInviteModal';
import FriendProfileModal from '../components/FriendProfileModal';
import ChatScreen from '../components/ChatScreen';
import SwipeableRow from '../components/SwipeableRow';
import { colors, radius, shadow, type } from '../theme';
import { useWorkout, XP_PER_WORKOUT } from '../context/WorkoutContext';
import { computeWeeklyXp } from '../data/workout';
import { Friend } from '../types';

const DELETE_COLOR = '#E5484D';
const LEAVE_COLOR = '#E39A2D';

interface Props {
  active?: boolean;
  // A friend/group id to jump straight into, handed down from App.tsx
  // after a push-notification tap (message -> friendId, group_message ->
  // groupId). Null the rest of the time. See onConsumePendingChat.
  pendingChatFriendId?: string | null;
  pendingChatGroupId?: string | null;
  // Called once a pending id above has been acted on (or as soon as we
  // determine it can't be resolved), so App.tsx clears it and a later
  // notification tap for the same friend/group still triggers this again.
  onConsumePendingChat?: () => void;
}

export default function SocialScreen({
  active = true,
  pendingChatFriendId = null,
  pendingChatGroupId = null,
  onConsumePendingChat,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [groupActionVisible, setGroupActionVisible] = useState(false);
  const [personalInviteVisible, setPersonalInviteVisible] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [invitedFriendIds, setInvitedFriendIds] = useState<string[]>([]);
  // Opened directly (skipping FriendProfileModal) for a DM deep link, so
  // a notification tap lands the user straight in the conversation
  // instead of on the friend's profile first.
  const [deepLinkChatFriend, setDeepLinkChatFriend] = useState<Friend | null>(null);
  // Set alongside selectedGroupId only for a group-chat deep link, so
  // GroupDetailModal knows to open on its Chat tab instead of the
  // default Leaderboard tab this one time.
  const [groupDetailInitialTab, setGroupDetailInitialTab] = useState<'leaderboard' | 'chat'>('leaderboard');
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { xp, streakWeek } = useWorkout();
  const { friends, meId, sendFriendRequest, sentRequestUserIds, searchUsers } = useFriends();
  const { groups, isLeader, deleteGroup, leaveGroup, inviteFriendToGroup } = useGroups();
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);

  const friendsWithLiveXp = friends.map((f) => (f.id === meId ? { ...f, xp } : f));
  const myWeeklyXp = computeWeeklyXp(streakWeek, XP_PER_WORKOUT);
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  // Group rosters are fetched separately from the friends list, so "me"
  // there needs the same live-xp overlay applied to the main list above —
  // otherwise a workout just logged wouldn't show up in a group's
  // leaderboard until the next refetch.
  const selectedGroupMembersWithLiveXp = (selectedGroup?.members ?? []).map((m) =>
    m.id === meId ? { ...m, xp } : m
  );
  const selectedGroupWithLiveXp = selectedGroup
    ? { ...selectedGroup, members: selectedGroupMembersWithLiveXp }
    : null;

  const inviteGroup = groups.find((g) => g.id === inviteGroupId) ?? null;
  const inviteCandidates = friends.filter(
    (f) => f.id !== meId && !inviteGroup?.members.some((m) => m.id === f.id)
  );

  const handleInviteFriend = useCallback(
    async (friend: Friend) => {
      if (!inviteGroupId) return;
      const result = await inviteFriendToGroup(inviteGroupId, friend.id);
      if (result.ok) {
        setInvitedFriendIds((prev) => [...prev, friend.id]);
      } else {
        Alert.alert('Could not invite', result.error);
      }
    },
    [inviteGroupId, inviteFriendToGroup]
  );

  const isSearching = query.trim().length > 0;

  const handleSwipeAction = useCallback(
    (groupId: string, groupName: string, leader: boolean) => {
      if (leader) {
        Alert.alert(
          'Delete group?',
          `"${groupName}" will be deleted for everyone. This can't be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteGroup(groupId) },
          ]
        );
      } else {
        Alert.alert('Leave group?', `You'll stop seeing "${groupName}" in your groups.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => leaveGroup(groupId) },
        ]);
      }
    },
    [deleteGroup, leaveGroup]
  );

  // Debounce so we're not firing a query on every keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(async () => {
      const results = await searchUsers(trimmed);
      if (!cancelled) {
        setSearchResults(results);
        setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, searchUsers]);

  useEffect(() => {
    if (active) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [active]);

  // Resolve a pending DM deep link against the (live) friends list once
  // it's available. Friends can arrive a tick after this screen mounts
  // (fetched over the network), so this can't just run once on mount —
  // it re-checks whenever either the id or the list changes.
  useEffect(() => {
    if (!pendingChatFriendId) return;
    const friend = friendsWithLiveXp.find((f) => f.id === pendingChatFriendId);
    if (friend) {
      setDeepLinkChatFriend(friend);
      onConsumePendingChat?.();
    }
    // Note: if the friend never shows up (e.g. unfriended since the
    // notification was sent) this deliberately does nothing further —
    // no dead-end alert, the user just lands on a normal Social tab.
  }, [pendingChatFriendId, friendsWithLiveXp, onConsumePendingChat]);

  // Same idea for a group-chat deep link: open GroupDetailModal on its
  // Chat tab as soon as the target group is in the loaded groups list.
  useEffect(() => {
    if (!pendingChatGroupId) return;
    const group = groups.find((g) => g.id === pendingChatGroupId);
    if (group) {
      setGroupDetailInitialTab('chat');
      setSelectedGroupId(group.id);
      onConsumePendingChat?.();
    }
  }, [pendingChatGroupId, groups, onConsumePendingChat]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.title}>Social</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={[styles.content, { paddingTop: 8 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.iconDark}
            colors={[colors.iconDark]}
          />
        }
      >
      <Text style={styles.subtitle}>Train together and keep each other honest</Text>

      {groups.map((group) => {
        const leader = isLeader(group, meId);
        return (
          <SwipeableRow
            key={group.id}
            style={styles.groupRowWrap}
            actionLabel={leader ? 'Delete' : 'Leave'}
            actionIcon={leader ? 'trash' : 'exit-outline'}
            actionColor={leader ? DELETE_COLOR : LEAVE_COLOR}
            onAction={() => handleSwipeAction(group.id, group.name, leader)}
          >
            <TouchableOpacity
              style={styles.groupCard}
              activeOpacity={0.85}
              onPress={() => setSelectedGroupId(group.id)}
            >
              <View style={styles.groupIcon}>
                {group.avatarUrl ? (
                  <Image
                    source={{ uri: group.avatarUrl }}
                    style={styles.groupIconImage}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Ionicons name="people" size={22} color={colors.iconOnDark} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupMeta}>
                  {group.members.length} {group.members.length === 1 ? 'member' : 'members'} ·{' '}
                  {group.privacy === 'public'
                    ? 'Public'
                    : group.privacy === 'invite_only'
                    ? 'Invite only'
                    : 'Code'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </SwipeableRow>
        );
      })}

      {groups.length === 0 && (
        <View style={styles.emptyWrap}>
          <Ionicons name="people-outline" size={22} color={colors.textTertiary} />
          <Text style={styles.emptyText}>You're not in any groups yet.</Text>
        </View>
      )}

      <TouchableOpacity style={styles.createRow} activeOpacity={0.8} onPress={() => setGroupActionVisible(true)}>
        <View style={styles.createIcon}>
          <Ionicons name="add" size={18} color={colors.iconDark} />
        </View>
        <Text style={styles.createText}>Create or join a group</Text>
      </TouchableOpacity>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={17} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username to add friends"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} hapticStyle="none">
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
        <View style={styles.searchDivider} />
        <TouchableOpacity
          onPress={() => setPersonalInviteVisible(true)}
          hitSlop={8}
          accessibilityLabel="Invite friends"
        >
          <Ionicons name="person-add-outline" size={19} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {isSearching ? (
        <>
          <Text style={styles.sectionTitle}>Add friends</Text>
          {searching ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Searching…</Text>
            </View>
          ) : searchResults.length > 0 ? (
            searchResults.map((user) => (
              <FriendSearchRow
                key={user.id}
                user={user}
                onRequest={sendFriendRequest}
                alreadyRequested={sentRequestUserIds.includes(user.id)}
                onPressProfile={setSelectedFriend}
              />
            ))
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="person-remove-outline" size={22} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No one found for "{query}"</Text>
            </View>
          )}
        </>
      ) : (
        friendsWithLiveXp.length <= 1 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="person-add-outline" size={22} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              You haven't added any friends yet. Search by username above to find people.
            </Text>
          </View>
        )
      )}

      <GroupDetailModal
        visible={!!selectedGroup}
        onClose={() => {
          setSelectedGroupId(null);
          setGroupDetailInitialTab('leaderboard');
        }}
        group={selectedGroupWithLiveXp}
        meId={meId}
        myWeeklyXp={myWeeklyXp}
        onPressFriend={setSelectedFriend}
        isLeader={selectedGroup ? isLeader(selectedGroup, meId) : false}
        onInvitePress={() => {
          if (!selectedGroup) return;
          setInvitedFriendIds([]);
          setInviteGroupId(selectedGroup.id);
        }}
        onGroupDeleted={() => setSelectedGroupId(null)}
        initialTab={groupDetailInitialTab}
      />

      <GroupActionModal visible={groupActionVisible} onClose={() => setGroupActionVisible(false)} />

      <PersonalInviteModal
        visible={personalInviteVisible}
        onClose={() => setPersonalInviteVisible(false)}
        initialTab="share"
      />

      <InviteFriendsModal
        visible={!!inviteGroupId}
        onClose={() => setInviteGroupId(null)}
        groupName={inviteGroup?.name ?? ''}
        candidates={inviteCandidates}
        invitedIds={invitedFriendIds}
        onInvite={handleInviteFriend}
      />

      <FriendProfileModal
        visible={!!selectedFriend}
        onClose={() => setSelectedFriend(null)}
        friend={selectedFriend}
      />

      <ChatScreen
        visible={!!deepLinkChatFriend}
        onClose={() => setDeepLinkChatFriend(null)}
        friend={deepLinkChatFriend}
        onViewProfile={() => {
          const friend = deepLinkChatFriend;
          setDeepLinkChatFriend(null);
          setSelectedFriend(friend);
        }}
      />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  title: {
    fontSize: type.pageTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  groupRowWrap: {
    marginBottom: 12,
    borderRadius: radius.card,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    ...shadow.card,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  groupIconImage: {
    width: '100%',
    height: '100%',
  },
  groupName: {
    fontSize: type.body + 2,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  groupMeta: {
    fontSize: type.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 24,
  },
  createIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  createText: {
    fontSize: type.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.cardSmall,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    height: 46,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.cardBorder,
    marginHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    height: '100%',
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
  sectionTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
});
