import { ChatMessage, ConversationSummary, Friend, UnreadConversation } from '../types';

// Groups a flat list of unread DMs into one row per sender, each carrying
// their most recent unread message and an unread count — the shape the
// notifications page's "Messages" section renders. Pulled out of
// ChatContext as a pure function so it can be unit tested without a
// Supabase connection or a mounted provider: this is exactly the kind of
// logic (per-sender grouping, "most recent" tie-breaking, overall sort
// order) that's easy to get subtly wrong and have it fail silently — a
// wrong sort key still renders *a* list, just not the right one.
//
// A message whose sender isn't in `friends` yet (profile still loading,
// or a since-removed friend) is skipped rather than shown as a blank row.
export function groupUnreadConversations(
  unreadMessages: ChatMessage[],
  friends: Friend[]
): UnreadConversation[] {
  const bySender = new Map<string, ChatMessage[]>();
  for (const message of unreadMessages) {
    const list = bySender.get(message.senderId) ?? [];
    list.push(message);
    bySender.set(message.senderId, list);
  }

  const rows: UnreadConversation[] = [];
  for (const [senderId, msgs] of bySender) {
    const friend = friends.find((f) => f.id === senderId);
    if (!friend) continue;
    const sorted = [...msgs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    rows.push({ friend, lastMessage: sorted[sorted.length - 1], count: sorted.length });
  }

  return rows.sort(
    (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
  );
}

// Builds the chat overview's row list: every friend, each paired with
// their most recent message (if any) and how many of that friend's
// messages are still unread. Pulled out as a pure function for the same
// testability reason as groupUnreadConversations above — sort order (has
// a conversation vs. never messaged, then most-recent-first) is easy to
// get wrong silently.
//
// Friends with an ongoing conversation sort to the top, most-recently-
// active first; friends never messaged follow, alphabetically, so the
// overview also works as a "start a new chat" picker.
export function buildConversationSummaries(
  friends: Friend[],
  lastMessageByFriendId: Map<string, ChatMessage>,
  unreadMessages: ChatMessage[]
): ConversationSummary[] {
  const unreadCountBySender = new Map<string, number>();
  for (const message of unreadMessages) {
    unreadCountBySender.set(message.senderId, (unreadCountBySender.get(message.senderId) ?? 0) + 1);
  }

  const rows: ConversationSummary[] = friends.map((friend) => ({
    friend,
    lastMessage: lastMessageByFriendId.get(friend.id) ?? null,
    unreadCount: unreadCountBySender.get(friend.id) ?? 0,
  }));

  return rows.sort((a, b) => {
    if (a.lastMessage && b.lastMessage) {
      return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
    }
    if (a.lastMessage) return -1;
    if (b.lastMessage) return 1;
    return a.friend.name.localeCompare(b.friend.name);
  });
}
