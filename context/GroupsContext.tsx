import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group, Friend, GroupPrivacy, PublicGroupSummary } from '../types';
import { generateLocalInviteCode } from '../data/groups';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { reportError } from '../lib/errorReporting';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { useFriends } from './FriendsContext';

// Local-only fallback keyed per user (same pattern as WorkoutContext's xp
// cache) — a shared/global key would leak one account's groups into
// another's on the same device. There's no backend in this mode, so a
// group created here can only ever be "joined" from this same device/
// account; it exists mainly so the create/join flow is fully testable
// without Supabase configured.
const localGroupsKey = (userId: string) => `gymbro_groups_${userId}`;

type CreateResult = { ok: true; inviteCode: string; privacy: GroupPrivacy } | { ok: false; error: string };
type JoinResult = { ok: true } | { ok: false; error: string };

interface GroupsContextValue {
  groups: Group[];
  loading: boolean;
  isLeader: (group: Group, userId: string) => boolean;
  // `privacy` picks how people get in: 'code' (default), 'invite_only',
  // or 'public'. Chosen by the leader in GroupActionModal.
  createGroup: (name: string, privacy?: GroupPrivacy) => Promise<CreateResult>;
  joinGroupByCode: (code: string) => Promise<JoinResult>;
  // Fetches groups with privacy 'public' the caller isn't already in, for
  // the "discover" list in the join flow.
  listPublicGroups: () => Promise<PublicGroupSummary[]>;
  // Joins a 'public' group directly, no code required.
  joinPublicGroup: (groupId: string) => Promise<JoinResult>;
  // Leader-only: adds a friend straight into an 'invite_only' group.
  inviteFriendToGroup: (groupId: string, friendId: string) => Promise<JoinResult>;
  // Leader-only: removes the group for good.
  deleteGroup: (groupId: string) => Promise<void>;
  // Non-leader: removes just this user from the group's roster.
  leaveGroup: (groupId: string) => Promise<void>;
  // Leader-only settings actions, all no-ops (return an error) if the
  // caller isn't actually the group's leader.
  renameGroup: (groupId: string, name: string) => Promise<JoinResult>;
  setGroupPrivacy: (groupId: string, privacy: GroupPrivacy) => Promise<JoinResult>;
  // Leader-only: sets/replaces the group's photo. Caller uploads first
  // (uploadGroupAvatar) and passes the resulting public URL.
  setGroupAvatar: (groupId: string, avatarUrl: string) => Promise<JoinResult>;
  // Mints a fresh invite code, invalidating the old one.
  regenerateInviteCode: (groupId: string) => Promise<{ ok: true; inviteCode: string } | { ok: false; error: string }>;
  // Removes someone other than the leader from the roster.
  removeMember: (groupId: string, memberId: string) => Promise<JoinResult>;
}

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

interface MemberProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  initials: string;
  color: string;
}

function profileRowToFriend(row: MemberProfileRow): Friend {
  return {
    id: row.id,
    name: row.display_name || row.username,
    username: row.username,
    xp: row.xp,
    lastActive: '',
    initials: row.initials || row.username.slice(0, 1).toUpperCase(),
    color: row.color || '#4C8BF5',
    avatarUrl: row.avatar_url,
  };
}

export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { friends, meId } = useFriends();
  const { showToast } = useToast();

  const [groupsLocal, setGroupsLocal] = useState<Group[]>([]);
  const [groupsRemote, setGroupsRemote] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  // ---------------- Local (no-Supabase) fallback ----------------
  useEffect(() => {
    if (isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }
    AsyncStorage.getItem(localGroupsKey(user.id))
      .then((stored) => {
        if (stored) setGroupsLocal(JSON.parse(stored));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const persistLocal = useCallback(
    (next: Group[]) => {
      setGroupsLocal(next);
      if (user) AsyncStorage.setItem(localGroupsKey(user.id), JSON.stringify(next)).catch(() => {});
    },
    [user]
  );

  // ---------------- Supabase-backed ----------------
  const refetchRemoteGroups = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return;
    setLoading(true);

    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from('group_members')
        .select('group_id, groups (id, name, leader_id, invite_code, privacy, avatar_url)')
        .eq('user_id', user.id);

      if (membershipsError || !memberships) {
        // Used to fall through silently here, leaving the screen
        // showing "you're in no groups" with no way to tell that was
        // wrong rather than true.
        reportError(membershipsError ?? new Error('refetchRemoteGroups: no memberships returned'), {
          userId: user.id,
        });
        showToast("Couldn't load your groups — pull to refresh to try again", 'error');
        return;
      }

      const myGroups = memberships
        .map((row: any) => row.groups)
        .filter(
          (
            g: any
          ): g is {
            id: string;
            name: string;
            leader_id: string;
            invite_code: string;
            privacy: GroupPrivacy;
            avatar_url: string | null;
          } => g !== null
        );

      if (myGroups.length === 0) {
        setGroupsRemote([]);
        return;
      }

      const groupIds = myGroups.map((g) => g.id);
      const { data: rosterRows } = await supabase
        .from('group_members')
        .select('group_id, profiles (id, username, display_name, avatar_url, xp, initials, color)')
        .in('group_id', groupIds);

      const membersByGroup = new Map<string, Friend[]>();
      (rosterRows ?? []).forEach((row: any) => {
        if (!row.profiles) return;
        const list = membersByGroup.get(row.group_id) ?? [];
        list.push(profileRowToFriend(row.profiles as MemberProfileRow));
        membersByGroup.set(row.group_id, list);
      });

      // Real "this week" XP per member, one call per group (get_group_weekly_xp
      // is security definer and only returns summed totals for that group's
      // own roster — see schema.sql). Merged onto each Friend's `weeklyXp` so
      // the leaderboard's weekly sort reflects actual logged workouts instead
      // of falling through to estimateWeeklyXp's guess.
      const weeklyXpResults = await Promise.all(
        groupIds.map((gid) => supabase.rpc('get_group_weekly_xp', { gid }))
      );
      const weeklyXpByUser = new Map<string, number>();
      weeklyXpResults.forEach(({ data }) => {
        (data ?? []).forEach((row: { user_id: string; weekly_xp: number }) => {
          weeklyXpByUser.set(row.user_id, row.weekly_xp);
        });
      });

      setGroupsRemote(
        myGroups.map((g) => ({
          id: g.id,
          name: g.name,
          avatarUrl: g.avatar_url,
          leaderId: g.leader_id,
          privacy: g.privacy ?? 'code',
          inviteCode: g.invite_code,
          members: (membersByGroup.get(g.id) ?? []).map((m) => ({
            ...m,
            weeklyXp: weeklyXpByUser.get(m.id) ?? m.weeklyXp,
          })),
        }))
      );
    } catch (err) {
      // A thrown network/parsing error rather than a returned `error`
      // field used to propagate as an unhandled rejection and leave
      // `loading` stuck true — now it's reported and surfaced the same
      // way the membershipsError branch above is.
      reportError(err, { userId: user.id, context: 'refetchRemoteGroups' });
      showToast("Couldn't load your groups — pull to refresh to try again", 'error');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    if (isSupabaseConfigured && user) {
      refetchRemoteGroups();
    } else if (isSupabaseConfigured) {
      setGroupsRemote([]);
      setLoading(false);
    }
  }, [user, refetchRemoteGroups]);

  const groups = isSupabaseConfigured ? groupsRemote : groupsLocal;

  const isLeader = useCallback((group: Group, userId: string) => group.leaderId === userId, []);

  const createGroup = useCallback(
    async (name: string, privacy: GroupPrivacy = 'code'): Promise<CreateResult> => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'Give your group a name.' };

      if (isSupabaseConfigured && user) {
        const { data, error } = await supabase.rpc('create_group', {
          group_name: trimmed,
          group_privacy: privacy,
        });
        if (error || !data || !data[0]) {
          return { ok: false, error: error?.message ?? 'Could not create the group.' };
        }
        await refetchRemoteGroups();
        return { ok: true, inviteCode: data[0].invite_code, privacy: data[0].privacy ?? privacy };
      }

      const me = friends.find((f) => f.id === meId);
      if (!me) return { ok: false, error: 'Could not find your profile.' };
      const inviteCode = generateLocalInviteCode();
      const newGroup: Group = {
        id: `local-${Date.now()}`,
        name: trimmed,
        avatarUrl: null,
        leaderId: meId,
        privacy,
        inviteCode,
        members: [me],
      };
      persistLocal([...groupsLocal, newGroup]);
      return { ok: true, inviteCode, privacy };
    },
    [user, friends, meId, groupsLocal, persistLocal, refetchRemoteGroups]
  );

  const joinGroupByCode = useCallback(
    async (code: string): Promise<JoinResult> => {
      const trimmed = code.trim();
      if (!trimmed) return { ok: false, error: 'Enter an invite code.' };

      if (isSupabaseConfigured && user) {
        const { error } = await supabase.rpc('join_group_by_code', { code: trimmed });
        if (error) {
          return { ok: false, error: 'No group found for that code.' };
        }
        await refetchRemoteGroups();
        return { ok: true };
      }

      // No backend in local mode — the only "joinable" codes are ones
      // created on this same device/account.
      const match = groupsLocal.find(
        (g) => g.privacy === 'code' && g.inviteCode.toUpperCase() === trimmed.toUpperCase()
      );
      if (!match) return { ok: false, error: 'No group found for that code.' };
      if (match.members.some((m) => m.id === meId)) {
        return { ok: false, error: "You're already in that group." };
      }
      const me = friends.find((f) => f.id === meId);
      if (!me) return { ok: false, error: 'Could not find your profile.' };
      persistLocal(
        groupsLocal.map((g) => (g.id === match.id ? { ...g, members: [...g.members, me] } : g))
      );
      return { ok: true };
    },
    [user, groupsLocal, friends, meId, persistLocal, refetchRemoteGroups]
  );

  const listPublicGroups = useCallback(async (): Promise<PublicGroupSummary[]> => {
    if (isSupabaseConfigured && user) {
      const { data, error } = await supabase.rpc('list_public_groups');
      if (error || !data) return [];
      return data.map((row: any) => ({
        id: row.id,
        name: row.name,
        leaderName: row.leader_name,
        memberCount: row.member_count,
      }));
    }

    // Local mode: only groups created on this device can be "discovered".
    return groupsLocal
      .filter((g) => g.privacy === 'public' && !g.members.some((m) => m.id === meId))
      .map((g) => ({
        id: g.id,
        name: g.name,
        leaderName: g.members.find((m) => m.id === g.leaderId)?.name ?? 'Unknown',
        memberCount: g.members.length,
      }));
  }, [user, groupsLocal, meId]);

  const joinPublicGroup = useCallback(
    async (groupId: string): Promise<JoinResult> => {
      if (isSupabaseConfigured && user) {
        const { error } = await supabase.rpc('join_public_group', { gid: groupId });
        if (error) {
          return { ok: false, error: 'Could not join that group.' };
        }
        await refetchRemoteGroups();
        return { ok: true };
      }

      const match = groupsLocal.find((g) => g.id === groupId && g.privacy === 'public');
      if (!match) return { ok: false, error: 'Could not join that group.' };
      if (match.members.some((m) => m.id === meId)) {
        return { ok: false, error: "You're already in that group." };
      }
      const me = friends.find((f) => f.id === meId);
      if (!me) return { ok: false, error: 'Could not find your profile.' };
      persistLocal(
        groupsLocal.map((g) => (g.id === groupId ? { ...g, members: [...g.members, me] } : g))
      );
      return { ok: true };
    },
    [user, groupsLocal, friends, meId, persistLocal, refetchRemoteGroups]
  );

  const inviteFriendToGroup = useCallback(
    async (groupId: string, friendId: string): Promise<JoinResult> => {
      if (isSupabaseConfigured && user) {
        const { error } = await supabase.rpc('invite_to_group', { gid: groupId, p_friend_id: friendId });
        if (error) {
          return { ok: false, error: error.message ?? 'Could not invite that friend.' };
        }
        await refetchRemoteGroups();
        return { ok: true };
      }

      const target = groupsLocal.find((g) => g.id === groupId);
      if (!target || target.leaderId !== meId || target.privacy !== 'invite_only') {
        return { ok: false, error: 'Could not invite that friend.' };
      }
      if (target.members.some((m) => m.id === friendId)) {
        return { ok: false, error: 'Already in the group.' };
      }
      const friend = friends.find((f) => f.id === friendId);
      if (!friend) return { ok: false, error: 'Could not find that friend.' };
      persistLocal(
        groupsLocal.map((g) => (g.id === groupId ? { ...g, members: [...g.members, friend] } : g))
      );
      return { ok: true };
    },
    [user, groupsLocal, friends, meId, persistLocal, refetchRemoteGroups]
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      if (isSupabaseConfigured && user) {
        setGroupsRemote((prev) => prev.filter((g) => g.id !== groupId));
        const { error } = await supabase.from('groups').delete().eq('id', groupId);
        if (error) await refetchRemoteGroups();
        return;
      }
      persistLocal(groupsLocal.filter((g) => g.id !== groupId));
    },
    [user, groupsLocal, persistLocal, refetchRemoteGroups]
  );

  const leaveGroup = useCallback(
    async (groupId: string) => {
      if (isSupabaseConfigured && user) {
        setGroupsRemote((prev) => prev.filter((g) => g.id !== groupId));
        const { error } = await supabase
          .from('group_members')
          .delete()
          .eq('group_id', groupId)
          .eq('user_id', user.id);
        if (error) await refetchRemoteGroups();
        return;
      }
      persistLocal(
        groupsLocal.map((g) => (g.id === groupId ? { ...g, members: g.members.filter((m) => m.id !== meId) } : g))
      );
    },
    [user, groupsLocal, meId, persistLocal, refetchRemoteGroups]
  );

  const renameGroup = useCallback(
    async (groupId: string, name: string): Promise<JoinResult> => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'Give your group a name.' };

      if (isSupabaseConfigured && user) {
        setGroupsRemote((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)));
        const { error } = await supabase
          .from('groups')
          .update({ name: trimmed })
          .eq('id', groupId)
          .eq('leader_id', user.id);
        if (error) {
          await refetchRemoteGroups();
          return { ok: false, error: 'Could not rename the group.' };
        }
        return { ok: true };
      }

      const target = groupsLocal.find((g) => g.id === groupId);
      if (!target || target.leaderId !== meId) return { ok: false, error: 'Only the leader can rename the group.' };
      persistLocal(groupsLocal.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)));
      return { ok: true };
    },
    [user, groupsLocal, meId, persistLocal, refetchRemoteGroups]
  );

  const setGroupPrivacy = useCallback(
    async (groupId: string, privacy: GroupPrivacy): Promise<JoinResult> => {
      if (isSupabaseConfigured && user) {
        setGroupsRemote((prev) => prev.map((g) => (g.id === groupId ? { ...g, privacy } : g)));
        const { error } = await supabase
          .from('groups')
          .update({ privacy })
          .eq('id', groupId)
          .eq('leader_id', user.id);
        if (error) {
          await refetchRemoteGroups();
          return { ok: false, error: 'Could not update who can join.' };
        }
        return { ok: true };
      }

      const target = groupsLocal.find((g) => g.id === groupId);
      if (!target || target.leaderId !== meId) return { ok: false, error: 'Only the leader can change this.' };
      persistLocal(groupsLocal.map((g) => (g.id === groupId ? { ...g, privacy } : g)));
      return { ok: true };
    },
    [user, groupsLocal, meId, persistLocal, refetchRemoteGroups]
  );

  const setGroupAvatar = useCallback(
    async (groupId: string, avatarUrl: string): Promise<JoinResult> => {
      if (isSupabaseConfigured && user) {
        setGroupsRemote((prev) => prev.map((g) => (g.id === groupId ? { ...g, avatarUrl } : g)));
        const { error } = await supabase
          .from('groups')
          .update({ avatar_url: avatarUrl })
          .eq('id', groupId)
          .eq('leader_id', user.id);
        if (error) {
          await refetchRemoteGroups();
          return { ok: false, error: 'Could not update the group photo.' };
        }
        return { ok: true };
      }

      const target = groupsLocal.find((g) => g.id === groupId);
      if (!target || target.leaderId !== meId) return { ok: false, error: 'Only the leader can change this.' };
      persistLocal(groupsLocal.map((g) => (g.id === groupId ? { ...g, avatarUrl } : g)));
      return { ok: true };
    },
    [user, groupsLocal, meId, persistLocal, refetchRemoteGroups]
  );

  const regenerateInviteCode = useCallback(
    async (groupId: string): Promise<{ ok: true; inviteCode: string } | { ok: false; error: string }> => {
      if (isSupabaseConfigured && user) {
        const { data, error } = await supabase.rpc('regenerate_invite_code', { gid: groupId });
        if (error || !data) return { ok: false, error: error?.message ?? 'Could not generate a new code.' };
        setGroupsRemote((prev) => prev.map((g) => (g.id === groupId ? { ...g, inviteCode: data } : g)));
        return { ok: true, inviteCode: data as string };
      }

      const target = groupsLocal.find((g) => g.id === groupId);
      if (!target || target.leaderId !== meId) return { ok: false, error: 'Only the leader can do that.' };
      const inviteCode = generateLocalInviteCode();
      persistLocal(groupsLocal.map((g) => (g.id === groupId ? { ...g, inviteCode } : g)));
      return { ok: true, inviteCode };
    },
    [user, groupsLocal, meId, persistLocal]
  );

  const removeMember = useCallback(
    async (groupId: string, memberId: string): Promise<JoinResult> => {
      if (isSupabaseConfigured && user) {
        setGroupsRemote((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, members: g.members.filter((m) => m.id !== memberId) } : g))
        );
        const { error } = await supabase
          .from('group_members')
          .delete()
          .eq('group_id', groupId)
          .eq('user_id', memberId);
        if (error) {
          await refetchRemoteGroups();
          return { ok: false, error: 'Could not remove that member.' };
        }
        return { ok: true };
      }

      const target = groupsLocal.find((g) => g.id === groupId);
      if (!target || target.leaderId !== meId) return { ok: false, error: 'Only the leader can remove members.' };
      persistLocal(
        groupsLocal.map((g) =>
          g.id === groupId ? { ...g, members: g.members.filter((m) => m.id !== memberId) } : g
        )
      );
      return { ok: true };
    },
    [user, groupsLocal, meId, persistLocal, refetchRemoteGroups]
  );

  const value = useMemo<GroupsContextValue>(
    () => ({
      groups,
      loading,
      isLeader,
      createGroup,
      joinGroupByCode,
      listPublicGroups,
      joinPublicGroup,
      inviteFriendToGroup,
      deleteGroup,
      leaveGroup,
      renameGroup,
      setGroupPrivacy,
      setGroupAvatar,
      regenerateInviteCode,
      removeMember,
    }),
    [
      groups,
      loading,
      isLeader,
      createGroup,
      joinGroupByCode,
      listPublicGroups,
      joinPublicGroup,
      inviteFriendToGroup,
      deleteGroup,
      leaveGroup,
      renameGroup,
      setGroupPrivacy,
      setGroupAvatar,
      regenerateInviteCode,
      removeMember,
    ]
  );

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) {
    throw new Error('useGroups must be used within a GroupsProvider');
  }
  return ctx;
}
