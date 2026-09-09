import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { Friend } from '../types';
import { colors, radius, shadow } from '../theme';

interface Props {
  friend: Friend;
  rank: number;
  // Lets a group leaderboard show weekly XP instead of the friend's
  // lifetime total, without needing a second row component.
  metricXp?: number;
  metricCaption?: string;
  // Opens the friend's profile page. Omitted (or the row is for the
  // signed-in user) means the row isn't tappable.
  onPress?: (friend: Friend) => void;
}

const medalColors: Record<number, string> = {
  1: '#F4B400',
  2: '#B0B7C3',
  3: '#C97A3D',
};

export default function LeaderboardRow({ friend, rank, metricXp, metricCaption, onPress }: Props) {
  const medalColor = medalColors[rank];
  const xpValue = metricXp ?? friend.xp;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
      onPress={() => onPress?.(friend)}
    >
      <View style={styles.rankWrap}>
        {medalColor ? (
          <View style={[styles.medal, { backgroundColor: medalColor }]}>
            <Ionicons name="ribbon" size={13} color="#FFFFFF" />
          </View>
        ) : (
          <Text style={styles.rankText}>{rank}</Text>
        )}
      </View>

      {friend.avatarUrl ? (
        <Image
          source={{ uri: friend.avatarUrl }}
          style={styles.avatar}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.avatar, { backgroundColor: friend.color }]}>
          <Text style={styles.avatarText}>{friend.initials}</Text>
        </View>
      )}

      <View style={styles.nameWrap}>
        <Text style={styles.name} numberOfLines={1}>{friend.name}</Text>
        <Text style={styles.username} numberOfLines={1}>@{friend.username}</Text>
      </View>

      <View style={styles.xpWrap}>
        <Text style={styles.xpText}>{xpValue.toLocaleString()}</Text>
        <Text style={styles.timeText}>{metricCaption ?? friend.lastActive}</Text>
      </View>
    </TouchableOpacity>
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
  rankWrap: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  medal: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.avatar,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  nameWrap: {
    flex: 1,
  },
  username: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 1,
  },
  xpWrap: {
    alignItems: 'flex-end',
  },
  xpText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timeText: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
