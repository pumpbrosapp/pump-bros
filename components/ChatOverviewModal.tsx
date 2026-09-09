import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { ConversationSummary, Friend } from '../types';
import { useChat } from '../context/ChatContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectFriend: (friend: Friend) => void;
}

// Short, list-friendly timestamp: just now / 34m / 5h / Tue / 3/14 —
// mirrors how most chat inboxes compress recency instead of always
// showing a full date.
function formatListTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

function previewText(conversation: ConversationSummary): string {
  const { lastMessage } = conversation;
  if (!lastMessage) return 'Say hi 👋';
  if (lastMessage.body.trim()) return lastMessage.body.trim();
  return lastMessage.imageUrl ? 'Sent a photo' : '';
}

export default function ChatOverviewModal({ visible, onClose, onSelectFriend }: Props) {
  const { fetchConversationsOverview } = useChat();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    fetchConversationsOverview()
      .then((rows) => {
        if (!cancelled) setConversations(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, fetchConversationsOverview]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Messages</Text>
            </View>
            <View style={styles.headerBtn} />
          </View>

          {loading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.iconDark} />
            </View>
          ) : (
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {conversations.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.textTertiary} />
                  <Text style={styles.emptyText}>
                    Add some friends to start chatting with them here.
                  </Text>
                </View>
              ) : (
                conversations.map((conversation) => (
                  <TouchableOpacity
                    key={conversation.friend.id}
                    style={styles.row}
                    activeOpacity={0.8}
                    onPress={() => onSelectFriend(conversation.friend)}
                  >
                    {conversation.friend.avatarUrl ? (
                      <Image
                        source={{ uri: conversation.friend.avatarUrl }}
                        style={styles.avatar}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: conversation.friend.color }]}>
                        <Text style={styles.avatarText}>{conversation.friend.initials}</Text>
                      </View>
                    )}

                    <View style={styles.nameWrap}>
                      <Text style={styles.name} numberOfLines={1}>
                        {conversation.friend.name}
                      </Text>
                      <Text
                        style={[styles.subtitle, conversation.unreadCount > 0 && styles.subtitleUnread]}
                        numberOfLines={1}
                      >
                        {previewText(conversation)}
                      </Text>
                    </View>

                    <View style={styles.metaWrap}>
                      {conversation.lastMessage && (
                        <Text style={styles.timeText}>{formatListTime(conversation.lastMessage.createdAt)}</Text>
                      )}
                      {conversation.unreadCount > 0 && (
                        <View style={styles.unreadDot}>
                          <Text style={styles.unreadDotText}>
                            {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
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
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: type.body + 2,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    ...shadow.card,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.avatar,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  nameWrap: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  subtitleUnread: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  metaWrap: {
    alignItems: 'flex-end',
    gap: 6,
  },
  timeText: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  unreadDot: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDotText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: type.body,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
