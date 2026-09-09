import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFriends } from '../context/FriendsContext';
import { colors, radius, shadow, type } from '../theme';

type Tab = 'share' | 'enter';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Which tab to land on the next time this opens — both ProfileScreen's
  // and SocialScreen's "Invite friends" entry points default to 'share'
  // since that's the primary growth action; the "Enter a code" tab is
  // one tap away for anyone who already has a friend's code. Only
  // consulted on the visible false->true transition, same convention as
  // GroupDetailModal's initialTab.
  initialTab?: Tab;
}

export default function PersonalInviteModal({ visible, onClose, initialTab = 'share' }: Props) {
  const { myInviteCode, useInviteCode } = useFriends();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedName, setAddedName] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTab(initialTab);
      setCopied(false);
      setCode('');
      setError(null);
      setAddedName(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = () => {
    onClose();
  };

  const handleCopyCode = async () => {
    if (!myInviteCode) return;
    await Clipboard.setStringAsync(myInviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!myInviteCode) return;
    try {
      await Share.share({
        message: `Train with me on Pump Bros! Use my invite code ${myInviteCode} to add me as a friend — or just tap this link if you've got the app: pumpbros://invite/${myInviteCode}`,
      });
    } catch {
      // Share sheet can be dismissed/cancelled; nothing to recover from.
    }
  };

  const handleSubmitCode = async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await useInviteCode(code);
    setSubmitting(false);
    if (result.ok) {
      setAddedName(result.friend.name);
    } else {
      setError(result.error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Invite a friend</Text>
            <View style={styles.headerBtn} />
          </View>

          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {addedName ? (
                <View style={styles.successWrap}>
                  <View style={styles.successIcon}>
                    <Ionicons name="checkmark" size={28} color={colors.iconOnDark} />
                  </View>
                  <Text style={styles.successTitle}>You're now friends with {addedName}!</Text>
                  <Text style={styles.successSubtitle}>They've been added straight to your friends list.</Text>
                  <TouchableOpacity style={styles.submitBtn} activeOpacity={0.85} onPress={handleClose} hapticStyle="confirm">
                    <Text style={styles.submitBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.tabRow}>
                    <TouchableOpacity
                      style={[styles.tabBtn, tab === 'share' && styles.tabBtnActive]}
                      activeOpacity={0.85}
                      onPress={() => {
                        setTab('share');
                        setError(null);
                      }}
                    >
                      <Text style={[styles.tabText, tab === 'share' && styles.tabTextActive]}>Your code</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tabBtn, tab === 'enter' && styles.tabBtnActive]}
                      activeOpacity={0.85}
                      onPress={() => {
                        setTab('enter');
                        setError(null);
                      }}
                    >
                      <Text style={[styles.tabText, tab === 'enter' && styles.tabTextActive]}>Enter a code</Text>
                    </TouchableOpacity>
                  </View>

                  {tab === 'share' ? (
                    <View style={styles.form}>
                      <Text style={styles.introTitle}>Share your invite code</Text>
                      <Text style={styles.introSubtitle}>
                        Anyone who uses it is added as your friend right away — no request to accept.
                      </Text>

                      {myInviteCode ? (
                        <>
                          <TouchableOpacity style={styles.codeChip} activeOpacity={0.85} onPress={handleCopyCode}>
                            <Text style={styles.codeChipText}>{myInviteCode}</Text>
                            <Ionicons
                              name={copied ? 'checkmark' : 'copy-outline'}
                              size={18}
                              color={colors.textSecondary}
                            />
                          </TouchableOpacity>
                          {copied && <Text style={styles.copiedText}>Copied to clipboard</Text>}

                          <TouchableOpacity style={styles.submitBtn} activeOpacity={0.85} onPress={handleShare} hapticStyle="confirm">
                            <Ionicons name="share-outline" size={18} color={colors.iconOnDark} style={styles.shareIcon} />
                            <Text style={styles.submitBtnText}>Share invite link</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text style={styles.introSubtitle}>Loading your code…</Text>
                      )}
                    </View>
                  ) : (
                    <View style={styles.form}>
                      <Text style={styles.introTitle}>Have a friend's code?</Text>
                      <Text style={styles.introSubtitle}>
                        Enter it below and you'll be added as friends instantly.
                      </Text>
                      <View style={styles.fieldWrap}>
                        <Text style={styles.fieldLabel}>Invite code</Text>
                        <TextInput
                          style={[styles.input, styles.codeInput]}
                          value={code}
                          onChangeText={(text) => {
                            setCode(text);
                            setError(null);
                          }}
                          placeholder="ABC123"
                          placeholderTextColor={colors.textTertiary}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          returnKeyType="done"
                          maxLength={12}
                          onSubmitEditing={handleSubmitCode}
                        />
                      </View>

                      {error && <Text style={styles.errorText}>{error}</Text>}

                      <TouchableOpacity
                        style={[styles.submitBtn, (!code.trim() || submitting) && styles.submitBtnDisabled]}
                        activeOpacity={0.85}
                        onPress={handleSubmitCode}
                        disabled={!code.trim() || submitting}
                        hapticStyle="confirm"
                      >
                        <Text style={styles.submitBtnText}>{submitting ? 'Adding…' : 'Add friend'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
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
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.navActiveBg,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 24,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.card,
    ...shadow.card,
  },
  tabText: {
    fontSize: type.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  form: {
    gap: 14,
  },
  introTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  introSubtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 20,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  input: {
    height: 50,
    borderRadius: radius.cardSmall,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.textPrimary,
  },
  codeInput: {
    letterSpacing: 2,
    fontWeight: '700',
  },
  errorText: {
    fontSize: type.body,
    color: '#E0483E',
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: colors.iconOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
  shareIcon: {
    marginRight: 8,
  },
  successWrap: {
    alignItems: 'center',
    paddingTop: 24,
    gap: 8,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  codeChipText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.textPrimary,
  },
  copiedText: {
    fontSize: type.caption,
    color: colors.textTertiary,
    marginTop: -6,
    textAlign: 'center',
  },
});
