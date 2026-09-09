import { ChatMessage, Friend } from '../types';
import { buildConversationSummaries, groupUnreadConversations } from './chat';

function friend(id: string): Friend {
  return {
    id,
    name: `Friend ${id}`,
    username: `friend${id}`,
    avatarUrl: null,
  } as Friend;
}

function message(id: string, senderId: string, createdAt: string): ChatMessage {
  return {
    id,
    senderId,
    receiverId: 'me',
    body: `msg ${id}`,
    imageUrl: null,
    createdAt,
    deliveredAt: null,
    readAt: null,
  } as ChatMessage;
}

describe('groupUnreadConversations', () => {
  it('returns an empty list when there are no unread messages', () => {
    expect(groupUnreadConversations([], [friend('a')])).toEqual([]);
  });

  it('groups multiple unread messages from the same sender into one row', () => {
    const msgs = [
      message('1', 'a', '2024-01-01T10:00:00Z'),
      message('2', 'a', '2024-01-01T10:05:00Z'),
      message('3', 'a', '2024-01-01T09:00:00Z'),
    ];
    const rows = groupUnreadConversations(msgs, [friend('a')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
    // lastMessage should be the most recent one by createdAt, not just the last in the input array.
    expect(rows[0].lastMessage.id).toBe('2');
  });

  it('produces one row per distinct sender', () => {
    const msgs = [
      message('1', 'a', '2024-01-01T10:00:00Z'),
      message('2', 'b', '2024-01-01T11:00:00Z'),
    ];
    const rows = groupUnreadConversations(msgs, [friend('a'), friend('b')]);
    expect(rows.map((r) => r.friend.id).sort()).toEqual(['a', 'b']);
  });

  it('sorts rows newest-conversation-first', () => {
    const msgs = [
      message('1', 'a', '2024-01-01T09:00:00Z'),
      message('2', 'b', '2024-01-01T12:00:00Z'),
      message('3', 'c', '2024-01-01T10:00:00Z'),
    ];
    const rows = groupUnreadConversations(msgs, [friend('a'), friend('b'), friend('c')]);
    expect(rows.map((r) => r.friend.id)).toEqual(['b', 'c', 'a']);
  });

  it('skips messages from a sender with no matching friend profile loaded', () => {
    const msgs = [message('1', 'unknown', '2024-01-01T10:00:00Z')];
    const rows = groupUnreadConversations(msgs, [friend('a')]);
    expect(rows).toEqual([]);
  });
});

describe('buildConversationSummaries', () => {
  it('returns one row per friend even with no messages at all', () => {
    const rows = buildConversationSummaries([friend('a'), friend('b')], new Map(), []);
    expect(rows.map((r) => r.friend.id).sort()).toEqual(['a', 'b']);
    expect(rows.every((r) => r.lastMessage === null && r.unreadCount === 0)).toBe(true);
  });

  it('sorts friends with a conversation above friends never messaged', () => {
    const lastByFriend = new Map([['b', message('1', 'b', '2024-01-01T10:00:00Z')]]);
    const rows = buildConversationSummaries([friend('a'), friend('b')], lastByFriend, []);
    expect(rows.map((r) => r.friend.id)).toEqual(['b', 'a']);
  });

  it('sorts multiple active conversations most-recent-first', () => {
    const lastByFriend = new Map([
      ['a', message('1', 'a', '2024-01-01T09:00:00Z')],
      ['b', message('2', 'b', '2024-01-01T12:00:00Z')],
    ]);
    const rows = buildConversationSummaries([friend('a'), friend('b')], lastByFriend, []);
    expect(rows.map((r) => r.friend.id)).toEqual(['b', 'a']);
  });

  it('sorts friends with no conversation yet alphabetically by name', () => {
    const rows = buildConversationSummaries([friend('z'), friend('a')], new Map(), []);
    expect(rows.map((r) => r.friend.id)).toEqual(['a', 'z']);
  });

  it('counts unread messages per friend', () => {
    const msgs = [
      message('1', 'a', '2024-01-01T09:00:00Z'),
      message('2', 'a', '2024-01-01T09:05:00Z'),
      message('3', 'b', '2024-01-01T09:00:00Z'),
    ];
    const rows = buildConversationSummaries([friend('a'), friend('b')], new Map(), msgs);
    const rowA = rows.find((r) => r.friend.id === 'a');
    const rowB = rows.find((r) => r.friend.id === 'b');
    expect(rowA?.unreadCount).toBe(2);
    expect(rowB?.unreadCount).toBe(1);
  });
});
