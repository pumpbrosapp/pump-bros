import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import FriendSearchRow from './FriendSearchRow';
import { colors, type } from '../theme';
import { Friend } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  // Friends not already in the group — the only people leftover to invite.
  candidates: Friend[];
  invitedIds: string[];
  onInvite: (friend: Friend) => void;
}

export default function InviteFriendsModal({
  visible,
  onClose,
  groupName,
  candidates,
  invitedIds,
  onInvite,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Invite to {groupName}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>Only your friends can be added — no self-join for this group.</Text>

          {candidates.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={22} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                Everyone in your friends list is already in this group.
              </Text>
            </View>
          ) : (
            candidates.map((friend) => (
              <FriendSearchRow
                key={friend.id}
                user={friend}
                onRequest={onInvite}
                alreadyRequested={invitedIds.includes(friend.id)}
                actionLabel="Invite"
                actionIcon="person-add"
                doneLabel="Added"
              />
            ))
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
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    paddingHorizontal: 8,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    marginBottom: 18,
    lineHeight: 20,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: type.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
