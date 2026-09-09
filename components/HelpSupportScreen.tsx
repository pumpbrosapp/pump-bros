import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, LayoutAnimation, Platform, UIManager } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { openMailto } from '../utils/mailto';
import { useToast } from '../context/ToastContext';

// Keep in sync with the "version" field in app.json.
const APP_VERSION = '1.0.0';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'streak',
    question: 'How does my streak work?',
    answer:
      "Your day streak counts consecutive days you've logged at least one workout. Log a workout on a day your streak had broken and you'll kick off a fresh streak with a small comeback XP bonus.",
  },
  {
    id: 'xp',
    question: 'How do I earn XP?',
    answer:
      "You earn XP every time you log a workout. XP only ever moves forward — it's used for your leaderboard position and progress stats.",
  },
  {
    id: 'leaderboard',
    question: 'How is the friends leaderboard calculated?',
    answer:
      "The leaderboard ranks you and your friends by XP. Weekly numbers are approximate for friends until per-week totals are wired up — your own weekly total is always exact.",
  },
  {
    id: 'friends',
    question: 'How do I add friends?',
    answer: 'Head to the Social tab and search for a friend by username to send a request.',
  },
  {
    id: 'split',
    question: 'Can I change my workout split?',
    answer: "Yes — open Profile and tap your split to edit it, or build a new one any time.",
  },
  {
    id: 'delete',
    question: 'How do I delete my account?',
    answer:
      'Go to Profile > Privacy & data > Delete account. This permanently removes your account, profile, friends, and workout history and cannot be undone.',
  },
];

// TODO: point these at real inboxes before shipping.
const SUPPORT_EMAIL = 'pumpbrossupport@gmail.com';
const BUG_EMAIL = 'pumpbrossupport@gmail.com';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HelpSupportScreen({ visible, onClose }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleEmail = async (email: string, subject: string, copiedNoun: string) => {
    const opened = await openMailto(email, subject);
    if (!opened) {
      showToast(`No email app found — copied ${copiedNoun} to clipboard`, 'info');
    }
  };

  const toggleFaq = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Help & support</Text>
            <View style={styles.headerBtn} />
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>Frequently asked</Text>
            <View style={styles.settingsCard}>
              {FAQ_ITEMS.map((item, index) => {
                const expanded = expandedId === item.id;
                return (
                  <View
                    key={item.id}
                    style={[styles.faqRow, index === FAQ_ITEMS.length - 1 && styles.rowLast]}
                  >
                    <TouchableOpacity
                      style={styles.faqQuestionRow}
                      activeOpacity={0.7}
                      onPress={() => toggleFaq(item.id)}
                    >
                      <Text style={styles.faqQuestion}>{item.question}</Text>
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.textTertiary}
                      />
                    </TouchableOpacity>
                    {expanded && <Text style={styles.faqAnswer}>{item.answer}</Text>}
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Contact us</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={() => handleEmail(SUPPORT_EMAIL, 'Pump Bros support', SUPPORT_EMAIL)}
              >
                <View style={styles.rowIconWrap}>
                  <Ionicons name="mail-outline" size={18} color={colors.iconDark} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowLabel}>Email support</Text>
                  <Text style={styles.rowDescription}>{SUPPORT_EMAIL}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, styles.rowLastAction]}
                activeOpacity={0.7}
                onPress={() => handleEmail(BUG_EMAIL, 'Bug report', BUG_EMAIL)}
              >
                <View style={styles.rowIconWrap}>
                  <Ionicons name="bug-outline" size={18} color={colors.iconDark} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowLabel}>Report a bug</Text>
                  <Text style={styles.rowDescription}>Tell us what went wrong.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.versionText}>Pump Bros v{APP_VERSION}</Text>
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
  sectionTitle: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  settingsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  faqRow: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingRight: 10,
  },
  faqAnswer: {
    fontSize: type.body,
    color: colors.textSecondary,
    lineHeight: 19,
    paddingBottom: 14,
    paddingRight: 24,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  rowLastAction: {
    borderBottomWidth: 0,
  },
  versionText: {
    fontSize: type.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 20,
  },
});
