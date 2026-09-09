import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useGroups } from '../context/GroupsContext';
import { uploadGroupAvatar } from '../utils/avatarUpload';
import { colors, radius, shadow, type } from '../theme';
import { Group, GroupPrivacy } from '../types';

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
  group: Group;
  meId: string;
  onInvitePress: () => void;
  onDeleted: () => void;
}

export default function GroupSettingsPanel({ group, meId, onInvitePress, onDeleted }: Props) {
  const { renameGroup, setGroupPrivacy, setGroupAvatar, regenerateInviteCode, removeMember, deleteGroup } =
    useGroups();
  const [name, setName] = useState(group.name);
  const [savingName, setSavingName] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Keep the field in sync if the group changes out from under us (e.g.
  // switching between groups without unmounting).
  useEffect(() => setName(group.name), [group.id, group.name]);

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow access to your photos to set a group picture.');
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

    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadGroupAvatar(group.id, result.assets[0].uri);
      const saveResult = await setGroupAvatar(group.id, publicUrl);
      if (!saveResult.ok) {
        Alert.alert("Couldn't update photo", saveResult.error);
      }
    } catch {
      Alert.alert('Upload failed', "Couldn't upload that photo. Try again from a stronger connection.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === group.name || savingName) return;
    setSavingName(true);
    const result = await renameGroup(group.id, trimmed);
    setSavingName(false);
    if (!result.ok) Alert.alert("Couldn't rename group", result.error);
  };

  const handlePrivacyChange = async (privacy: GroupPrivacy) => {
    if (privacy === group.privacy || privacyBusy) return;
    setPrivacyBusy(true);
    const result = await setGroupPrivacy(group.id, privacy);
    setPrivacyBusy(false);
    if (!result.ok) Alert.alert("Couldn't update", result.error);
  };

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateCode = () => {
    Alert.alert(
      'Generate a new code?',
      'The current invite code will stop working right away.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setRegenerating(true);
            const result = await regenerateInviteCode(group.id);
            setRegenerating(false);
            if (!result.ok) Alert.alert("Couldn't generate a new code", result.error);
          },
        },
      ]
    );
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    Alert.alert('Remove member?', `${memberName} will be removed from "${group.name}".`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemovingId(memberId);
          const result = await removeMember(group.id, memberId);
          setRemovingId(null);
          if (!result.ok) Alert.alert("Couldn't remove member", result.error);
        },
      },
    ]);
  };

  const handleDeleteGroup = () => {
    Alert.alert('Delete group?', `"${group.name}" will be deleted for everyone. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGroup(group.id);
          onDeleted();
        },
      },
    ]);
  };

  const otherMembers = group.members.filter((m) => m.id !== meId);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
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
          {group.avatarUrl ? (
            <Image
              source={{ uri: group.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.iconDark }]}>
              <Ionicons name="people" size={32} color={colors.iconOnDark} />
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
          <Text style={styles.changePhotoText}>Change group photo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>Group name</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor={colors.textTertiary}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleSaveName}
            onBlur={handleSaveName}
          />
          {name.trim() !== group.name && (
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveName} disabled={savingName} hapticStyle="confirm">
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>Who can join</Text>
        {PRIVACY_OPTIONS.map((option) => {
          const selected = group.privacy === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.privacyOption, selected && styles.privacyOptionSelected]}
              activeOpacity={0.85}
              disabled={privacyBusy}
              onPress={() => handlePrivacyChange(option.value)}
              hapticStyle="none"
            >
              <View style={[styles.privacyIcon, selected && styles.privacyIconSelected]}>
                <Ionicons name={option.icon} size={18} color={selected ? colors.iconOnDark : colors.textSecondary} />
              </View>
              <View style={styles.privacyTextWrap}>
                <Text style={styles.privacyLabel}>{option.label}</Text>
                <Text style={styles.privacyDescription}>{option.description}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={20} color={colors.iconDark} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {group.privacy === 'code' && (
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Invite code</Text>
          <View style={styles.codeRow}>
            <TouchableOpacity style={styles.codeChip} activeOpacity={0.85} onPress={handleCopyCode}>
              <Text style={styles.codeChipText}>{group.inviteCode}</Text>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.regenBtn}
              activeOpacity={0.85}
              onPress={handleRegenerateCode}
              disabled={regenerating}
              hapticStyle="none"
            >
              <Ionicons name="refresh" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {group.privacy === 'invite_only' && (
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Add people</Text>
          <TouchableOpacity style={styles.inviteRow} activeOpacity={0.85} onPress={onInvitePress}>
            <Ionicons name="person-add" size={16} color={colors.iconOnDark} />
            <Text style={styles.inviteRowText}>Invite from friends</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>Members ({group.members.length})</Text>
        {otherMembers.length === 0 ? (
          <Text style={styles.emptyMembersText}>It's just you in here so far.</Text>
        ) : (
          otherMembers.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              {member.avatarUrl ? (
                <Image
                  source={{ uri: member.avatarUrl }}
                  style={styles.memberAvatar}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.memberAvatar, { backgroundColor: member.color }]}>
                  <Text style={styles.memberAvatarText}>{member.initials}</Text>
                </View>
              )}
              <Text style={styles.memberName} numberOfLines={1}>
                {member.name}
              </Text>
              <TouchableOpacity
                style={styles.kickBtn}
                onPress={() => handleRemoveMember(member.id, member.name)}
                disabled={removingId === member.id}
                hitSlop={8}
                hapticStyle="none"
              >
                <Ionicons name="close" size={16} color="#E5484D" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.85} onPress={handleDeleteGroup} hapticStyle="none">
        <Ionicons name="trash-outline" size={16} color="#E5484D" />
        <Text style={styles.deleteBtnText}>Delete group</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 40,
    gap: 22,
  },
  fieldWrap: {
    gap: 8,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
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
  },
  changePhotoText: {
    marginTop: 12,
    fontSize: type.body,
    fontWeight: '700',
    color: colors.iconDark,
  },
  fieldLabel: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    height: 48,
    borderRadius: radius.cardSmall,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  saveBtnText: {
    color: colors.iconOnDark,
    fontSize: 13,
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
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.navActiveBg,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  codeChipText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  regenBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    paddingVertical: 12,
  },
  inviteRowText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.iconOnDark,
  },
  emptyMembersText: {
    fontSize: type.body,
    color: colors.textTertiary,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    gap: 10,
    ...shadow.card,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  kickBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FBE9E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: '#F4C6C4',
    paddingVertical: 13,
    marginTop: 4,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5484D',
  },
});
