import React, { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { Friend } from '../types';
import { useFriends } from '../context/FriendsContext';

// Fixed set of reasons rather than free text — keeps submitted reports
// consistent and quick to triage, and matches the reports table's
// `reason` column, which just stores whichever label was picked.
const REPORT_REASONS = [
  'Harassment or bullying',
  'Spam',
  'Fake profile',
  'Inappropriate content',
  'Something else',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  friend: Friend | null;
  // Optional pointer at the specific message being reported, so this
  // modal can also back the "Report message" action in DMs and group
  // chats — omitted for the plain "report this profile" flow, which
  // reports the account with no attached content.
  content?: { type: 'message' | 'group_message'; id: string };
  // Overrides the header title (e.g. "Report message") when reporting
  // a specific message rather than the whole account.
  titleOverride?: string;
}

export default function ReportUserModal({ visible, onClose, friend, content, titleOverride }: Props) {
  const { reportUser } = useFriends();
  const [reason, setReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Drives the success badge's pop-in + the glow ring's gentle pulse once
  // a report finishes submitting.
  const badgeScale = useRef(new Animated.Value(0.6)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.8)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // Reset back to the reason picker whenever the sheet is reopened for
  // (possibly) a different person, rather than showing stale state from
  // the last report.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setSubmitting(false);
      setError(null);
      setSubmitted(false);
      badgeScale.setValue(0.6);
      badgeOpacity.setValue(0);
      glowScale.setValue(0.8);
      contentOpacity.setValue(0);
    }
  }, [visible]);

  useEffect(() => {
    if (submitted) {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(badgeScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
          Animated.timing(badgeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]),
        Animated.timing(contentOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowScale, { toValue: 1.15, duration: 1400, useNativeDriver: true }),
          Animated.timing(glowScale, { toValue: 0.95, duration: 1400, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [submitted]);

  if (!friend) return null;

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await reportUser(friend.id, reason, content);
    setSubmitting(false);
    if (result.ok) {
      setSubmitted(true);
    } else {
      setError(result.error || "Couldn't submit your report. Try again.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {submitted ? 'Report sent' : titleOverride ?? `Report ${friend.name}`}
            </Text>
            <View style={styles.headerBtn} />
          </View>

          <ScrollView
            contentContainerStyle={[styles.bodyContent, submitted && styles.bodyContentCentered]}
            showsVerticalScrollIndicator={false}
          >
            {submitted ? (
              <View style={styles.successWrap}>
                <View style={styles.successIconWrap}>
                  <Animated.View
                    style={[
                      styles.successGlow,
                      { transform: [{ scale: glowScale }] },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.successIcon,
                      { opacity: badgeOpacity, transform: [{ scale: badgeScale }] },
                    ]}
                  >
                    <Ionicons name="checkmark" size={32} color={colors.iconOnDark} />
                  </Animated.View>
                </View>
                <Animated.View style={{ opacity: contentOpacity, alignItems: 'center', width: '100%' }}>
                  <Text style={styles.successTitle}>Thanks for letting us know</Text>
                  <Text style={styles.successSubtitle}>
                    Our team will review this report. {friend.name} won't be notified that you reported them.
                  </Text>
                  <TouchableOpacity style={styles.submitBtn} activeOpacity={0.85} onPress={handleClose} hapticStyle="confirm">
                    <Text style={styles.submitBtnText}>Done</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.introSubtitle}>Why are you reporting this account?</Text>

                {REPORT_REASONS.map((option) => {
                  const selected = reason === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.reasonOption, selected && styles.reasonOptionSelected]}
                      activeOpacity={0.85}
                      onPress={() => setReason(option)}
                      hapticStyle="none"
                    >
                      <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>{option}</Text>
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.submitBtn, (!reason || submitting) && styles.submitBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleSubmit}
                  disabled={!reason || submitting}
                  hapticStyle="confirm"
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.iconOnDark} />
                  ) : (
                    <Text style={styles.submitBtnText}>Submit report</Text>
                  )}
                </TouchableOpacity>
              </View>
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
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  bodyContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  form: {
    gap: 10,
  },
  introSubtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 20,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.cardSmall,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  reasonOptionSelected: {
    borderColor: colors.iconDark,
  },
  reasonLabel: {
    fontSize: type.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  reasonLabelSelected: {
    fontWeight: '700',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.iconDark,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.iconDark,
  },
  errorText: {
    fontSize: type.body,
    color: '#E0483E',
    fontWeight: '600',
    marginTop: 4,
  },
  submitBtn: {
    width: '100%',
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: colors.iconOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successIconWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  successGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E4F7EA',
  },
  successIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  successTitle: {
    fontSize: type.pageTitle - 6,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
});
