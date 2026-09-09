import React, { useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { Ionicons } from '@expo/vector-icons';
import { Friend } from '../types';
import { colors, radius, shadow } from '../theme';

interface Props {
  user: Friend;
  // Callers (sendFriendRequest, the group-invite handler) are async and
  // may fail — e.g. the invite RPC rejecting someone who's already in
  // the group. Awaited below so a failure doesn't get mistaken for a
  // success (see handleRequest).
  onRequest: (user: Friend) => void | Promise<void>;
  alreadyRequested?: boolean;
  onPressProfile?: (user: Friend) => void;
  // Lets this row be reused for actions other than sending a friend
  // request (e.g. inviting a friend into a group) without changing its
  // default "Add" / "Requested" friend-request copy.
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  doneLabel?: string;
}

export default function FriendSearchRow({
  user,
  onRequest,
  alreadyRequested = false,
  onPressProfile,
  actionLabel = 'Add',
  actionIcon = 'person-add',
  doneLabel = 'Requested',
}: Props) {
  // Transient "in flight" state only — NOT a stand-in for "succeeded".
  // `alreadyRequested` (driven by the parent's actual friend-request /
  // invite state, which reverts itself on failure) is the only source
  // of truth for "done". Previously this component kept its own
  // permanent `justRequested` flag that flipped true the instant the
  // button was tapped and never flipped back, so a failed request/invite
  // (e.g. "Already in the group") still left the row stuck showing
  // "Added"/"Requested" with the button disabled — contradicting the
  // error alert the user saw and blocking any retry.
  const [submitting, setSubmitting] = useState(false);
  const requested = alreadyRequested;

  const handleRequest = async () => {
    if (requested || submitting) return;
    setSubmitting(true);
    try {
      await onRequest(user);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.identityWrap}
        activeOpacity={onPressProfile ? 0.7 : 1}
        disabled={!onPressProfile}
        onPress={() => onPressProfile?.(user)}
        hapticStyle="none"
      >
        {user.avatarUrl ? (
          <Image
            source={{ uri: user.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: user.color }]}>
            <Text style={styles.avatarText}>{user.initials}</Text>
          </View>
        )}

        <View style={styles.nameWrap}>
          <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
          <Text style={styles.username} numberOfLines={1}>@{user.username}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.addButton, requested && styles.addedButton]}
        activeOpacity={0.8}
        onPress={handleRequest}
        disabled={requested || submitting}
      >
        {requested ? (
          <>
            <Ionicons name="checkmark" size={15} color={colors.textSecondary} />
            <Text style={styles.addedText}>{doneLabel}</Text>
          </>
        ) : submitting ? (
          <ActivityIndicator size="small" color={colors.iconOnDark} />
        ) : (
          <>
            <Ionicons name={actionIcon} size={14} color={colors.iconOnDark} />
            <Text style={styles.addText}>{actionLabel}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
  identityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  username: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 5,
  },
  addedButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  addText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.iconOnDark,
  },
  addedText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
