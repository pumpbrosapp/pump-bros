import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChatMessage, ConversationSummary, GroupMessage, UnreadConversation } from '../types';
import { CURRENT_USER } from '../data/friends';
import { buildConversationSummaries, groupUnreadConversations } from '../data/chat';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { uploadChatImage } from '../utils/chatImageUpload';
import { containsProhibitedLanguage } from '../utils/contentFilter';
import { reportError } from '../lib/errorReporting';
import { useAuth } from './AuthContext';
import { useFriends } from './FriendsContext';

// How many messages a single fetch returns. Long-running conversations
// would otherwise load their entire history — every message, every photo
// URL — just to open the screen. 50 is enough to fill a phone screen a
// couple times over; older messages load on demand as the user scrolls up.
const MESSAGES_PAGE_SIZE = 50;

export interface MessagePage<T> {
  // Oldest first, same ordering the screens already render.
  messages: T[];
  // True if there's earlier history the caller can page in with another
  // fetch, passing the oldest message's createdAt as `before`.
  hasMore: boolean;
}

interface MessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    body: row.body,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
  };
}

interface ChatContextValue {
  meId: string;
  // One page of message history with another person, oldest first. With
  // no `before`, returns the most recent MESSAGES_PAGE_SIZE messages —
  // pass the current oldest message's createdAt as `before` to page in
  // the next batch further back in history.
  fetchMessages: (otherId: string, before?: string) => Promise<MessagePage<ChatMessage>>;
  // Sends a message and returns it (with a real id once the server
  // round-trips it in remote mode, or right away in local/demo mode).
  sendMessage: (otherId: string, body: string) => Promise<ChatMessage | null>;
  // Uploads a locally-picked photo and sends it as a message (optionally
  // with accompanying text), returning it the same way sendMessage does.
  sendImageMessage: (otherId: string, localUri: string, body?: string) => Promise<ChatMessage | null>;
  // Live updates for a conversation. Call the returned function to stop
  // listening (e.g. when ChatScreen unmounts or the modal closes). The
  // optional onDelete fires when the other person deletes one of their
  // own messages, so it can be dropped from the thread here too. The
  // optional onDelivered/onRead fire for a message *we* sent getting its
  // delivered_at/read_at set — i.e. a delivery or read receipt for
  // something in this conversation.
  subscribeToMessages: (
    otherId: string,
    onMessage: (message: ChatMessage) => void,
    onDelete?: (messageId: string) => void,
    onRead?: (messageId: string, readAt: string) => void,
    onDelivered?: (messageId: string, deliveredAt: string) => void
  ) => () => void;
  // `mode: 'everyone'` only succeeds for a message the signed-in user
  // sent (RLS/local storage only ever lets you delete your own) — a real
  // hard delete that removes it for both sides. `mode: 'me'` works on
  // either side's messages and only hides it from the signed-in user's
  // own copy of the thread — the other person still sees it.
  deleteMessage: (otherId: string, messageId: string, mode: 'me' | 'everyone') => Promise<boolean>;
  // Marks every message otherId has sent to the signed-in user as read.
  // Call this when a conversation is actually on screen — no-op in
  // local/demo mode, since there's no second party to have read anything.
  markConversationRead: (otherId: string) => Promise<void>;

  // Tells ChatContext a conversation is actively on screen, so incoming
  // messages from that person don't also pile up as unread notifications
  // while the user is already looking at them, and clears any unread
  // count that person already had. ChatScreen calls this on open/close —
  // nothing else needs to.
  openConversation: (otherId: string) => void;
  closeConversation: () => void;

  // One row per friend with unread messages, newest first — feeds the
  // "Messages" section of the notifications page.
  unreadConversations: UnreadConversation[];
  // Total unread message count, for the notification bell's red dot.
  totalUnreadMessages: number;
  // One row per friend (conversation or not), for the chat overview
  // screen behind Home's message icon. Fetched on demand rather than
  // kept live — the overview is only open for a moment before the user
  // taps into an actual conversation, which already has its own live
  // subscription once opened.
  fetchConversationsOverview: () => Promise<ConversationSummary[]>;

  // ---- Group chat — same shape as the direct-message API above, just
  // keyed by groupId instead of the other person's id. ----
  fetchGroupMessages: (groupId: string, before?: string) => Promise<MessagePage<GroupMessage>>;
  sendGroupMessage: (groupId: string, body: string) => Promise<GroupMessage | null>;
  sendGroupImageMessage: (groupId: string, localUri: string, body?: string) => Promise<GroupMessage | null>;
  subscribeToGroupMessages: (
    groupId: string,
    onMessage: (message: GroupMessage) => void,
    onDelete?: (messageId: string) => void
  ) => () => void;
  // `mode: 'everyone'` only succeeds for a message the signed-in user
  // sent (hard-deletes the row for the whole group, mirrors the old
  // behavior). `mode: 'me'` works on anyone's message and only hides it
  // from the signed-in user's own copy of the thread — everyone else
  // still sees it.
  deleteGroupMessage: (groupId: string, messageId: string, mode: 'me' | 'everyone') => Promise<boolean>;
  // Advances the signed-in user's read cursor for a group to "now". Call
  // this when a group's chat is actually on screen, same spirit as
  // markConversationRead for DMs — no-op in local/demo mode.
  markGroupConversationRead: (groupId: string) => Promise<void>;
  // One read_at timestamp per member who's ever opened this group's
  // chat, keyed by their user id — a member with no entry hasn't read
  // anything yet. Feeds the "Seen by ..." label under the signed-in
  // user's most recent message.
  fetchGroupReadReceipts: (groupId: string) => Promise<Record<string, string>>;
  // Live updates for a group's read receipts — fires with (userId,
  // readAt) whenever any member's cursor advances. Call the returned
  // function to stop listening.
  subscribeToGroupReadReceipts: (
    groupId: string,
    onUpdate: (userId: string, readAt: string) => void
  ) => () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// Local/demo fallback: keeps sent-but-undeliverable messages in memory for
// the life of the app, keyed by the other person's id, so reopening a
// chat still shows what you sent earlier in the session — mirrors how
// FriendsContext's local mode remembers sent friend requests. There's no
// second device to actually deliver to, so no incoming messages (and so
// no unread notifications) ever appear in local mode.
const localConversations = new Map<string, ChatMessage[]>();
let localMessageSeq = 0;

// Same local/demo fallback idea, keyed by groupId instead of the other
// person's id — nothing to actually broadcast to in this mode, so it
// just remembers what the signed-in user posted for the life of the app.
const localGroupConversations = new Map<string, GroupMessage[]>();
let localGroupMessageSeq = 0;

interface GroupMessageRow {
  id: string;
  group_id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
}

function rowToGroupMessage(row: GroupMessageRow): GroupMessage {
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    body: row.body,
    imageUrl: row.image_url,
    createdAt: row.created_at,
  };
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { friends } = useFriends();
  const meId = isSupabaseConfigured ? user?.id ?? CURRENT_USER.id : CURRENT_USER.id;
  const meIdRef = useRef(meId);
  meIdRef.current = meId;

  const friendsRef = useRef(friends);
  friendsRef.current = friends;

  // Which conversation (if any) is currently on screen — read inside the
  // global subscription callback below, so it always sees the latest
  // value without needing to re-subscribe every time it changes.
  const openConversationIdRef = useRef<string | null>(null);

  const [unreadMessages, setUnreadMessages] = useState<ChatMessage[]>([]);

  const fetchMessages = useCallback(
    async (otherId: string, before?: string): Promise<MessagePage<ChatMessage>> => {
      if (isSupabaseConfigured && user) {
        // Goes through the fetch_messages RPC rather than a plain
        // .from('messages').select(...) — it also filters out anything
        // the signed-in user has hidden for themselves (delete-for-me),
        // and that filtering has to happen before the page's LIMIT is
        // applied server-side, or a hidden message partway through a page
        // would just make that page short. Fetches newest-first so the
        // limit gives us the most recent page, then flips it back to
        // oldest-first for rendering; asking for one extra row is a cheap
        // way to know whether there's still more before it.
        const { data, error } = await supabase.rpc('fetch_messages', {
          other_user_id: otherId,
          before_ts: before ?? null,
          page_size: MESSAGES_PAGE_SIZE + 1,
        });
        if (error || !data) return { messages: [], hasMore: false };
        const rows = data as MessageRow[];
        const hasMore = rows.length > MESSAGES_PAGE_SIZE;
        const page = rows.slice(0, MESSAGES_PAGE_SIZE).reverse().map(rowToMessage);

        // These rows are now on the device — mark the ones the other
        // person sent as delivered (covers the case where they were sent
        // while this device was closed, so the inbox subscription below
        // never saw them arrive). Fire-and-forget: delivery status isn't
        // needed to render the page that was just fetched.
        const newlyDeliveredIds = page
          .filter((m) => m.senderId === otherId && !m.deliveredAt)
          .map((m) => m.id);
        if (newlyDeliveredIds.length > 0) {
          supabase.rpc('mark_messages_delivered', { message_ids: newlyDeliveredIds }).then(() => {});
        }

        return { messages: page, hasMore };
      }

      // Local/demo mode conversations only ever hold what's been sent in
      // this app session, so they're never big enough to need paging.
      return { messages: localConversations.get(otherId) ?? [], hasMore: false };
    },
    [user]
  );

  const sendMessage = useCallback(
    async (otherId: string, body: string): Promise<ChatMessage | null> => {
      const trimmed = body.trim();
      if (!trimmed) return null;
      if (containsProhibitedLanguage(trimmed)) return null;

      if (isSupabaseConfigured && user) {
        const { data, error } = await supabase
          .from('messages')
          .insert({ sender_id: user.id, receiver_id: otherId, body: trimmed })
          .select('id, sender_id, receiver_id, body, image_url, created_at, delivered_at, read_at')
          .single();
        if (error || !data) return null;
        return rowToMessage(data as MessageRow);
      }

      const message: ChatMessage = {
        id: `local-${Date.now()}-${localMessageSeq++}`,
        senderId: meIdRef.current ?? CURRENT_USER.id,
        receiverId: otherId,
        body: trimmed,
        createdAt: new Date().toISOString(),
      };
      const existing = localConversations.get(otherId) ?? [];
      localConversations.set(otherId, [...existing, message]);
      return message;
    },
    [user]
  );

  const sendImageMessage = useCallback(
    async (otherId: string, localUri: string, body?: string): Promise<ChatMessage | null> => {
      const trimmed = (body ?? '').trim();
      if (containsProhibitedLanguage(trimmed)) return null;

      if (isSupabaseConfigured && user) {
        // Upload first — the message row is only worth inserting once
        // there's a real, other-device-reachable URL to put in it.
        const imageUrl = await uploadChatImage(user.id, localUri).catch((err) => {
          reportError(err, { userId: user.id, context: 'chat_image_upload', otherId });
          return null;
        });
        if (!imageUrl) return null;

        const { data, error } = await supabase
          .from('messages')
          .insert({ sender_id: user.id, receiver_id: otherId, body: trimmed, image_url: imageUrl })
          .select('id, sender_id, receiver_id, body, image_url, created_at, delivered_at, read_at')
          .single();
        if (error || !data) return null;
        return rowToMessage(data as MessageRow);
      }

      // No backend to upload to (local/demo mode) — the local file:// URI
      // only ever renders on this device, same tradeoff avatarUpload's
      // demo-mode fallback makes.
      const message: ChatMessage = {
        id: `local-${Date.now()}-${localMessageSeq++}`,
        senderId: meIdRef.current ?? CURRENT_USER.id,
        receiverId: otherId,
        body: trimmed,
        imageUrl: localUri,
        createdAt: new Date().toISOString(),
      };
      const existing = localConversations.get(otherId) ?? [];
      localConversations.set(otherId, [...existing, message]);
      return message;
    },
    [user]
  );

  const subscribeToMessages = useCallback(
    (
      otherId: string,
      onMessage: (message: ChatMessage) => void,
      onDelete?: (messageId: string) => void,
      onRead?: (messageId: string, readAt: string) => void,
      onDelivered?: (messageId: string, deliveredAt: string) => void
    ) => {
      if (!isSupabaseConfigured || !user) {
        // Nothing to subscribe to in local mode — messages are added
        // straight to localConversations by sendMessage/the caller.
        return () => {};
      }

      const channel = supabase
        .channel(`messages:${[user.id, otherId].sort().join(':')}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `sender_id=eq.${otherId}`,
          },
          (payload) => {
            const row = payload.new as MessageRow;
            if (row.receiver_id === user.id) {
              onMessage(rowToMessage(row));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages',
            filter: `sender_id=eq.${otherId}`,
          },
          (payload) => {
            // Our own deletes are already dropped from state locally the
            // moment deleteMessage resolves — this only needs to catch
            // the other person deleting one of theirs.
            const row = payload.old as MessageRow;
            if (row.receiver_id === user.id) {
              onDelete?.(row.id);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${otherId}`,
          },
          (payload) => {
            // This fires for any message otherId received — only the
            // ones we sent them are a delivery/read receipt worth
            // surfacing.
            const row = payload.new as MessageRow;
            if (row.sender_id === user.id) {
              if (row.delivered_at) onDelivered?.(row.id, row.delivered_at);
              if (row.read_at) onRead?.(row.id, row.read_at);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    },
    [user]
  );

  const deleteMessage = useCallback(
    async (otherId: string, messageId: string, mode: 'me' | 'everyone'): Promise<boolean> => {
      if (isSupabaseConfigured && user) {
        if (mode === 'everyone') {
          // Unchanged from before: a real hard delete, only ever allowed
          // on a message the caller sent — RLS backs this up too, so the
          // .eq('sender_id', ...) here is belt-and-suspenders.
          const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', messageId)
            .eq('sender_id', user.id);
          return !error;
        }

        // mode === 'me': the row stays exactly as-is for the other
        // person — this just marks it hidden for the signed-in user.
        // ignoreDuplicates so hiding an already-hidden message (e.g. a
        // double-tap) is a no-op instead of a unique-constraint error.
        const { error } = await supabase
          .from('message_hidden')
          .upsert({ message_id: messageId, user_id: user.id }, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
        return !error;
      }

      // Local/demo mode has no other party to preserve the message for —
      // both modes just drop it from the in-memory thread.
      const existing = localConversations.get(otherId) ?? [];
      localConversations.set(
        otherId,
        existing.filter((m) => m.id !== messageId)
      );
      return true;
    },
    [user]
  );

  const markConversationRead = useCallback(
    async (otherId: string): Promise<void> => {
      if (!isSupabaseConfigured || !user) {
        // Local/demo mode has no second party to have "read" anything
        // from — nothing to mark.
        return;
      }
      await supabase.rpc('mark_messages_read', { other_user_id: otherId });
    },
    [user]
  );

  const openConversation = useCallback((otherId: string) => {
    openConversationIdRef.current = otherId;
    // Walking into a chat reads everything in it — drop any unread
    // notifications already queued up for this person.
    setUnreadMessages((prev) => prev.filter((m) => m.senderId !== otherId));
  }, []);

  const closeConversation = useCallback(() => {
    openConversationIdRef.current = null;
  }, []);

  // One always-on subscription (independent of whether a chat screen is
  // open) that watches for any message sent *to* the signed-in user, so
  // the notification bell updates no matter where in the app they are.
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;

    const channel = supabase
      .channel(`inbox:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          // The client has now actually received this row over Realtime —
          // that's delivery, independent of whether the thread happens to
          // be open (read_at is what tracks that). Fire-and-forget: the
          // badge/unread logic below doesn't need to wait on it.
          supabase.rpc('mark_messages_delivered', { message_ids: [row.id] }).then(() => {});
          // Already looking at this conversation — ChatScreen's own
          // subscription is showing it live, no need to also badge it.
          if (row.sender_id === openConversationIdRef.current) return;
          const message = rowToMessage(row);
          setUnreadMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const unreadConversations = useMemo<UnreadConversation[]>(
    () => groupUnreadConversations(unreadMessages, friendsRef.current),
    [unreadMessages]
  );

  const fetchConversationsOverview = useCallback(async (): Promise<ConversationSummary[]> => {
    const currentFriends = friendsRef.current;
    const lastMessageByFriendId = new Map<string, ChatMessage>();

    if (isSupabaseConfigured && user) {
      const { data, error } = await supabase.rpc('fetch_conversations');
      if (!error && data) {
        for (const row of data as MessageRow[]) {
          const otherId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
          lastMessageByFriendId.set(otherId, rowToMessage(row));
        }
      }
    } else {
      // Local/demo mode: every friend's conversation (if any) lives in
      // localConversations, already ordered oldest-to-newest.
      for (const friend of currentFriends) {
        const msgs = localConversations.get(friend.id);
        if (msgs && msgs.length > 0) {
          lastMessageByFriendId.set(friend.id, msgs[msgs.length - 1]);
        }
      }
    }

    return buildConversationSummaries(currentFriends, lastMessageByFriendId, unreadMessages);
  }, [user, unreadMessages]);

  const fetchGroupMessages = useCallback(
    async (groupId: string, before?: string): Promise<MessagePage<GroupMessage>> => {
      if (isSupabaseConfigured && user) {
        // Goes through the fetch_group_messages RPC rather than a plain
        // .from('group_messages').select(...) — it also filters out
        // anything the signed-in user has hidden for themselves
        // (delete-for-me), and that filtering has to happen before the
        // page's LIMIT is applied server-side, or a hidden message
        // partway through a page would just make that page short.
        const { data, error } = await supabase.rpc('fetch_group_messages', {
          gid: groupId,
          before_ts: before ?? null,
          page_size: MESSAGES_PAGE_SIZE + 1,
        });
        if (error || !data) return { messages: [], hasMore: false };
        const rows = data as GroupMessageRow[];
        const hasMore = rows.length > MESSAGES_PAGE_SIZE;
        const page = rows.slice(0, MESSAGES_PAGE_SIZE).reverse().map(rowToGroupMessage);
        return { messages: page, hasMore };
      }

      return { messages: localGroupConversations.get(groupId) ?? [], hasMore: false };
    },
    [user]
  );

  const sendGroupMessage = useCallback(
    async (groupId: string, body: string): Promise<GroupMessage | null> => {
      const trimmed = body.trim();
      if (!trimmed) return null;
      if (containsProhibitedLanguage(trimmed)) return null;

      if (isSupabaseConfigured && user) {
        const { data, error } = await supabase
          .from('group_messages')
          .insert({ group_id: groupId, sender_id: user.id, body: trimmed })
          .select('id, group_id, sender_id, body, image_url, created_at')
          .single();
        if (error || !data) return null;
        return rowToGroupMessage(data as GroupMessageRow);
      }

      const message: GroupMessage = {
        id: `local-${Date.now()}-${localGroupMessageSeq++}`,
        groupId,
        senderId: meIdRef.current ?? CURRENT_USER.id,
        body: trimmed,
        createdAt: new Date().toISOString(),
      };
      const existing = localGroupConversations.get(groupId) ?? [];
      localGroupConversations.set(groupId, [...existing, message]);
      return message;
    },
    [user]
  );

  const sendGroupImageMessage = useCallback(
    async (groupId: string, localUri: string, body?: string): Promise<GroupMessage | null> => {
      const trimmed = (body ?? '').trim();
      if (containsProhibitedLanguage(trimmed)) return null;

      if (isSupabaseConfigured && user) {
        const imageUrl = await uploadChatImage(user.id, localUri).catch((err) => {
          reportError(err, { userId: user.id, context: 'group_chat_image_upload', groupId });
          return null;
        });
        if (!imageUrl) return null;

        const { data, error } = await supabase
          .from('group_messages')
          .insert({ group_id: groupId, sender_id: user.id, body: trimmed, image_url: imageUrl })
          .select('id, group_id, sender_id, body, image_url, created_at')
          .single();
        if (error || !data) return null;
        return rowToGroupMessage(data as GroupMessageRow);
      }

      const message: GroupMessage = {
        id: `local-${Date.now()}-${localGroupMessageSeq++}`,
        groupId,
        senderId: meIdRef.current ?? CURRENT_USER.id,
        body: trimmed,
        imageUrl: localUri,
        createdAt: new Date().toISOString(),
      };
      const existing = localGroupConversations.get(groupId) ?? [];
      localGroupConversations.set(groupId, [...existing, message]);
      return message;
    },
    [user]
  );

  const subscribeToGroupMessages = useCallback(
    (groupId: string, onMessage: (message: GroupMessage) => void, onDelete?: (messageId: string) => void) => {
      if (!isSupabaseConfigured || !user) {
        return () => {};
      }

      const channel = supabase
        .channel(`group_messages:${groupId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            const row = payload.new as GroupMessageRow;
            // Our own sends are already appended locally the moment
            // sendGroupMessage resolves — skip the echo from Postgres so
            // it doesn't render twice.
            if (row.sender_id === user.id) return;
            onMessage(rowToGroupMessage(row));
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'group_messages',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            // Same reasoning as INSERT above — our own deletes are
            // already dropped from state locally.
            const row = payload.old as GroupMessageRow;
            if (row.sender_id === user.id) return;
            onDelete?.(row.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    },
    [user]
  );

  const deleteGroupMessage = useCallback(
    async (groupId: string, messageId: string, mode: 'me' | 'everyone'): Promise<boolean> => {
      if (isSupabaseConfigured && user) {
        if (mode === 'everyone') {
          // Unchanged from before: a real hard delete, only ever allowed
          // on a message the caller sent — RLS backs this up too, so the
          // .eq('sender_id', ...) here is belt-and-suspenders.
          const { error } = await supabase
            .from('group_messages')
            .delete()
            .eq('id', messageId)
            .eq('sender_id', user.id);
          return !error;
        }

        // mode === 'me': the row stays exactly as-is for every other
        // member — this just marks it hidden for the signed-in user.
        // ignoreDuplicates so hiding an already-hidden message (e.g. a
        // double-tap) is a no-op instead of a unique-constraint error.
        const { error } = await supabase
          .from('group_message_hidden')
          .upsert({ message_id: messageId, user_id: user.id }, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
        return !error;
      }

      // Local/demo mode has no other members to preserve the message
      // for — both modes just drop it from the in-memory thread.
      const existing = localGroupConversations.get(groupId) ?? [];
      localGroupConversations.set(
        groupId,
        existing.filter((m) => m.id !== messageId)
      );
      return true;
    },
    [user]
  );

  const markGroupConversationRead = useCallback(
    async (groupId: string): Promise<void> => {
      if (!isSupabaseConfigured || !user) {
        // Local/demo mode has no other members to have "read" anything
        // from — nothing to mark, same as markConversationRead for DMs.
        return;
      }
      await supabase.rpc('mark_group_messages_read', { gid: groupId });
    },
    [user]
  );

  const fetchGroupReadReceipts = useCallback(
    async (groupId: string): Promise<Record<string, string>> => {
      if (!isSupabaseConfigured || !user) return {};
      const { data, error } = await supabase
        .from('group_message_reads')
        .select('user_id, read_at')
        .eq('group_id', groupId);
      if (error || !data) return {};
      const receipts: Record<string, string> = {};
      for (const row of data as { user_id: string; read_at: string }[]) {
        receipts[row.user_id] = row.read_at;
      }
      return receipts;
    },
    [user]
  );

  const subscribeToGroupReadReceipts = useCallback(
    (groupId: string, onUpdate: (userId: string, readAt: string) => void) => {
      if (!isSupabaseConfigured || !user) {
        return () => {};
      }

      // INSERT covers a member's first-ever open of this group's chat;
      // UPDATE covers every read after that (mark_group_messages_read
      // upserts, so a returning member's cursor moves via UPDATE).
      const channel = supabase
        .channel(`group_reads:${groupId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'group_message_reads', filter: `group_id=eq.${groupId}` },
          (payload) => {
            const row = payload.new as { user_id: string; read_at: string };
            onUpdate(row.user_id, row.read_at);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'group_message_reads', filter: `group_id=eq.${groupId}` },
          (payload) => {
            const row = payload.new as { user_id: string; read_at: string };
            onUpdate(row.user_id, row.read_at);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    },
    [user]
  );

  const value: ChatContextValue = {
    meId: meId ?? CURRENT_USER.id,
    fetchMessages,
    sendMessage,
    sendImageMessage,
    subscribeToMessages,
    deleteMessage,
    markConversationRead,
    openConversation,
    closeConversation,
    unreadConversations,
    totalUnreadMessages: unreadMessages.length,
    fetchConversationsOverview,
    fetchGroupMessages,
    sendGroupMessage,
    sendGroupImageMessage,
    subscribeToGroupMessages,
    deleteGroupMessage,
    markGroupConversationRead,
    fetchGroupReadReceipts,
    subscribeToGroupReadReceipts,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}
