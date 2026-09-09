import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { ChatMessage, Friend } from '../types';
import { useChat } from '../context/ChatContext';
import { useFriends } from '../context/FriendsContext';
import { containsProhibitedLanguage, CONTENT_BLOCKED_TITLE, CONTENT_BLOCKED_MESSAGE } from '../utils/contentFilter';
import ReportUserModal from './ReportUserModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  friend: Friend | null;
  // Lets the screen that opened this chat handle "go to their profile"
  // (e.g. show FriendProfileModal for this same friend). Omitted where
  // there's nowhere sensible to send the user (e.g. no caller wired it
  // up yet) — the header identity just isn't tappable in that case.
  onViewProfile?: () => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Sent < Delivered < Seen — read_at implies the receiver's client has it
// regardless of whether delivered_at also got set, so it takes priority.
function statusLabel(message: ChatMessage): string {
  if (message.readAt) return 'Seen';
  if (message.deliveredAt) return 'Delivered';
  return 'Sent';
}

export default function ChatScreen({ visible, onClose, friend, onViewProfile }: Props) {
  const {
    meId,
    fetchMessages,
    sendMessage,
    sendImageMessage,
    subscribeToMessages,
    deleteMessage,
    markConversationRead,
    openConversation,
    closeConversation,
  } = useChat();
  const { isBlocked } = useFriends();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  // Mirrors `messages` so handleLoadMore can read the current oldest
  // message without depending on (and re-subscribing on) `messages`.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const friendId = friend?.id ?? null;

  useEffect(() => {
    if (!visible || !friendId) {
      setMessages([]);
      setHasMoreMessages(false);
      setPendingImageUri(null);
      setReportMessageId(null);
      return;
    }

    let cancelled = false;
    openConversation(friendId);
    fetchMessages(friendId).then(({ messages: history, hasMore }) => {
      if (cancelled) return;
      setMessages(history);
      setHasMoreMessages(hasMore);
      // Fresh page just replaced the list — land at the newest message.
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    });
    // Opening the thread is what "reading" it means here — mark
    // whatever they've already sent as read.
    markConversationRead(friendId);

    const unsubscribe = subscribeToMessages(
      friendId,
      (incoming) => {
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        // The thread is already open on screen, so this incoming message
        // is being read the moment it arrives too.
        markConversationRead(friendId);
      },
      (deletedId) => {
        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
      },
      (readMessageId, readAt) => {
        setMessages((prev) => prev.map((m) => (m.id === readMessageId ? { ...m, readAt } : m)));
      },
      (deliveredMessageId, deliveredAt) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === deliveredMessageId ? { ...m, deliveredAt } : m))
        );
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
      closeConversation();
    };
  }, [visible, friendId, fetchMessages, subscribeToMessages, markConversationRead, openConversation, closeConversation]);

  const handleLoadMore = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!friendId || !oldest || !hasMoreMessages || loadingMore) return;
    setLoadingMore(true);
    const { messages: older, hasMore } = await fetchMessages(friendId, oldest.createdAt);
    // maintainVisibleContentPosition (set on the FlatList below) keeps
    // whatever the user was looking at in place as these get prepended,
    // instead of the list jumping to the top of the new content.
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      return [...older.filter((m) => !existingIds.has(m.id)), ...prev];
    });
    setHasMoreMessages(hasMore);
    setLoadingMore(false);
  }, [friendId, hasMoreMessages, loadingMore, fetchMessages]);

  const runDelete = useCallback(
    async (messageId: string, mode: 'me' | 'everyone') => {
      if (!friendId) return;
      const removed = messages.find((m) => m.id === messageId) ?? null;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      const ok = await deleteMessage(friendId, messageId, mode);
      if (!ok && removed) {
        // Delete failed — put it back rather than silently losing it.
        setMessages((prev) => (prev.some((m) => m.id === messageId) ? prev : [...prev, removed]));
        Alert.alert("Couldn't delete message", 'Check your connection and try again.');
      }
    },
    [friendId, messages, deleteMessage]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string, isMe: boolean) => {
      if (!friendId) return;
      // Only the sender can wipe a message for both sides — either
      // person can still hide it from just their own view.
      if (isMe) {
        Alert.alert('Delete message?', 'Choose who this disappears for.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete for me', onPress: () => runDelete(messageId, 'me') },
          { text: 'Delete for everyone', style: 'destructive', onPress: () => runDelete(messageId, 'everyone') },
        ]);
        return;
      }
      Alert.alert('Delete message?', "This only removes it from your own view — it'll stay for the other person.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', style: 'destructive', onPress: () => runDelete(messageId, 'me') },
      ]);
    },
    [friendId, runDelete]
  );

  // Long-press action sheet for a message bubble. Delete options are
  // unchanged from before; "Report message" is only offered on the
  // other person's messages, since reporting your own doesn't make
  // sense.
  const handleMessageLongPress = useCallback(
    (messageId: string, isMe: boolean) => {
      if (!friendId) return;
      if (isMe) {
        handleDeleteMessage(messageId, isMe);
        return;
      }
      Alert.alert('Message options', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', style: 'destructive', onPress: () => runDelete(messageId, 'me') },
        { text: 'Report message', onPress: () => setReportMessageId(messageId) },
      ]);
    },
    [friendId, handleDeleteMessage, runDelete]
  );

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !pendingImageUri) || !friendId || sending) return;

    // Blocking is one-directional from the client's point of view — we
    // can only ever see our own block list (see FriendsContext), so
    // this catches "I blocked them" before it hits the network. The
    // reverse case ("they blocked me") isn't something the client is
    // allowed to know in advance — the send just fails server-side
    // (RLS on the messages table) and falls through to the generic
    // "couldn't send" handling below, same as any other failed send.
    if (isBlocked(friendId)) {
      Alert.alert("Can't send message", "Unblock this person to message them again.");
      return;
    }

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
      ? await sendImageMessage(friendId, imageUri, body)
      : await sendMessage(friendId, body);
    setSending(false);

    if (sent) {
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } else {
      // Send failed (e.g. dropped connection, or the upload failed) —
      // give the draft and photo back so nothing is lost.
      setDraft(body);
      setPendingImageUri(imageUri);
      Alert.alert(
        imageUri ? "Couldn't send photo" : "Couldn't send message",
        'Check your connection and try again.'
      );
    }
  }, [draft, pendingImageUri, friendId, sending, sendMessage, sendImageMessage, isBlocked]);

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

  if (!friend) return null;

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIdentity}
              onPress={onViewProfile}
              disabled={!onViewProfile}
              activeOpacity={0.7}
              hitSlop={4}
            >
              {friend.avatarUrl ? (
                <Image
                  source={{ uri: friend.avatarUrl }}
                  style={styles.headerAvatar}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.headerAvatar, { backgroundColor: friend.color }]}>
                  <Text style={styles.headerAvatarText}>{friend.initials}</Text>
                </View>
              )}
              <Text style={styles.headerName} numberOfLines={1}>
                {friend.name}
              </Text>
            </TouchableOpacity>

            <View style={styles.headerBtn} />
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            // Keeps whatever the user's looking at anchored in place when
            // older messages get prepended by handleLoadMore, instead of
            // the scroll position jumping around under them.
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
                <Text style={styles.emptyText}>Say hey to {friend.name.split(' ')[0]}.</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const isMe = item.senderId === meId;
              const isLastMessage = index === messages.length - 1;
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
              return (
                <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
                  {/* Every message gets a long-press affordance now —
                      delete-for-me works on either side's message, not
                      just your own (delete-for-everyone still checks
                      isMe inside handleDeleteMessage). */}
                  <Pressable onLongPress={() => handleMessageLongPress(item.id, isMe)} delayLongPress={350}>
                    {bubble}
                  </Pressable>
                  <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextThem]}>
                    {formatTime(item.createdAt)}
                  </Text>
                  {isMe && isLastMessage && <Text style={styles.statusText}>{statusLabel(item)}</Text>}
                </View>
              );
            }}
          />

          {pendingImageUri && (
            <View style={styles.previewBar}>
              <Image source={{ uri: pendingImageUri }} style={styles.previewThumb} contentFit="cover" />
              <TouchableOpacity
                style={styles.previewRemoveBtn}
                onPress={() => setPendingImageUri(null)}
                hitSlop={8}
              >
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
              placeholder={pendingImageUri ? 'Add a caption' : `Message ${friend.name.split(' ')[0]}`}
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
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>

    <ReportUserModal
      visible={!!reportMessageId}
      onClose={() => setReportMessageId(null)}
      friend={friend}
      content={reportMessageId ? { type: 'message', id: reportMessageId } : undefined}
      titleOverride="Report message"
    />
    </>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  headerName: {
    fontSize: type.sectionTitle,
    fontWeight: '700',
    color: colors.textPrimary,
    maxWidth: 200,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
    maxWidth: '78%',
  },
  bubbleRowMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleRowThem: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
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
