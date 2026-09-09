import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '../context/UserContext';
import { useFriends } from '../context/FriendsContext';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { uploadAvatar } from '../utils/avatarUpload';
import { containsProhibitedLanguage, PROHIBITED_NAME_TITLE, PROHIBITED_NAME_MESSAGE } from '../utils/contentFilter';
import { colors, radius, shadow, type } from '../theme';
import ChangePasswordScreen from './ChangePasswordScreen';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function EditProfileScreen({ visible, onClose }: Props) {
  const { avatarUri, setAvatarUri, displayName, setDisplayName } = useUser();
  const { friends, meId } = useFriends();
  const { user, updateUsername, updateEmail } = useAuth();

  const currentUser = friends.find((f) => f.id === meId) ?? friends[0];
  const name = displayName ?? user?.displayName ?? currentUser?.name ?? '';
  const username = user?.username ?? currentUser?.username ?? '';
  const email = user?.email ?? '';

  const [draftName, setDraftName] = useState(name);
  const [draftUsername, setDraftUsername] = useState(username);
  const [draftEmail, setDraftEmail] = useState(email);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);

  // Re-seed the drafts every time the sheet is opened, so they always
  // start from whatever's actually saved rather than a stale value left
  // over from the last time it was open.
  useEffect(() => {
    if (visible) {
      setDraftName(name);
      setDraftUsername(username);
      setDraftEmail(email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const normalizedDraftUsername = draftUsername.trim().replace(/^@/, '');
  const normalizedDraftEmail = draftEmail.trim().toLowerCase();

  const isDirty =
    (draftName.trim().length > 0 && draftName.trim() !== name) ||
    (normalizedDraftUsername.length > 0 && normalizedDraftUsername !== username) ||
    (normalizedDraftEmail.length > 0 && normalizedDraftEmail !== email);

  // Only email/password accounts have a password to change — Google/Apple
  // sign-ins skip straight past this in AuthScreen and have nothing to
  // update here.
  const hasPassword = user?.provider === 'email';

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow access to your photos to set a profile picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    const localUri = result.assets[0].uri;
    // Show the picture right away using the local file, same as the
    // avatar ring on the Profile screen itself.
    setAvatarUri(localUri);

    if (!isSupabaseConfigured || !user) {
      return;
    }

    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadAvatar(user.id, localUri);
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (error) throw error;
      setAvatarUri(publicUrl);
    } catch {
      Alert.alert(
        'Upload failed',
        "Your profile picture is set on this device, but we couldn't upload it so friends won't see it yet. Try again from a stronger connection."
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      Alert.alert('Add a name', "Your name can't be empty.");
      return;
    }
    if (containsProhibitedLanguage(trimmed)) {
      Alert.alert(PROHIBITED_NAME_TITLE, PROHIBITED_NAME_MESSAGE);
      return;
    }
    if (normalizedDraftUsername.length > 0 && normalizedDraftUsername.length < 3) {
      Alert.alert('Username too short', 'Usernames need at least 3 characters.');
      return;
    }

    setSaving(true);
    // Each field is saved independently and reports its own failure, so a
    // taken username (say) doesn't stop the name or email change from
    // going through.
    const failures: string[] = [];

    try {
      setDisplayName(trimmed);
      if (isSupabaseConfigured && user) {
        const { error } = await supabase
          .from('profiles')
          .update({ display_name: trimmed })
          .eq('id', user.id);
        if (error) throw error;
      }
    } catch {
      failures.push("We couldn't save your name.");
    }

    if (normalizedDraftUsername.length > 0 && normalizedDraftUsername !== username) {
      try {
        await updateUsername(normalizedDraftUsername);
      } catch (err: any) {
        failures.push(err?.message || "We couldn't update your username.");
      }
    }

    let emailConfirmationPending = false;
    if (normalizedDraftEmail.length > 0 && normalizedDraftEmail !== email) {
      try {
        const { requiresConfirmation } = await updateEmail(normalizedDraftEmail);
        emailConfirmationPending = requiresConfirmation;
      } catch (err: any) {
        failures.push(err?.message || "We couldn't update your email.");
      }
    }

    setSaving(false);

    if (failures.length > 0) {
      Alert.alert('Some changes didn\u2019t save', failures.join('\n'));
      return;
    }

    if (emailConfirmationPending) {
      Alert.alert(
        'Check your inbox',
        `We sent a confirmation link to ${normalizedDraftEmail}. Your email will update once you confirm it.`
      );
    }

    handleClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <View style={styles.headerBtn} />
          </View>

          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.avatarSection}>
                <TouchableOpacity
                  style={styles.avatarRing}
                  activeOpacity={0.8}
                  onPress={handlePickAvatar}
                  disabled={uploadingAvatar}
                >
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatar}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: currentUser?.color ?? colors.iconDark }]}>
                      <Text style={styles.avatarText}>{currentUser?.initials ?? '?'}</Text>
                    </View>
                  )}
                  {uploadingAvatar && (
                    <View style={styles.avatarUploadOverlay}>
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  )}
                  <View style={styles.avatarEditBadge}>
                    <Ionicons name="camera" size={13} color={colors.iconOnDark} />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} hitSlop={6}>
                  <Text style={styles.changePhotoText}>Change photo</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Name</Text>
                <View style={styles.inputCard}>
                  <TextInput
                    style={styles.input}
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Your name"
                    placeholderTextColor={colors.textTertiary}
                    maxLength={40}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Username</Text>
                <View style={styles.inputCard}>
                  <Text style={styles.inputPrefix}>@</Text>
                  <TextInput
                    style={styles.input}
                    value={draftUsername}
                    onChangeText={(v) => setDraftUsername(v.replace(/^@/, ''))}
                    placeholder="username"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={20}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
              </View>

              {user?.email ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <View style={styles.inputCard}>
                    <TextInput
                      style={styles.input}
                      value={draftEmail}
                      onChangeText={setDraftEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.textTertiary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                </View>
              ) : null}

              {hasPassword && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TouchableOpacity
                    style={styles.inputCard}
                    activeOpacity={0.7}
                    onPress={() => setChangePasswordVisible(true)}
                  >
                    <Text style={styles.readOnlyText}>••••••••</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, (!isDirty || saving) && styles.saveBtnDisabled]}
              activeOpacity={0.85}
              onPress={handleSave}
              disabled={!isDirty || saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.iconOnDark} />
              ) : (
                <Text style={styles.saveBtnText}>Save changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>

      <ChangePasswordScreen
        visible={changePasswordVisible}
        onClose={() => setChangePasswordVisible(false)}
      />
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
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 30,
  },
  avatarUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
    ...shadow.card,
  },
  changePhotoText: {
    marginTop: 12,
    fontSize: type.body,
    fontWeight: '700',
    color: colors.iconDark,
  },
  fieldGroup: {
    marginTop: 22,
  },
  fieldLabel: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.cardSmall,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadow.card,
  },
  inputCardDisabled: {
    backgroundColor: colors.background,
  },
  inputPrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textTertiary,
    marginRight: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    padding: 0,
  },
  readOnlyText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
  },
  saveBtn: {
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: colors.iconOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
});
