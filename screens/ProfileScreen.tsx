import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, Alert, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { HapticTouchableOpacity as TouchableOpacity } from '../components/Haptic';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useWorkout } from '../context/WorkoutContext';
import { useFriends } from '../context/FriendsContext';
import { useTrainers } from '../context/TrainersContext';
import { useUser } from '../context/UserContext';
import { useSplit } from '../context/SplitContext';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { uploadAvatar } from '../utils/avatarUpload';
import { colors, radius, shadow, type } from '../theme';
import WorkoutSplitModal from '../components/WorkoutSplitModal';
import EditProfileScreen from '../components/EditProfileScreen';
import NotificationSettingsScreen from '../components/NotificationSettingsScreen';
import PrivacyDataScreen from '../components/PrivacyDataScreen';
import HelpSupportScreen from '../components/HelpSupportScreen';
import ManageTrainersScreen from '../components/ManageTrainersScreen';
import AdminReportsScreen from '../components/AdminReportsScreen';
import PersonalInviteModal from '../components/PersonalInviteModal';

interface SettingsRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const ACCOUNT_ROWS: SettingsRow[] = [
  { icon: 'person-outline', label: 'Edit profile' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'shield-checkmark-outline', label: 'Privacy & data' },
  { icon: 'help-circle-outline', label: 'Help & support' },
];

export default function ProfileScreen({ active = true }: { active?: boolean }) {
  const { dayStreak, xp } = useWorkout();
  const { friends, meId } = useFriends();
  const { visibleTrainers } = useTrainers();
  const { avatarUri, setAvatarUri, displayName, setDisplayName } = useUser();
  const { splitName, hasSplit } = useSplit();
  const { user, signOut, deleteAccount } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [notificationSettingsVisible, setNotificationSettingsVisible] = useState(false);
  const [privacyDataVisible, setPrivacyDataVisible] = useState(false);
  const [helpSupportVisible, setHelpSupportVisible] = useState(false);
  const [manageTrainersVisible, setManageTrainersVisible] = useState(false);
  const [adminReportsVisible, setAdminReportsVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (active) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [active]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }, []);

  // Keep the shared friends list in sync with the live XP total instead of
  // the static placeholder it used to carry for the signed-in user. AI
  // trainers count toward rank the same way they do on the Home
  // leaderboard, since it's the same combined board.
  const friendsWithLiveXp = friends.map((f) => (f.id === meId ? { ...f, xp } : f));
  const sortedFriends = [...friendsWithLiveXp, ...visibleTrainers].sort((a, b) => b.xp - a.xp);
  const currentUser = sortedFriends.find((f) => f.id === meId) ?? sortedFriends[0];
  const rank = sortedFriends.findIndex((f) => f.id === currentUser.id) + 1;
  const name = displayName ?? user?.displayName ?? currentUser.name;
  // Admins get an extra settings row that opens the report-management
  // screen. Nobody else sees it at all — this is purely an entry-point
  // gate; the actual access control lives in the reports table's RLS
  // policies (see supabase/schema.sql), not in what's rendered here.
  const accountRows: SettingsRow[] = user?.isAdmin
    ? [...ACCOUNT_ROWS, { icon: 'flag-outline', label: 'Reports (Admin)' }]
    : ACCOUNT_ROWS;

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account, friends, and workout history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await deleteAccount();
            } catch {
              Alert.alert('Something went wrong', 'Could not delete your account. Please try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const startEditingName = () => {
    setDraftName(name);
    setIsEditingName(true);
  };

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed.length > 0) {
      setDisplayName(trimmed);
    }
    setIsEditingName(false);
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
    // Show the picture right away using the local file — no reason to
    // make the person wait on a network round trip just to see their own
    // selection reflected.
    setAvatarUri(localUri);

    if (!isSupabaseConfigured || !user) {
      // No backend to upload to (local/demo mode) — the local URI is all
      // there is, so it only ever shows up on this device.
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
      // Swap the local file:// URI for the persisted, publicly-fetchable
      // URL — this is what other people's devices will actually load.
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

  const quickStats = [
    { key: 'xp', icon: 'flash' as const, value: xp.toLocaleString(), label: 'Total XP' },
    { key: 'streak', icon: 'flame' as const, value: `${dayStreak}`, label: 'Day streak' },
    { key: 'rank', icon: 'trophy' as const, value: `#${rank}`, label: 'Friend rank' },
  ];

  const { width: screenWidth } = Dimensions.get('window');
  const insets = useSafeAreaInsets();
  // Extend the gradient up by the status-bar inset so it reaches the true
  // top edge of the screen instead of stopping where the safe area begins.
  const gradientHeight = 340 + insets.top;

  return (
    <View style={styles.container}>
      <Svg
        style={styles.bgGradient}
        width={screenWidth}
        height={gradientHeight}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id="bgFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.backgroundGradientTop} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={screenWidth} height={gradientHeight} fill="url(#bgFade)" />
      </Svg>

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Ionicons name="person" size={13} color={colors.iconOnDark} />
          </View>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.iconDark}
            colors={[colors.iconDark]}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            {isEditingName ? (
              <TextInput
                style={styles.heroNameInput}
                value={draftName}
                onChangeText={setDraftName}
                onBlur={commitName}
                onSubmitEditing={commitName}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                maxLength={40}
              />
            ) : (
              <TouchableOpacity
                style={styles.heroNameRow}
                activeOpacity={0.7}
                onPress={startEditingName}
                hitSlop={6}
              >
                <Text style={styles.heroName}>{name}</Text>
                <Ionicons
                  name="create-outline"
                  size={15}
                  color={colors.textTertiary}
                  style={styles.heroNameEditIcon}
                />
              </TouchableOpacity>
            )}
            <Text style={styles.heroSub}>
              Rank #{rank} of {sortedFriends.length} · {xp.toLocaleString()} XP
            </Text>

            <View style={styles.heroBadgeRow}>
              <Ionicons name="flame" size={13} color={colors.iconDark} />
              <Text style={styles.heroBadgeText}>{dayStreak} day streak</Text>
            </View>
          </View>

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
              <View style={[styles.avatar, { backgroundColor: currentUser.color }]}>
                <Text style={styles.avatarText}>{currentUser.initials}</Text>
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarUploadOverlay}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color={colors.iconOnDark} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          {quickStats.map((stat) => (
            <View key={stat.key} style={styles.statChip}>
              <View style={styles.statIconWrap}>
                <Ionicons name={stat.icon} size={15} color={colors.iconDark} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity
              style={styles.settingsRow}
              activeOpacity={0.7}
              onPress={() => setSplitModalVisible(true)}
            >
              <Ionicons
                name="calendar-outline"
                size={20}
                color={colors.textPrimary}
                style={styles.settingsIcon}
              />
              <Text style={styles.settingsLabel}>Workout Split</Text>
              <Text style={styles.settingsValue} numberOfLines={1}>
                {hasSplit ? splitName ?? 'Custom' : 'Not set'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsRow, styles.settingsRowLast]}
              activeOpacity={0.7}
              onPress={() => setManageTrainersVisible(true)}
            >
              <Ionicons
                name="barbell-outline"
                size={20}
                color={colors.textPrimary}
                style={styles.settingsIcon}
              />
              <Text style={styles.settingsLabel}>Manage Trainers</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite Friends</Text>
          <TouchableOpacity
            style={styles.inviteCard}
            activeOpacity={0.8}
            onPress={() => setInviteModalVisible(true)}
          >
            <View style={styles.inviteIconWrap}>
              <Ionicons name="person-add-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.inviteTextWrap}>
              <Text style={styles.inviteTitle}>Invite a friend</Text>
              <Text style={styles.inviteSubtitle}>
                Share your invite code — anyone who uses it is added as your friend instantly.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {user?.email && (
            <View style={styles.accountEmailRow}>
              <Ionicons
                name={
                  user.provider === 'apple'
                    ? 'logo-apple'
                    : user.provider === 'google'
                    ? 'logo-google'
                    : 'mail-outline'
                }
                size={14}
                color={colors.textSecondary}
              />
              <Text style={styles.accountEmailText}>{user.email}</Text>
            </View>
          )}
          <View style={styles.settingsCard}>
            {accountRows.map((row, index) => (
              <TouchableOpacity
                key={row.label}
                style={[
                  styles.settingsRow,
                  index === accountRows.length - 1 && styles.settingsRowLast,
                ]}
                activeOpacity={0.7}
                onPress={
                  row.label === 'Edit profile'
                    ? () => setEditProfileVisible(true)
                    : row.label === 'Notifications'
                    ? () => setNotificationSettingsVisible(true)
                    : row.label === 'Privacy & data'
                    ? () => setPrivacyDataVisible(true)
                    : row.label === 'Help & support'
                    ? () => setHelpSupportVisible(true)
                    : row.label === 'Reports (Admin)'
                    ? () => setAdminReportsVisible(true)
                    : undefined
                }
              >
                <Ionicons
                  name={row.icon}
                  size={20}
                  color={colors.textPrimary}
                  style={styles.settingsIcon}
                />
                <Text style={styles.settingsLabel}>{row.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutCard} activeOpacity={0.7} onPress={handleLogout}>
            <Ionicons
              name="log-out-outline"
              size={20}
              color={colors.textPrimary}
              style={styles.settingsIcon}
            />
            <Text style={styles.logoutLabel}>Log out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutCard}
            activeOpacity={0.7}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={colors.textPrimary}
              style={styles.settingsIcon}
            />
            <Text style={styles.logoutLabel}>{deleting ? 'Deleting…' : 'Delete account'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <WorkoutSplitModal
        visible={splitModalVisible}
        onClose={() => setSplitModalVisible(false)}
      />

      <EditProfileScreen
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
      />

      <NotificationSettingsScreen
        visible={notificationSettingsVisible}
        onClose={() => setNotificationSettingsVisible(false)}
      />

      <PrivacyDataScreen
        visible={privacyDataVisible}
        onClose={() => setPrivacyDataVisible(false)}
        onDeleteAccount={handleDeleteAccount}
        deleting={deleting}
      />

      <HelpSupportScreen
        visible={helpSupportVisible}
        onClose={() => setHelpSupportVisible(false)}
      />

      <ManageTrainersScreen
        visible={manageTrainersVisible}
        onClose={() => setManageTrainersVisible(false)}
      />

      <AdminReportsScreen
        visible={adminReportsVisible}
        onClose={() => setAdminReportsVisible(false)}
      />

      <PersonalInviteModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        initialTab="share"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  header: {
    paddingBottom: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: type.pageTitle,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 24,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    ...shadow.card,
  },
  heroLeft: {
    flexShrink: 1,
    paddingRight: 12,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroNameEditIcon: {
    marginLeft: 6,
  },
  heroNameInput: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
    padding: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.iconDark,
    alignSelf: 'flex-start',
    minWidth: 80,
  },
  heroSub: {
    fontSize: type.label,
    color: colors.textSecondary,
    marginTop: 4,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 12,
  },
  heroBadgeText: {
    fontSize: type.caption,
    fontWeight: '700',
    color: colors.textPrimary,
    marginLeft: 5,
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
    ...shadow.card,
  },
  avatarUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 24,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  statChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.cardSmall,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginRight: 10,
    alignItems: 'flex-start',
    ...shadow.card,
  },
  statIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: type.statValue,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: type.sectionTitle,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...shadow.card,
  },
  inviteIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.ringTrack,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  inviteTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  inviteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  inviteSubtitle: {
    fontSize: type.label,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  settingsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  settingsRowLast: {
    borderBottomWidth: 0,
  },
  settingsIcon: {
    width: 26,
    marginRight: 14,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  settingsValue: {
    fontSize: type.body,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 8,
    maxWidth: 120,
  },
  accountEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginLeft: 2,
  },
  accountEmailText: {
    fontSize: type.label,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 10,
    ...shadow.card,
  },
  logoutLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E0483E',
  },
});
