import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HapticTouchableOpacity as TouchableOpacity } from './Haptic';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, type } from '../theme';

export type LegalDocument = 'privacy' | 'terms';

const SUPPORT_EMAIL = 'pumpbrossupport@gmail.com';

const PRIVACY_SECTIONS = [
  ['Who is responsible for your information',
    `Pump Bros is the service described in this policy. Contact ${SUPPORT_EMAIL} about privacy, account, or data requests.\n\nThe current codebase does not identify the operator's legal entity name or registered postal address. Those details must be confirmed before publication where required.`],
  ['Information we collect',
    `Account and authentication: email/password account information, plus name and email made available by Google or Apple when you use those sign-in methods.\n\nProfile: username, display name, profile picture, initials, generated profile color, XP, workout streaks, workout split configuration, and notification preferences.\n\nWorkout activity: workout category (strength, cardio, or other), XP earned, and logged time. The supplied schema does not store sets, reps, weights, heart rate, GPS, or detailed workout duration.\n\nSocial activity: friend requests, friendships, groups, group membership, group names, invite codes, group privacy settings, and timestamps.\n\nMessages: direct and group message text, sender/recipient or group, creation time, read/delivery timestamps for direct messages, group read cursors, image URLs, and per-user hidden-message records.\n\nPush notifications: if permitted, an Expo push token, platform, and update time. Notification previews can include sender/group names and message previews.\n\nError reporting: Sentry is enabled in the supplied production environment. The app associates Sentry events with the signed-in user's ID, email (when available), and display name, and may attach technical error context.`],
  ['How we use information',
    `We use information to authenticate accounts, operate profiles, workouts, XP, streaks, leaderboards, friends, groups, messaging, images, and requested notifications; troubleshoot crashes and technical errors; maintain security; and respond to support or privacy requests.`],
  ['Third-party services',
    `Pump Bros currently integrates with Supabase for authentication, database, realtime features and storage; Google and Apple for sign-in; Sentry for error/crash/performance telemetry; and Expo's push service for notifications.\n\nNo Stripe, RevenueCat, Apple In-App Purchase, Google Play Billing, OpenAI, Anthropic, Gemini, or other remote generative-AI/payment SDK was found in the supplied codebase.`],
  ['Sharing',
    `Information is shared with service providers only as needed to operate the features described above. Your profile and social information can also be visible to other signed-in users as required by the app's social features, and messages are visible to their intended participants or group members.\n\nWe do not sell personal information or use it for targeted advertising in the supplied implementation. Information may be disclosed when required by law or to protect users, the service, or others.`],
  ['Storage and security',
    `The supplied Supabase schema uses authentication and Row Level Security for the main application tables. Profile pictures and chat images are stored in Supabase Storage. The current schema makes the avatar and chat-image buckets publicly readable by URL, so those URLs should not be treated as private links.`],
  ['Retention and deletion',
    `Account-linked database records are designed to be removed when you delete your account. Exact retention periods for Supabase backups/provider logs, Sentry events, and Apple/Google records cannot be verified from this codebase and must be confirmed in the relevant provider settings before publication.\n\nThe audit also found that Storage objects are not relationally cascaded by account deletion. The deployed deletion flow should be verified to remove the user's own profile and chat image objects before release.`],
  ['Your rights',
    `Depending on applicable law, you may have rights to access, correct, delete, restrict, object to, or port your personal information, withdraw consent where applicable, and complain to a data-protection authority. The app's “Request a data export” action opens an email to ${SUPPORT_EMAIL}; there is no automated export endpoint in the supplied implementation.`],
  ['Children and age',
    `Pump Bros is not designed as a children's service. The current codebase has no age-verification or age-gating mechanism. The operator must confirm the intended minimum age and any parental-consent process before launch.`],
  ['User-generated content',
    `Pump Bros includes direct messages, group messages, profiles, and uploaded images. The supplied codebase does not currently implement an in-app reporting system, user-blocking system, or server-side objectionable-content filter. Users can remove friends and hide/delete messages, and can contact ${SUPPORT_EMAIL} with concerns. These missing moderation controls are an App Store readiness issue.`],
  ['Contact',
    `${SUPPORT_EMAIL}\n\nThe operator's legal name and registered postal address are not identifiable from the supplied codebase and should be confirmed before publication.`],
];

const TERMS_SECTIONS = [
  ['The service',
    `Pump Bros lets users create profiles, log workouts, earn XP and streaks, configure workout splits, compare progress with friends and simulated trainer profiles, manage friendships and groups, send direct/group messages including images, receive optional push notifications, and delete their account.`],
  ['No paid subscriptions or payments currently implemented',
    `The supplied codebase contains no subscription, in-app purchase, payment-processing, Stripe, RevenueCat, Apple In-App Purchase, or Google Play Billing implementation. If paid features are introduced, the purchase terms, prices, renewals, cancellations, and billing rules must be added before those features are offered.`],
  ['Eligibility',
    `Pump Bros is not designed as a children's service, and the current app does not verify age. You must be legally capable of entering these Terms in your jurisdiction, or use the service with the involvement/authorization required by applicable law. The final minimum-age rule must be confirmed before launch.`],
  ['Your account',
    `You are responsible for activity through your account and for protecting your credentials. You may authenticate using email/password, Google, or Apple, subject to the relevant provider's terms.`],
  ['Your content',
    `You keep your rights in content you submit. You grant Pump Bros the limited rights necessary to host, store, transmit, reproduce, and display your profile pictures, chat images, and messages so the requested features work. Do not upload content you do not have the right to share.`],
  ['Acceptable use',
    `Do not use Pump Bros for unlawful activity, threats, harassment, stalking, bullying, impersonation, hateful or exploitative content, spam, malicious code, unauthorized access, scraping, infringement of another person's rights, or unauthorized manipulation of XP, streaks, leaderboards, or other service functionality.`],
  ['Messages and groups',
    `Messages and group content may be seen by their intended recipients or group members. Recipients can copy or otherwise retain content. A sender can delete their own message and a user can hide messages from their own view, but deletion cannot undo copies already retained by another person.`],
  ['Fitness and medical disclaimer',
    `Pump Bros is a fitness tracking and social app, not a medical service. Workout, XP, streak, split, and trainer information is not medical advice. Use appropriate judgment and seek professional advice where appropriate.`],
  ['Simulated trainers',
    `Trainer Joe, Trainer Max, and Trainer Leo are simulated local competitors. Their activity is generated on-device from fixed configuration. They are not real users and are not a remote generative-AI service in the current implementation.`],
  ['Third-party services',
    `Pump Bros depends on Supabase, Apple, Google, Sentry, and Expo's push-notification infrastructure. Those services may have their own terms and privacy practices.`],
  ['Suspension and termination',
    `You may stop using Pump Bros and delete your account in the app. We may restrict or terminate access when reasonably necessary for serious or repeated violations, security threats, fraud, unlawful activity, or legal obligations, subject to mandatory legal protections.`],
  ['Changes and availability',
    `Features may change, be suspended, or be discontinued. We do not guarantee uninterrupted or error-free availability. We may update these Terms when the service or legal requirements change.`],
  ['User-generated content and moderation',
    `The supplied implementation does not currently contain in-app reporting, user blocking, or server-side objectionable-content filtering. Users can contact ${SUPPORT_EMAIL} with concerns. These controls should be implemented before App Store submission because Pump Bros contains user-generated content.`],
  ['Liability and consumer rights',
    `To the maximum extent permitted by law, Pump Bros is provided on an “as available” basis and the operator is not liable for indirect or consequential losses. Nothing in these Terms limits rights or remedies that cannot legally be limited, including mandatory consumer protections.`],
  ['Governing law',
    `The mandatory laws that apply to you remain applicable. The supplied codebase does not identify the operator's legal entity or registered address, so the final governing-law and jurisdiction clause must be confirmed before publication.`],
  ['Contact',
    `${SUPPORT_EMAIL}\n\nConfirm the operator's legal name, registered address, governing law, and jurisdiction before publishing these Terms.`],
];

export default function LegalDocumentsModal({
  visible,
  onClose,
  initialDocument = 'privacy',
}: {
  visible: boolean;
  onClose: () => void;
  initialDocument?: LegalDocument;
}) {
  const [document, setDocument] = React.useState<LegalDocument>(initialDocument);

  React.useEffect(() => {
    if (visible) setDocument(initialDocument);
  }, [visible, initialDocument]);

  const sections = document === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{document === 'privacy' ? 'Privacy policy' : 'Terms of Service'}</Text>
            <View style={styles.headerBtn} />
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, document === 'privacy' && styles.tabActive]}
              onPress={() => setDocument('privacy')}
            >
              <Text style={[styles.tabText, document === 'privacy' && styles.tabTextActive]}>Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, document === 'terms' && styles.tabActive]}
              onPress={() => setDocument('terms')}
            >
              <Text style={[styles.tabText, document === 'terms' && styles.tabTextActive]}>Terms</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.documentMeta}>Pump Bros · Effective September 7, 2026</Text>
            {sections.map(([heading, body]) => (
              <View key={heading} style={styles.section}>
                <Text style={styles.sectionHeading}>{heading}</Text>
                <Text style={styles.sectionBody}>{body}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 6, paddingBottom: 10, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: type.sectionTitle, fontWeight: '800', color: colors.textPrimary },
  tabs: {
    marginHorizontal: 20, marginBottom: 4, padding: 3, borderRadius: radius.pill,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder,
    flexDirection: 'row', ...shadow.card,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.iconDark },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  tabTextActive: { color: colors.iconOnDark },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48 },
  documentMeta: { fontSize: 12, color: colors.textTertiary, marginBottom: 18 },
  section: { marginBottom: 22 },
  sectionHeading: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 7 },
  sectionBody: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
});
