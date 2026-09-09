import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, Alert } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';
import { openMailto } from '../utils/mailto';
import { useToast } from '../context/ToastContext';
import LegalDocumentsModal, { LegalDocument } from './LegalDocumentsModal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDeleteAccount: () => void;
  deleting: boolean;
}

interface InfoRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}

const DATA_ROWS: InfoRow[] = [
  {
    icon: 'mail-outline',
    label: 'Account info',
    description: 'Your email address and sign-in method (email, Google, or Apple).',
  },
  {
    icon: 'person-outline',
    label: 'Profile & activity',
    description: 'Your profile, workouts, XP, streaks, split, groups, and related activity.',
  },
  {
    icon: 'chatbubble-outline',
    label: 'Messages & images',
    description: 'Direct/group messages and images you choose to send or upload.',
  },
  {
    icon: 'notifications-outline',
    label: 'Push notification token',
    description: 'If you allow notifications, we store a device token so requested alerts can be delivered.',
  },
  {
    icon: 'bug-outline',
    label: 'Crash & performance data',
    description: 'Sentry receives error, crash, and performance/session telemetry when enabled.',
  },
];

const SUPPORT_EMAIL = 'pumpbrossupport@gmail.com';

export default function PrivacyDataScreen({ visible, onClose, onDeleteAccount, deleting }: Props) {
  const [legalVisible, setLegalVisible] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument>('privacy');
  const { showToast } = useToast();

  const handleRequestExport = () => {
    Alert.alert(
      'Request your data',
      "There's no automatic export yet — email us and we'll send a copy of your account data.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Email us',
          onPress: async () => {
            const opened = await openMailto(SUPPORT_EMAIL, 'Data export request');
            if (!opened) {
              showToast(`No email app found — copied ${SUPPORT_EMAIL} to clipboard`, 'info');
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Privacy & data</Text>
            <View style={styles.headerBtn} />
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>What we store</Text>
            <View style={styles.settingsCard}>
              {DATA_ROWS.map((row, index) => (
                <View
                  key={row.label}
                  style={[styles.row, index === DATA_ROWS.length - 1 && styles.rowLast]}
                >
                  <View style={styles.rowIconWrap}>
                    <Ionicons name={row.icon} size={18} color={colors.iconDark} />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowDescription}>{row.description}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.footnote}>
              We don't collect your location, contacts, or browsing activity outside the app, and
              we never sell your data or use it for advertising.
            </Text>

            <Text style={styles.sectionTitle}>Manage your data</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={() => { setLegalDocument('privacy'); setLegalVisible(true); }}
              >
                <View style={styles.rowIconWrap}>
                  <Ionicons name="document-text-outline" size={18} color={colors.iconDark} />
                </View>
                <Text style={styles.actionLabel}>Privacy policy</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={() => { setLegalDocument('terms'); setLegalVisible(true); }}
              >
                <View style={styles.rowIconWrap}>
                  <Ionicons name="document-text-outline" size={18} color={colors.iconDark} />
                </View>
                <Text style={styles.actionLabel}>Terms of Service</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleRequestExport}
              >
                <View style={styles.rowIconWrap}>
                  <Ionicons name="download-outline" size={18} color={colors.iconDark} />
                </View>
                <Text style={styles.actionLabel}>Request a data export</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionRow, styles.rowLastAction]}
                activeOpacity={0.7}
                onPress={onDeleteAccount}
                disabled={deleting}
              >
                <View style={[styles.rowIconWrap, styles.rowIconWrapDanger]}>
                  <Ionicons name="trash-outline" size={18} color="#E0483E" />
                </View>
                <Text style={styles.actionLabelDanger}>
                  {deleting ? 'Deleting…' : 'Delete account'}
                </Text>
                {!deleting && <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
      </Modal>

      <LegalDocumentsModal
        visible={legalVisible}
        onClose={() => setLegalVisible(false)}
        initialDocument={legalDocument}
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
  rowIconWrapDanger: {
    borderColor: '#F3D6D3',
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
  footnote: {
    fontSize: type.caption,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 12,
    marginHorizontal: 4,
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
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionLabelDanger: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#E0483E',
  },
  policySection: {
    marginBottom: 22,
  },
  policyHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  policyBody: {
    fontSize: type.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
