import { StreakDay } from './data/workout';
import { SplitDayValue } from './data/splits';

export interface Friend {
  id: string;
  name: string;
  username: string;
  xp: number;
  lastActive: string;
  initials: string;
  color: string;
  // Profile picture URL. Undefined/null means no picture has been set
  // (or it hasn't loaded yet) — anywhere a Friend's avatar is rendered
  // should fall back to the colored initials placeholder in that case.
  avatarUrl?: string | null;
  // XP earned in the current week only, used by the weekly group
  // leaderboard tab. Optional because it isn't always known up front —
  // GroupDetailModal falls back to deriving it when it's missing.
  weeklyXp?: number;
}

// A pending "someone wants to be your friend" request, shown in the
// notifications sheet until it's accepted or declined.
export interface FriendRequest {
  id: string;
  from: Friend;
  createdAt: string;
}

// The extra (non-essential-to-list) stats shown on a friend's profile
// page — fetched on demand rather than carried on every Friend object,
// since the leaderboard/search rows never need this much detail.
export interface FriendProfileStats {
  xp: number;
  dayStreak: number;
  streakWeek: StreakDay[];
  splitName: string | null;
  splitDays: SplitDayValue[] | null;
}

// A single direct message between the signed-in user and one other
// person, shown in ChatScreen. `pending` marks a just-sent message that
// hasn't been confirmed by the server yet (remote/Supabase mode only) —
// used to show it immediately without waiting on a round trip.
export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  // Text content. Can be empty for a photo-only message (imageUrl set).
  body: string;
  // Public URL of an attached photo, if any. A message can carry a
  // photo with or without accompanying text.
  imageUrl?: string | null;
  createdAt: string;
  pending?: boolean;
  // Set once the receiver's client has actually taken receipt of the
  // message (got it over Realtime, or loaded it via fetchMessages after
  // being offline) — null/undefined means it's only reached the server so
  // far. Only meaningful on messages the signed-in user sent.
  deliveredAt?: string | null;
  // When the receiver opened the thread this message was sitting in,
  // marking it read — null/undefined means still unread. Only ever set
  // on messages the signed-in user sent (there's no UI for seeing when
  // you read someone else's message).
  readAt?: string | null;
}

// A single message posted in a group's chat. Deliberately doesn't carry
// the sender's name/avatar — unlike a 1:1 ChatMessage, a group chat has
// more than one other participant, so the UI resolves `senderId` against
// the group's own member roster (already loaded by GroupDetailModal)
// instead of duplicating that profile data onto every message.
export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  body: string;
  imageUrl?: string | null;
  createdAt: string;
}

// One friend's unread messages, surfaced as a row in the notifications
// page. Tapping it opens the chat with `friend` and clears the unread
// state for that conversation.
export interface UnreadConversation {
  friend: Friend;
  lastMessage: ChatMessage;
  count: number;
}

// One row per friend for the chat overview screen (the message icon on
// Home) — every friend gets a row, not just ones with unread messages,
// since the overview doubles as the way to start a first conversation.
// `lastMessage` is null for a friend nothing's ever been sent to/from.
export interface ConversationSummary {
  friend: Friend;
  lastMessage: ChatMessage | null;
  unreadCount: number;
}

export type TabName = 'home' | 'workout' | 'social' | 'profile';

// Where a tapped push notification should land the user: always a tab
// (see App.tsx — there's no routing/deep-link layer, just hand-toggled
// screen state), plus optionally which DM or group chat to open once
// that tab is showing. friendId/groupId are mutually exclusive in
// practice, one per notification type.
export interface PendingChatTarget {
  tab: TabName;
  friendId?: string;
  groupId?: string;
}

// How people are allowed to get into a group, chosen by the leader when
// they create it:
//  - 'code'        anyone with the invite code can join instantly.
//  - 'invite_only' no self-serve join at all — the leader adds people
//                  directly from their friends list.
//  - 'public'      listed for anyone to discover and join with a single
//                  tap, no code needed.
export type GroupPrivacy = 'code' | 'invite_only' | 'public';

export interface Group {
  id: string;
  name: string;
  // Leader-set group photo shown on group rows/headers, same idea as a
  // Friend's avatarUrl. Null/undefined falls back to the initials-style
  // icon everywhere it's rendered.
  avatarUrl?: string | null;
  // The member who owns/administers the group. Only the leader can delete
  // the group outright — everyone else can only leave it.
  leaderId: string;
  privacy: GroupPrivacy;
  // Shown to the leader so they can share it with whoever they want to
  // invite; anyone with the code can join via joinGroupByCode. Only
  // meaningful (and only surfaced in the UI) when privacy === 'code' —
  // invite_only/public groups still get one generated under the hood but
  // it's never shown or accepted.
  inviteCode: string;
  // The group's actual roster — who's really in it, not the signed-in
  // user's whole friends list. GroupDetailModal renders this directly.
  members: Friend[];
}

// Lightweight row for the "discover public groups" list — deliberately
// doesn't include the full roster, just enough to decide whether to join.
export interface PublicGroupSummary {
  id: string;
  name: string;
  leaderName: string;
  memberCount: number;
}

// Broad category tagged on each logged workout — kept intentionally
// simple (no sets/reps/duration), just enough to break down XP and
// progress by workout type.
export type WorkoutType = 'strength' | 'cardio' | 'other';
