import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { Friend, GroupMessage } from '../types';
import { useChat } from '../context/ChatContext';
import { containsProhibitedLanguage, CONTENT_BLOCKED_TITLE, CONTENT_BLOCKED_MESSAGE } from '../utils/contentFilter';
import ReportUserModal from './ReportUserModal';

interface Props {
  groupId: string;
  groupName: string;
  members: Friend[];
  meId: string;
  // Opens a member's profile immediately when their avatar is tapped in the
  // message list, instead of forcing the user to leave the chat to find
  // them elsewhere.
  onPressProfile?: (friend: Friend) => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Label under the signed-in user's most recent message. `receipts` maps
// member id -> the timestamp they've read up through; a member counts as
// having seen `message` once their cursor is at or past its createdAt.
// Named individually for a couple of members so "seen" feels concrete in
// a small group chat, but falls back to a count once a name-by-name list
// would just run off the edge of the bubble.
function seenLabel(message: GroupMessage, members: Friend[], meId: string, receipts: Record<string, string>): string {
  const messageTime = new Date(message.createdAt).getTime();
  const seenBy = members.filter((m) => {
    if (m.id === meId) return false;
    const readAt = receipts[m.id];
    return !!readAt && new Date(readAt).getTime() >= messageTime;
  });
  if (seenBy.length === 0) return 'Sent';
  if (seenBy.length <= 2) return `Seen by ${seenBy.map((m) => m.name.split(' ')[0]).join(', ')}`;
  return `Seen by ${seenBy.length}`;
}

// Fallback shown for a message from someone who's since left the group,
// so the roster lookup below never has to render a blank name/avatar.
const UNKNOWN_MEMBER: Friend = {
  id: '',
  name: 'Former member',
  username: '',
  xp: 0,
  lastActive: '',
  initials: '?',
  color: colors.textTertiary,
};

export default function GroupChatPanel({ groupId, groupName, members, meId, onPressProfile }: Props) {
  const {
    fetchGroupMessages,
    sendGroupMessage,
    sendGroupImageMessage,
    subscribeToGroupMessages,
    deleteGroupMessage,
    markGroupConversationRead,
    fetchGroupReadReceipts,
    subscribeToGroupReadReceipts,
  } = useChat();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  // member id -> read-through timestamp, feeds seenLabel below.
  const [readReceipts, setReadReceipts] = useState<Record<string, string>>({});
  // The message currently being reported, if any — drives the
  // ReportUserModal below (reporting the message's sender).
  const [reportMessage, setReportMessage] = useState<GroupMessage | null>(null);
  const listRef = useRef<FlatList<GroupMessage>>(null);
  // Mirrors `messages` so handleLoadMore can read the current oldest
  // message without depending on (and re-subscribing on) `messages`.
  const messagesRef = useRef<GroupMessage[]>([]);
  messagesRef.current = messages;

  const memberById = useMemo(() => {
    const map = new Map<string, Friend>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  useEffect(() => {
    let cancelled = false;
    fetchGroupMessages(groupId).then(({ messages: history, hasMore }) => {
      if (cancelled) return;
      setMessages(history);
      setHasMoreMessages(hasMore);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    });
    fetchGroupReadReceipts(groupId).then((receipts) => {
      if (cancelled) return;
      setReadReceipts(receipts);
    });
    // Opening the panel is what "reading" it means here — mirrors
    // markConversationRead for DMs.
    markGroupConversationRead(groupId);

    const unsubscribe = subscribeToGroupMessages(
      groupId,
      (incoming) => {
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        // The panel is already open, so this incoming message is being
        // read the moment it arrives too.
        markGroupConversationRead(groupId);
      },
      (deletedId) => {
        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
      }
    );

    const unsubscribeReads = subscribeToGroupReadReceipts(groupId, (userId, readAt) => {
      setReadReceipts((prev) => ({ ...prev, [userId]: readAt }));
    });

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeReads();
    };
  }, [
    groupId,
    fetchGroupMessages,
    subscribeToGroupMessages,
    fetchGroupReadReceipts,
    subscribeToGroupReadReceipts,
    markGroupConversationRead,
  ]);

  const handleLoadMore = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || !hasMoreMessages || loadingMore) return;
    setLoadingMore(true);
    const { messages: older, hasMore } = await fetchGroupMessages(groupId, oldest.createdAt);
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      return [...older.filter((m) => !existingIds.has(m.id)), ...prev];
    });
    setHasMoreMessages(hasMore);
    setLoadingMore(false);
  }, [groupId, hasMoreMessages, loadingMore, fetchGroupMessages]);

  const runDelete = useCallback(
    async (messageId: string, mode: 'me' | 'everyone') => {
      const removed = messages.find((m) => m.id === messageId) ?? null;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      const ok = await deleteGroupMessage(groupId, messageId, mode);
      if (!ok && removed) {
        setMessages((prev) => (prev.some((m) => m.id === messageId) ? prev : [...prev, removed]));
        Alert.alert("Couldn't delete message", 'Check your connection and try again.');
      }
    },
    [groupId, messages, deleteGroupMessage]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string, isMe: boolean) => {
      // Only the sender can wipe a message for the whole group — anyone
      // can still hide it from just their own view.
      if (isMe) {
        Alert.alert('Delete message?', 'Choose who this disappears for.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete for me', onPress: () => runDelete(messageId, 'me') },
          { text: 'Delete for everyone', style: 'destructive', onPress: () => runDelete(messageId, 'everyone') },
        ]);
        return;
      }
      Alert.alert('Delete message?', "This only removes it from your own view — it'll stay for everyone else.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', style: 'destructive', onPress: () => runDelete(messageId, 'me') },
      ]);
    },
    [runDelete]
  );

  // Long-press action sheet for a message bubble. Delete options are
  // unchanged from before; "Report message" is only offered on other
  // members' messages, since reporting your own doesn't make sense.
  const handleMessageLongPress = useCallback(
    (message: GroupMessage, isMe: boolean) => {
      if (isMe) {
        handleDeleteMessage(message.id, isMe);
        return;
      }
      const actions: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', style: 'destructive', onPress: () => runDelete(message.id, 'me') },
      ];
      // Can't file a report against a former member who's no longer in
      // the roster (memberById won't resolve a real id for them).
      if (memberById.get(message.senderId)?.id) {
        actions.push({ text: 'Report message', onPress: () => setReportMessage(message) });
      }
      Alert.alert('Message options', undefined, actions);
    },
    [handleDeleteMessage, runDelete, memberById]
  );

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !pendingImageUri) || sending) return;

    // Basic content filter — catch clearly offensive/prohibited
    // language client-side before it ever leaves the device, and give a
    // distinct error from the generic "check your connection" failure
    // below so it's clear the message was blocked, not lost.
    if (containsProhibitedLanguage(body)) {
      Alert.alert(CONTENT_BLOCKED_TITLE, CONTENT_BLOCKED_MESSAGE);
      return;
    }

    const imageUri = pendingImageUri;
    setDraft('');
    setPendingImageUri(null);
    setSending(true);
    const sent = imageUri
      ? await sendGroupImageMessage(groupId, imageUri, body)
      : await sendGroupMessage(groupId, body);
    setSending(false);

    if (sent) {
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } else {
      setDraft(body);
      setPendingImageUri(imageUri);
      Alert.alert(
        imageUri ? "Couldn't send photo" : "Couldn't send message",
        'Check your connection and try again.'
      );
    }
  }, [draft, pendingImageUri, groupId, sending, sendGroupMessage, sendGroupImageMessage]);

  const handlePickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow access to your photos to send one in chat.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPendingImageUri(result.assets[0].uri);
  }, []);

  const reportSender = reportMessage ? memberById.get(reportMessage.senderId) ?? null : null;

  return (
    <>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // Keeps whatever the user's looking at anchored in place when
        // older messages get prepended by handleLoadMore, instead of the
        // scroll position jumping around under them.
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onStartReached={handleLoadMore}
        onStartReachedThreshold={1.5}
        ListHeaderComponent={
          loadingMore ? (
            <View style={styles.loadMoreWrap}>
              <ActivityIndicator size="small" color={colors.textTertiary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.textTertiary} />
            <Text style={styles.emptyText}>Say hey to the group.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isMe = item.senderId === meId;
          const sender = memberById.get(item.senderId) ?? UNKNOWN_MEMBER;
          const prev = messages[index - 1];
          const showSenderName = !isMe && (!prev || prev.senderId !== item.senderId);
          // Former members have no real id (see UNKNOWN_MEMBER) — nothing to
          // open a profile for in that case.
          const canOpenProfile = !isMe && !!sender.id && !!onPressProfile;

          return (
            <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
              {!isMe && (
                <TouchableOpacity
                  disabled={!canOpenProfile}
                  onPress={() => onPressProfile?.(sender)}
                  hitSlop={4}
                  hapticStyle="none"
                >
                  {sender.avatarUrl ? (
                    <Image
                      source={{ uri: sender.avatarUrl }}
                      style={styles.senderAvatar}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.senderAvatar, { backgroundColor: sender.color }]}>
                      <Text style={styles.senderAvatarText}>{sender.initials}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <View style={{ maxWidth: '78%' }}>
                {showSenderName && (
                  <TouchableOpacity disabled={!canOpenProfile} onPress={() => onPressProfile?.(sender)} hapticStyle="none">
                    <Text style={styles.senderName}>{sender.name}</Text>
                  </TouchableOpacity>
                )}
                {(() => {
                  const bubble = (
                    <View
                      style={[
                        styles.bubble,
                        isMe ? styles.bubbleMe : styles.bubbleThem,
                        !!item.imageUrl && styles.bubbleWithImage,
                      ]}
                    >
                      {item.imageUrl && (
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={[styles.bubbleImage, !item.body && styles.bubbleImageOnly]}
                          contentFit="cover"
                          transition={150}
                          cachePolicy="memory-disk"
                        />
                      )}
                      {!!item.body && (
                        <Text
                          style={[
                            styles.bubbleText,
                            isMe ? styles.bubbleTextMe : styles.bubbleTextThem,
                            !!item.imageUrl && styles.bubbleCaption,
                          ]}
                        >
                          {item.body}
                        </Text>
                      )}
                    </View>
                  );
                  // Every message gets a long-press affordance now —
                  // delete-for-me works on anyone's message, not just
                  // your own (delete-for-everyone still checks isMe
                  // inside handleDeleteMessage).
                  return (
                    <Pressable onLongPress={() => handleMessageLongPress(item, isMe)} delayLongPress={350}>
                      {bubble}
                    </Pressable>
                  );
                })()}
                <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextThem]}>
                  {formatTime(item.createdAt)}
                </Text>
                {isMe && index === messages.length - 1 && (
                  <Text style={styles.statusText}>{seenLabel(item, members, meId, readReceipts)}</Text>
                )}
              </View>
            </View>
          );
        }}
      />

      {pendingImageUri && (
        <View style={styles.previewBar}>
          <Image source={{ uri: pendingImageUri }} style={styles.previewThumb} contentFit="cover" />
          <TouchableOpacity style={styles.previewRemoveBtn} onPress={() => setPendingImageUri(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage} hitSlop={8}>
          <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={pendingImageUri ? 'Add a caption' : `Message ${groupName}`}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !draft.trim() && !pendingImageUri && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={(!draft.trim() && !pendingImageUri) || sending}
          hapticStyle="confirm"
        >
          <Ionicons name="arrow-up" size={18} color={colors.iconOnDark} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>

    <ReportUserModal
      visible={!!reportMessage}
      onClose={() => setReportMessage(null)}
      friend={reportSender}
      content={reportMessage ? { type: 'group_message', id: reportMessage.id } : undefined}
      titleOverride="Report message"
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    flexGrow: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 80,
  },
  emptyText: {
    fontSize: type.body,
    color: colors.textTertiary,
  },
  loadMoreWrap: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  bubbleRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bubbleRowMe: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  bubbleRowThem: {
    alignSelf: 'flex-start',
  },
  senderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  senderAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
  },
  senderName: {
    fontSize: type.caption,
    fontWeight: '700',
    color: colors.textTertiary,
    marginBottom: 3,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: radius.cardSmall,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleWithImage: {
    padding: 6,
  },
  bubbleImage: {
    width: 200,
    height: 200,
    borderRadius: radius.cardSmall - 4,
    marginBottom: 6,
  },
  bubbleImageOnly: {
    marginBottom: 0,
  },
  bubbleCaption: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  bubbleMe: {
    backgroundColor: colors.iconDark,
    borderBottomRightRadius: 6,
    ...shadow.card,
  },
  bubbleThem: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderBottomLeftRadius: 6,
  },
  bubbleText: {
    fontSize: type.body,
    lineHeight: 19,
  },
  bubbleTextMe: {
    color: colors.iconOnDark,
  },
  bubbleTextThem: {
    color: colors.textPrimary,
  },
  timeText: {
    fontSize: type.caption,
    color: colors.textTertiary,
    marginTop: 4,
    marginHorizontal: 4,
  },
  timeTextMe: {
    textAlign: 'right',
  },
  timeTextThem: {
    textAlign: 'left',
  },
  statusText: {
    fontSize: type.caption,
    color: colors.textTertiary,
    marginTop: 2,
    marginHorizontal: 4,
    textAlign: 'right',
  },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  previewThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.cardSmall - 4,
  },
  previewRemoveBtn: {
    marginLeft: -12,
    marginTop: -34,
    backgroundColor: colors.background,
    borderRadius: 10,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    borderRadius: radius.cardSmall,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
});
