import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { useTrainers } from '../context/TrainersContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ManageTrainersScreen({ visible, onClose }: Props) {
  const { allTrainers, isRemoved, removeTrainer, restoreTrainer } = useTrainers();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Manage Trainers</Text>
            <View style={styles.headerBtn} />
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.blurb}>
              AI trainers are permanent competitors on your leaderboard. Remove one if you'd rather not see
              it, or bring it back any time — it never touches your own XP, streak, or friends.
            </Text>

            <View style={styles.settingsCard}>
              {allTrainers.map((trainer, index) => {
                const removed = isRemoved(trainer.id);
                return (
                  <View
                    key={trainer.id}
                    style={[styles.row, index === allTrainers.length - 1 && styles.rowLast]}
                  >
                    <View style={[styles.avatar, { backgroundColor: trainer.color }]}>
                      <Text style={styles.avatarText}>{trainer.initials}</Text>
                    </View>
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowLabel}>{trainer.name}</Text>
                      <Text style={styles.rowDescription}>
                        {trainer.difficulty} · ~{trainer.daysPerWeek}x/week
                        {removed ? ' · Removed' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.actionButton, removed ? styles.restoreButton : styles.removeButton]}
                      activeOpacity={0.8}
                      onPress={() => (removed ? restoreTrainer(trainer.id) : removeTrainer(trainer.id))}
                    >
                      <Text style={[styles.actionButtonText, removed && styles.restoreButtonText]}>
                        {removed ? 'Restore' : 'Remove'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
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
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 40,
  },
  blurb: {
    fontSize: type.body,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 18,
  },
  settingsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  rowLast: {
    borderBottomWidth: 0,
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
  rowTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowDescription: {
    fontSize: type.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionButton: {
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  removeButton: {
    backgroundColor: 'rgba(224, 72, 62, 0.12)',
  },
  restoreButton: {
    backgroundColor: colors.iconDark,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E0483E',
  },
  restoreButtonText: {
    color: colors.iconOnDark,
  },
});
