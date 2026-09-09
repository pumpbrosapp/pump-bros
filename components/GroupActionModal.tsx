import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useGroups } from '../context/GroupsContext';
import { colors, radius, shadow, type } from '../theme';
import { GroupPrivacy, PublicGroupSummary } from '../types';

type Mode = 'create' | 'join';
type JoinTab = 'code' | 'discover';

interface PrivacyOption {
  value: GroupPrivacy;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}

const PRIVACY_OPTIONS: PrivacyOption[] = [
  {
    value: 'code',
    label: 'Invite code',
    icon: 'key-outline',
    description: 'Anyone with the code can join instantly.',
  },
  {
    value: 'invite_only',
    label: 'Invite only',
    icon: 'lock-closed-outline',
    description: "No self-join — you add people from your friends list.",
  },
  {
    value: 'public',
    label: 'Public',
    icon: 'globe-outline',
    description: 'Listed for anyone to find and join, no code needed.',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function GroupActionModal({ visible, onClose }: Props) {
  const { createGroup, joinGroupByCode, listPublicGroups, joinPublicGroup } = useGroups();
  const [mode, setMode] = useState<Mode>('join');
  const [joinTab, setJoinTab] = useState<JoinTab>('discover');
  const [name, setName] = useState('');
  const [privacy, setPrivacy] = useState<GroupPrivacy>('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdPrivacy, setCreatedPrivacy] = useState<GroupPrivacy | null>(null);
  const [copied, setCopied] = useState(false);

  const [publicGroups, setPublicGroups] = useState<PublicGroupSummary[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  const reset = () => {
    setMode('join');
    setJoinTab('discover');
    setName('');
    setPrivacy('code');
    setCode('');
    setError(null);
    setSubmitting(false);
    setCreatedCode(null);
    setCreatedPrivacy(null);
    setCopied(false);
    setPublicGroups([]);
    setJoiningGroupId(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  useEffect(() => {
    if (!visible || mode !== 'join' || joinTab !== 'discover') return;
    let cancelled = false;
    setLoadingPublic(true);
    listPublicGroups()
      .then((groups) => {
        if (!cancelled) setPublicGroups(groups);
      })
      .finally(() => {
        if (!cancelled) setLoadingPublic(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, mode, joinTab, listPublicGroups]);

  const handleCreate = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createGroup(name, privacy);
    setSubmitting(false);
    if (result.ok) {
      setCreatedCode(result.inviteCode);
      setCreatedPrivacy(result.privacy);
    } else {
      setError(result.error);
    }
  };

  const handleJoin = async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await joinGroupByCode(code);
    setSubmitting(false);
    if (result.ok) {
      handleClose();
    } else {
      setError(result.error);
    }
  };

  const handleJoinPublic = async (groupId: string) => {
    if (joiningGroupId) return;
    setJoiningGroupId(groupId);
    setError(null);
    const result = await joinPublicGroup(groupId);
    setJoiningGroupId(null);
    if (result.ok) {
      handleClose();
    } else {
      setError(result.error);
    }
  };

  const handleCopyCode = async () => {
    if (!createdCode) return;
    await Clipboard.setStringAsync(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{createdCode ? 'Group created' : 'Groups'}</Text>
          <View style={styles.headerBtn} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {createdCode ? (
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark" size={28} color={colors.iconOnDark} />
                </View>
                <Text style={styles.successTitle}>"{name.trim()}" is ready</Text>

                {createdPrivacy === 'code' && (
                  <>
                    <Text style={styles.successSubtitle}>
                      Share this code with the people you want training with you. Anyone with it can join.
                    </Text>
                    <TouchableOpacity style={styles.codeChip} activeOpacity={0.85} onPress={handleCopyCode}>
                      <Text style={styles.codeChipText}>{createdCode}</Text>
                      <Ionicons
                        name={copied ? 'checkmark' : 'copy-outline'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {copied && <Text style={styles.copiedText}>Copied to clipboard</Text>}
                  </>
                )}

                {createdPrivacy === 'invite_only' && (
                  <Text style={styles.successSubtitle}>
                    Nobody can join on their own. Open the group and invite people from your friends list whenever
                    you're ready.
                  </Text>
                )}

                {createdPrivacy === 'public' && (
                  <Text style={styles.successSubtitle}>
                    Your group is listed for anyone to discover — they can join with one tap, no code needed.
                  </Text>
                )}

                <TouchableOpacity style={styles.submitBtn} activeOpacity={0.85} onPress={handleClose} hapticStyle="confirm">
                  <Text style={styles.submitBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.tabRow}>
                  <TouchableOpacity
                    style={[styles.tabBtn, mode === 'join' && styles.tabBtnActive]}
                    activeOpacity={0.85}
                    onPress={() => switchMode('join')}
                  >
                    <Text style={[styles.tabText, mode === 'join' && styles.tabTextActive]}>Join</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabBtn, mode === 'create' && styles.tabBtnActive]}
                    activeOpacity={0.85}
                    onPress={() => switchMode('create')}
                  >
                    <Text style={[styles.tabText, mode === 'create' && styles.tabTextActive]}>Create</Text>
                  </TouchableOpacity>
                </View>

                {mode === 'create' ? (
                  <View style={styles.form}>
                    <Text style={styles.introTitle}>Start a new group</Text>
                    <Text style={styles.introSubtitle}>
                      Give it a name and choose how people can get in.
                    </Text>
                    <View style={styles.fieldWrap}>
                      <Text style={styles.fieldLabel}>Group name</Text>
                      <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                        placeholder="Weekly Crew"
                        placeholderTextColor={colors.textTertiary}
                        autoCapitalize="words"
                        returnKeyType="done"
                        maxLength={40}
                        onSubmitEditing={handleCreate}
                      />
                    </View>

                    <View style={styles.fieldWrap}>
                      <Text style={styles.fieldLabel}>Who can join</Text>
                      {PRIVACY_OPTIONS.map((option) => {
                        const selected = privacy === option.value;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[styles.privacyOption, selected && styles.privacyOptionSelected]}
                            activeOpacity={0.85}
                            onPress={() => setPrivacy(option.value)}
                            hapticStyle="none"
                          >
                            <View style={[styles.privacyIcon, selected && styles.privacyIconSelected]}>
                              <Ionicons
                                name={option.icon}
                                size={18}
                                color={selected ? colors.iconOnDark : colors.textSecondary}
                              />
                            </View>
                            <View style={styles.privacyTextWrap}>
                              <Text style={styles.privacyLabel}>{option.label}</Text>
                              <Text style={styles.privacyDescription}>{option.description}</Text>
                            </View>
                            <Ionicons
                              name={selected ? 'radio-button-on' : 'radio-button-off'}
                              size={20}
                              color={selected ? colors.iconDark : colors.textTertiary}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {error && <Text style={styles.errorText}>{error}</Text>}
                    <TouchableOpacity
                      style={[styles.submitBtn, !name.trim() && styles.submitBtnDisabled]}
                      activeOpacity={0.85}
                      onPress={handleCreate}
                      disabled={!name.trim() || submitting}
                      hapticStyle="confirm"
                    >
                      {submitting ? (
                        <ActivityIndicator color={colors.iconOnDark} />
                      ) : (
                        <Text style={styles.submitBtnText}>Create group</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.form}>
                    <Text style={styles.introTitle}>Join a group</Text>

                    <View style={styles.tabRow}>
                      <TouchableOpacity
                        style={[styles.tabBtn, joinTab === 'discover' && styles.tabBtnActive]}
                        activeOpacity={0.85}
                        onPress={() => {
                          setJoinTab('discover');
                          setError(null);
                        }}
                      >
                        <Text style={[styles.tabText, joinTab === 'discover' && styles.tabTextActive]}>Discover</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.tabBtn, joinTab === 'code' && styles.tabBtnActive]}
                        activeOpacity={0.85}
                        onPress={() => {
                          setJoinTab('code');
                          setError(null);
                        }}
                      >
                        <Text style={[styles.tabText, joinTab === 'code' && styles.tabTextActive]}>By code</Text>
                      </TouchableOpacity>
                    </View>

                    {joinTab === 'code' ? (
                      <>
                        <Text style={styles.introSubtitle}>
                          Enter the invite code someone shared with you.
                        </Text>
                        <View style={styles.fieldWrap}>
                          <Text style={styles.fieldLabel}>Invite code</Text>
                          <TextInput
                            style={[styles.input, styles.codeInput]}
                            value={code}
                            onChangeText={(v) => setCode(v.toUpperCase())}
                            placeholder="ABC123"
                            placeholderTextColor={colors.textTertiary}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            returnKeyType="done"
                            maxLength={12}
                            onSubmitEditing={handleJoin}
                          />
                        </View>
                        {error && <Text style={styles.errorText}>{error}</Text>}
                        <TouchableOpacity
                          style={[styles.submitBtn, !code.trim() && styles.submitBtnDisabled]}
                          activeOpacity={0.85}
                          onPress={handleJoin}
                          disabled={!code.trim() || submitting}
                          hapticStyle="confirm"
                        >
                          {submitting ? (
                            <ActivityIndicator color={colors.iconOnDark} />
                          ) : (
                            <Text style={styles.submitBtnText}>Join group</Text>
                          )}
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <Text style={styles.introSubtitle}>Public groups anyone can join, no code needed.</Text>
                        {error && <Text style={styles.errorText}>{error}</Text>}
                        {loadingPublic ? (
                          <View style={styles.discoverEmpty}>
                            <ActivityIndicator color={colors.textSecondary} />
                          </View>
                        ) : publicGroups.length === 0 ? (
                          <View style={styles.discoverEmpty}>
                            <Ionicons name="globe-outline" size={22} color={colors.textTertiary} />
                            <Text style={styles.emptyText}>No public groups to discover right now.</Text>
                          </View>
                        ) : (
                          publicGroups.map((group) => (
                            <View key={group.id} style={styles.discoverRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.discoverName} numberOfLines={1}>
                                  {group.name}
                                </Text>
                                <Text style={styles.discoverMeta} numberOfLines={1}>
                                  {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} · led by{' '}
                                  {group.leaderName}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={[styles.joinBtn, joiningGroupId === group.id && styles.submitBtnDisabled]}
                                activeOpacity={0.85}
                                onPress={() => handleJoinPublic(group.id)}
                                disabled={!!joiningGroupId}
                                hapticStyle="confirm"
                              >
                                {joiningGroupId === group.id ? (
                                  <ActivityIndicator color={colors.iconOnDark} />
                                ) : (
                                  <Text style={styles.joinBtnText}>Join</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          ))
                        )}
                      </>
                    )}
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
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.cardSmall,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 12,
    marginTop: 8,
    gap: 12,
  },
  privacyOptionSelected: {
    borderColor: colors.iconDark,
  },
  privacyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.navActiveBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyIconSelected: {
    backgroundColor: colors.iconDark,
  },
  privacyTextWrap: {
    flex: 1,
  },
  privacyLabel: {
    fontSize: type.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  privacyDescription: {
    fontSize: type.caption,
    color: colors.textTertiary,
    marginTop: 2,
    lineHeight: 16,
  },
  errorText: {
    fontSize: type.body,
    color: '#E0483E',
    fontWeight: '600',
  },
  submitBtn: {
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
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 24,
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
    marginTop: 6,
  },
  discoverEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: type.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  discoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 10,
    ...shadow.card,
  },
  discoverName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  discoverMeta: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 1,
  },
  joinBtn: {
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.iconOnDark,
  },
});
