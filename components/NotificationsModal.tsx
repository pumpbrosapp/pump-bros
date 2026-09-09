import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { FriendRequest, UnreadConversation } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  requests: FriendRequest[];
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  messages: UnreadConversation[];
  onPressMessage: (conversation: UnreadConversation) => void;
}

export default function NotificationsModal({
  visible,
  onClose,
  requests,
  onAccept,
  onDecline,
  messages,
  onPressMessage,
}: Props) {
  const isEmpty = requests.length === 0 && messages.length === 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Notifications</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {isEmpty ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-outline" size={26} color={colors.textTertiary} />
              <Text style={styles.emptyText}>You're all caught up — no new notifications.</Text>
            </View>
          ) : (
            <>
              {messages.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Messages</Text>
                  {messages.map((conversation) => (
                    <TouchableOpacity
                      key={conversation.friend.id}
                      style={styles.requestRow}
                      activeOpacity={0.8}
                      onPress={() => onPressMessage(conversation)}
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
                        <Text style={styles.subtitle} numberOfLines={1}>
                          {conversation.count > 1
                            ? `Sent you ${conversation.count} messages`
                            : conversation.lastMessage.body.trim()
                              ? `Sent you a message: "${conversation.lastMessage.body}"`
                              : 'Sent you a photo'}
                        </Text>
                      </View>

                      {conversation.count > 1 && (
                        <View style={styles.messageCountBadge}>
                          <Text style={styles.messageCountBadgeText}>{conversation.count}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {requests.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Friend requests</Text>
                  {requests.map((request) => (
                    <View key={request.id} style={styles.requestRow}>
                      {request.from.avatarUrl ? (
                        <Image
                          source={{ uri: request.from.avatarUrl }}
                          style={styles.avatar}
                          contentFit="cover"
                          transition={150}
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: request.from.color }]}>
                          <Text style={styles.avatarText}>{request.from.initials}</Text>
                        </View>
                      )}

                      <View style={styles.nameWrap}>
                        <Text style={styles.name} numberOfLines={1}>
                          {request.from.name}
                        </Text>
                        <Text style={styles.subtitle} numberOfLines={1}>
                          @{request.from.username} wants to be friends
                        </Text>
                      </View>

                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={styles.declineButton}
                          activeOpacity={0.8}
                          onPress={() => onDecline(request.id)}
                          accessibilityLabel={`Decline ${request.from.name}`}
                        >
                          <Ionicons name="close" size={17} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.acceptButton}
                          activeOpacity={0.8}
                          onPress={() => onAccept(request.id)}
                          accessibilityLabel={`Accept ${request.from.name}`}
                        >
                          <Ionicons name="checkmark" size={17} color={colors.iconOnDark} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
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
  sectionTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  requestRow: {
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
    width: 40,
    height: 40,
    borderRadius: radius.avatar,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  nameWrap: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  declineButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyWrap: {
    alignItems: 'center',
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
