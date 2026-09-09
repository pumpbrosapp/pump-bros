import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Friend, FriendRequest, FriendProfileStats } from '../types';
import { CURRENT_USER, discoverableUsers, localInviteCodeForUser } from '../data/friends';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { reportError } from '../lib/errorReporting';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { useUser } from './UserContext';

// Written by the app-level deep-link listener in App.tsx whenever an
// invite link (pumpbros://invite/<CODE>) is opened before there's a
// signed-in session to redeem it against yet (e.g. tapped from the
// onboarding/auth screens while creating a brand-new account). Read
// once here as soon as a user becomes available, so a fresh sign-up
// through someone's invite link ends up friended automatically without
// the person having to re-enter the code by hand.
const PENDING_INVITE_CODE_KEY = 'gymbro_pending_invite_code';

// pumpbros://invite/<CODE> (see app.json's "scheme") — pulls the code
// back out of whatever URL form Linking hands back, tolerating a
// trailing slash or query string.
function parseInviteCodeFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/invite\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

interface FriendsContextValue {
  friends: Friend[];
  meId: string;
  loading: boolean;
  isFriend: (id: string) => boolean;
  removeFriend: (id: string) => Promise<void>;
  // Looks up people to add by name/username, excluding anyone already added.
  searchUsers: (query: string) => Promise<Friend[]>;

  // Invite-a-friend: every account has its own short, shareable code
  // (profiles.invite_code / use_invite_code in schema.sql). Unlike
  // sendFriendRequest, redeeming someone's code friends the two accounts
  // immediately — no accept step, since sharing the code in the first
  // place is the trust signal. Works on someone who's already a Pump
  // Bros user, whether or not you're already friends (a no-op success
  // if you already are).
  myInviteCode: string | null;
  useInviteCode: (code: string) => Promise<{ ok: true; friend: Friend } | { ok: false; error: string }>;

  // Friend requests: sending one no longer adds a friend outright — it
  // shows up as a notification for the other person, who has to accept
  // it first.
  incomingRequests: FriendRequest[];
  sentRequestUserIds: string[];
  sendFriendRequest: (friend: Friend) => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  declineFriendRequest: (requestId: string) => Promise<void>;
  refetchRequests: () => Promise<void>;

  // Extra stats for a friend's profile page (streak, split, xp) — kept out
  // of the main Friend object since the leaderboard/search rows never
  // need this much detail. Returns null in local/demo mode, since there's
  // no backend to read another account's data from.
  fetchFriendProfile: (id: string) => Promise<FriendProfileStats | null>;

  // Blocking: backed by the blocked_users table (blocker_id = signed-in
  // user). Local/demo mode has no second account to sync with, so it
  // just remembers the choice in memory for the session.
  isBlocked: (id: string) => boolean;
  blockUser: (id: string) => Promise<void>;
  unblockUser: (id: string) => Promise<void>;

  // Reporting: backed by the reports table (reporter_id = signed-in
  // user). Local/demo mode has no backend to persist to, so it just
  // resolves successfully without writing anywhere, same as the other
  // no-op fallbacks above.
  reportUser: (
    id: string,
    reason: string,
    content?: { type: 'message' | 'group_message'; id: string }
  ) => Promise<{ ok: boolean; error?: string }>;
}

const FriendsContext = createContext<FriendsContextValue | undefined>(undefined);

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  initials: string;
  color: string;
}

function profileToFriend(row: ProfileRow): Friend {
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

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { avatarUri } = useUser();
  const { showToast } = useToast();
  const [addedFriendsLocal, setAddedFriendsLocal] = useState<Friend[]>([]);
  const [addedFriendsRemote, setAddedFriendsRemote] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);

  // Local (no-Supabase) fallback keeps its own tiny in-memory request
  // list so the UI still works end to end during dev/demo — there's just
  // no second account around to actually deliver the request to.
  const [sentRequestIdsLocal, setSentRequestIdsLocal] = useState<string[]>([]);
  const [incomingRequestsRemote, setIncomingRequestsRemote] = useState<FriendRequest[]>([]);
  const [sentRequestIdsRemote, setSentRequestIdsRemote] = useState<string[]>([]);
  const [blockedIdsLocal, setBlockedIdsLocal] = useState<string[]>([]);
  const [blockedIdsRemote, setBlockedIdsRemote] = useState<string[]>([]);
  const [myInviteCodeRemote, setMyInviteCodeRemote] = useState<string | null>(null);

  const meId = isSupabaseConfigured ? user?.id : CURRENT_USER.id;

  const refetchMyInviteCode = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return;
    const { data, error } = await supabase.rpc('get_my_invite_code');
    if (!error && typeof data === 'string') {
      setMyInviteCodeRemote(data);
    }
  }, [user]);

  const refetchRemoteFriends = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('friendships')
      .select('friend_id, profiles:friend_id (id, username, display_name, avatar_url, xp, initials, color)')
      .eq('user_id', user.id);
    setLoading(false);
    if (error || !data) return;
    const rows = data
      .map((row: any) => row.profiles as ProfileRow | null)
      .filter((row): row is ProfileRow => row !== null);
    setAddedFriendsRemote(rows.map(profileToFriend));
  }, [user]);

  const refetchRequests = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return;

    const [incoming, sent] = await Promise.all([
      supabase
        .from('friend_requests')
        .select('id, created_at, profiles:sender_id (id, username, display_name, avatar_url, xp, initials, color)')
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('friend_requests')
        .select('receiver_id')
        .eq('sender_id', user.id)
        .eq('status', 'pending'),
    ]);

    if (!incoming.error && incoming.data) {
      const requests = incoming.data
        .filter((row: any) => row.profiles)
        .map((row: any) => ({
          id: row.id,
          from: profileToFriend(row.profiles as ProfileRow),
          createdAt: row.created_at,
        }));
      setIncomingRequestsRemote(requests);
    }

    if (!sent.error && sent.data) {
      setSentRequestIdsRemote(sent.data.map((row: any) => row.receiver_id));
    }
  }, [user]);

  const refetchBlocked = useCallback(async () => {
    if (!isSupabaseConfigured || !user) return;
    const { data, error } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', user.id);
    if (!error && data) {
      setBlockedIdsRemote(data.map((row: any) => row.blocked_id));
    }
  }, [user]);

  useEffect(() => {
    if (isSupabaseConfigured && user) {
      refetchRemoteFriends();
      refetchRequests();
      refetchBlocked();
      refetchMyInviteCode();
    } else {
      setAddedFriendsRemote([]);
      setIncomingRequestsRemote([]);
      setSentRequestIdsRemote([]);
      setBlockedIdsRemote([]);
      setMyInviteCodeRemote(null);
    }
  }, [user, refetchRemoteFriends, refetchRequests, refetchBlocked, refetchMyInviteCode]);

  const addedFriends = isSupabaseConfigured ? addedFriendsRemote : addedFriendsLocal;
  const incomingRequests = isSupabaseConfigured ? incomingRequestsRemote : [];
  const sentRequestUserIds = isSupabaseConfigured ? sentRequestIdsRemote : sentRequestIdsLocal;
  const myInviteCode = isSupabaseConfigured ? myInviteCodeRemote : localInviteCodeForUser(meId ?? CURRENT_USER.id);

  const friends = useMemo(() => {
    // The signed-in user's own row needs to reflect whatever picture they
    // just picked in ProfileScreen right away, rather than waiting on a
    // round trip to the backend — so it overrides whatever avatarUrl came
    // back from the profiles table.
    const me: Friend = isSupabaseConfigured && user
      ? {
          ...CURRENT_USER,
          id: user.id,
          name: user.displayName || CURRENT_USER.name,
          username: user.username || CURRENT_USER.username,
          avatarUrl: avatarUri,
        }
      : { ...CURRENT_USER, username: user?.username || CURRENT_USER.username, avatarUrl: avatarUri };
    return [me, ...addedFriends];
  }, [addedFriends, user, avatarUri]);

  const isFriend = useCallback(
    (id: string) => id === meId || addedFriends.some((f) => f.id === id),
    [meId, addedFriends]
  );

  const removeFriend = useCallback(
    async (id: string) => {
      if (isSupabaseConfigured && user) {
        setAddedFriendsRemote((prev) => prev.filter((f) => f.id !== id));
        await supabase.from('friendships').delete().eq('user_id', user.id).eq('friend_id', id);
        return;
      }
      setAddedFriendsLocal((prev) => prev.filter((f) => f.id !== id));
    },
    [user]
  );

  const useInviteCode = useCallback(
    async (code: string): Promise<{ ok: true; friend: Friend } | { ok: false; error: string }> => {
      const trimmed = code.trim();
      if (!trimmed) return { ok: false, error: 'Enter an invite code.' };

      if (isSupabaseConfigured && user) {
        const { data, error } = await supabase.rpc('use_invite_code', { code: trimmed }).maybeSingle();
        if (error || !data) {
          return { ok: false, error: error?.message || 'Invalid invite code.' };
        }
        const friend = profileToFriend(data as ProfileRow);
        setAddedFriendsRemote((prev) => (prev.some((f) => f.id === friend.id) ? prev : [...prev, friend]));
        // The RPC already deletes any pending request between the two
        // server-side — mirror that locally so it doesn't linger in the
        // notifications sheet until the next refetch.
        setIncomingRequestsRemote((prev) => prev.filter((r) => r.from.id !== friend.id));
        setSentRequestIdsRemote((prev) => prev.filter((id) => id !== friend.id));
        return { ok: true, friend };
      }

      // No backend in local/demo mode — the only "redeemable" codes are
      // this device's own (rejected below) and the fixed demo roster's,
      // computed the same deterministic way as myInviteCode above.
      const normalized = trimmed.toUpperCase();
      if (normalized === localInviteCodeForUser(meId ?? CURRENT_USER.id)) {
        return { ok: false, error: 'You cannot use your own invite code.' };
      }
      const match = discoverableUsers.find((candidate) => localInviteCodeForUser(candidate.id) === normalized);
      if (!match) return { ok: false, error: 'Invalid invite code.' };
      if (isFriend(match.id)) return { ok: true, friend: match };
      setAddedFriendsLocal((prev) => [...prev, match]);
      setSentRequestIdsLocal((prev) => prev.filter((id) => id !== match.id));
      return { ok: true, friend: match };
    },
    [user, meId, isFriend]
  );

  // Moved above acceptFriendRequest/sendFriendRequest (both below) since
  // sendFriendRequest needs isBlocked in scope to skip a request to
  // someone the signed-in user has blocked — see the isBlocked check
  // there for the full reasoning.
  const blockedUserIds = isSupabaseConfigured ? blockedIdsRemote : blockedIdsLocal;

  const isBlocked = useCallback((id: string) => blockedUserIds.includes(id), [blockedUserIds]);

  // Accepting has to flip the request's status *and* add the friendship in
  // both directions, which needs elevated privileges (see accept_friend_
  // request in schema.sql) since RLS won't let us insert a friendships row
  // on the sender's behalf. Defined before sendFriendRequest since sending
  // a request when the other person already requested *you* just accepts
  // theirs instead.
  const acceptFriendRequest = useCallback(
    async (requestId: string) => {
      if (!isSupabaseConfigured || !user) return;
      const request = incomingRequestsRemote.find((r) => r.id === requestId);
      // Optimistic: drop it from the inbox and add them as a friend right away.
      setIncomingRequestsRemote((prev) => prev.filter((r) => r.id !== requestId));
      if (request) {
        setAddedFriendsRemote((prev) => (prev.some((f) => f.id === request.from.id) ? prev : [...prev, request.from]));
      }
      const { error } = await supabase.rpc('accept_friend_request', { request_id: requestId });
      if (error) {
        // Reconcile with the server if the RPC failed for any reason.
        await Promise.all([refetchRemoteFriends(), refetchRequests()]);
      }
    },
    [user, incomingRequestsRemote, refetchRemoteFriends, refetchRequests]
  );

  const sendFriendRequest = useCallback(
    async (friend: Friend) => {
      if (isSupabaseConfigured && user) {
        // Blocking is one-directional from the client's point of view —
        // we can only ever see our own block list — so this only catches
        // "I blocked them" before it hits the network, same reasoning as
        // the isBlocked check in ChatScreen. The reverse case ("they
        // blocked me") isn't something the client can know in advance;
        // the insert just fails server-side (RLS on friend_requests) and
        // falls through to the existing revert-on-error handling below.
        if (isBlocked(friend.id)) {
          return;
        }

        // If they already sent *us* a request, sending one back is really
        // just accepting theirs — skip straight to being friends instead
        // of leaving two crossed pending requests around.
        const theirRequest = incomingRequestsRemote.find((r) => r.from.id === friend.id);
        if (theirRequest) {
          await acceptFriendRequest(theirRequest.id);
          return;
        }

        setSentRequestIdsRemote((prev) => (prev.includes(friend.id) ? prev : [...prev, friend.id]));
        const { error } = await supabase
          .from('friend_requests')
          .insert({ sender_id: user.id, receiver_id: friend.id });
        if (error) {
          setSentRequestIdsRemote((prev) => prev.filter((id) => id !== friend.id));
        }
        return;
      }

      // No backend to notify — just remember locally that a request went
      // out so the UI can show "Requested".
      setSentRequestIdsLocal((prev) => (prev.includes(friend.id) ? prev : [...prev, friend.id]));
    },
    [user, incomingRequestsRemote, acceptFriendRequest, isBlocked]
  );

  const declineFriendRequest = useCallback(
    async (requestId: string) => {
      if (!isSupabaseConfigured || !user) return;
      setIncomingRequestsRemote((prev) => prev.filter((r) => r.id !== requestId));
      await supabase.from('friend_requests').delete().eq('id', requestId).eq('receiver_id', user.id);
    },
    [user]
  );

  const fetchFriendProfile = useCallback(async (id: string): Promise<FriendProfileStats | null> => {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('xp, day_streak, streak_week, split_name, split_days')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      xp: data.xp ?? 0,
      dayStreak: data.day_streak ?? 0,
      streakWeek: Array.isArray(data.streak_week) ? data.streak_week : [],
      splitName: data.split_name ?? null,
      splitDays: Array.isArray(data.split_days) && data.split_days.length === 7 ? data.split_days : null,
    };
  }, []);

  const searchUsers = useCallback(
    async (query: string): Promise<Friend[]> => {
      const normalized = query.trim().toLowerCase().replace(/^@/, '');
      if (!normalized) return [];

      if (isSupabaseConfigured && user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, xp, initials, color')
          .or(`username.ilike.%${normalized}%,display_name.ilike.%${normalized}%`)
          .neq('id', user.id)
          .limit(20);
        if (error || !data) return [];
        return (data as ProfileRow[]).map(profileToFriend).filter((f) => !isFriend(f.id));
      }

      return discoverableUsers.filter(
        (candidate) =>
          !isFriend(candidate.id) &&
          (candidate.username.toLowerCase().includes(normalized) || candidate.name.toLowerCase().includes(normalized))
      );
    },
    [user, isFriend]
  );

  const blockUser = useCallback(
    async (id: string) => {
      if (isSupabaseConfigured && user) {
        setBlockedIdsRemote((prev) => (prev.includes(id) ? prev : [...prev, id]));
        const { error } = await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: id });
        if (error) {
          setBlockedIdsRemote((prev) => prev.filter((blockedId) => blockedId !== id));
        }
        return;
      }
      setBlockedIdsLocal((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [user]
  );

  const unblockUser = useCallback(
    async (id: string) => {
      if (isSupabaseConfigured && user) {
        setBlockedIdsRemote((prev) => prev.filter((blockedId) => blockedId !== id));
        const { error } = await supabase.from('blocked_users').delete().eq('blocker_id', user.id).eq('blocked_id', id);
        if (error) {
          setBlockedIdsRemote((prev) => (prev.includes(id) ? prev : [...prev, id]));
        }
        return;
      }
      setBlockedIdsLocal((prev) => prev.filter((blockedId) => blockedId !== id));
    },
    [user]
  );

  const reportUser = useCallback(
    async (id: string, reason: string, content?: { type: 'message' | 'group_message'; id: string }) => {
      if (isSupabaseConfigured && user) {
        const { error } = await supabase.from('reports').insert({
          reporter_id: user.id,
          reported_user_id: id,
          reason,
          // Optional pointer at the specific message being reported —
          // omitted entirely (rather than sent as null) when reporting a
          // profile in general, matching the reports table's polymorphic
          // content_type/content_id pairing.
          ...(content ? { content_type: content.type, content_id: content.id } : {}),
        });
        if (error) {
          return { ok: false, error: error.message };
        }
        return { ok: true };
      }
      // No backend in local/demo mode — nothing to persist to, but the
      // UI can still walk through the full submit flow.
      return { ok: true };
    },
    [user]
  );

  // Deep-link handling for invite-a-friend: a link looks like
  // pumpbros://invite/<CODE>. If someone's already signed in when it's
  // opened — the common "existing user taps a friend's link" case —
  // redeem it right away and say so. `handledUrlRef` guards against
  // acting on the exact same URL twice (Linking can re-deliver the
  // current URL on some transitions).
  const handledUrlRef = useRef<string | null>(null);

  const redeemFromUrl = useCallback(
    async (url: string | null) => {
      if (!url || handledUrlRef.current === url) return;
      const code = parseInviteCodeFromUrl(url);
      if (!code) return;
      handledUrlRef.current = url;
      const result = await useInviteCode(code);
      if (result.ok) {
        showToast(`You're now friends with ${result.friend.name}!`, 'success');
      } else if (result.error && !result.error.toLowerCase().includes('own invite code')) {
        // Swallow the self-invite case silently (easy to trigger by
        // re-opening your own share link) — surface anything else, like
        // a stale/invalid code, since the person explicitly tapped a link.
        showToast(result.error, 'error');
      }
    },
    [useInviteCode, showToast]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;
    Linking.getInitialURL().then(redeemFromUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      redeemFromUrl(url);
    });
    return () => subscription.remove();
  }, [user, redeemFromUrl]);

  // Covers the opposite order: the link was opened while nobody was
  // signed in yet (e.g. it launched onboarding for a brand-new user).
  // App.tsx's top-level listener stashes the code in AsyncStorage in
  // that case; pick it up here the moment a user first becomes
  // available and redeem it quietly — there's no "tap" to react to,
  // just a sign-up that happened to go through someone's link.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const pending = await AsyncStorage.getItem(PENDING_INVITE_CODE_KEY);
        if (!pending || cancelled) return;
        await AsyncStorage.removeItem(PENDING_INVITE_CODE_KEY);
        const result = await useInviteCode(pending);
        if (!cancelled && result.ok) {
          showToast(`You're now friends with ${result.friend.name}!`, 'success');
        }
      } catch (err) {
        reportError(err, { context: 'redeem-pending-invite-code' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only ever fires off of `user` transitioning from signed-out to
    // signed-in — intentionally excludes useInviteCode/showToast from
    // the dep list so it doesn't re-run every time those identities
    // change for unrelated reasons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const value: FriendsContextValue = {
    friends,
    meId: meId ?? CURRENT_USER.id,
    loading,
    isFriend,
    removeFriend,
    searchUsers,
    myInviteCode,
    useInviteCode,
    incomingRequests,
    sentRequestUserIds,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    refetchRequests,
    fetchFriendProfile,
    isBlocked,
    blockUser,
    unblockUser,
    reportUser,
  };

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) {
    throw new Error('useFriends must be used within a FriendsProvider');
  }
  return ctx;
}
