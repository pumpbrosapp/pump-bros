# Privacy Policy — Pump Bros

**App:** Pump Bros  
**iOS bundle identifier:** `com.pumpbros.app`  
**Contact:** pumpbrossupport@gmail.com  
**Effective date:** September 7, 2026

This Privacy Policy explains how Pump Bros processes information when you use the Pump Bros mobile application.

## 1. Who is responsible for your information

Pump Bros is the service described in this Policy. You can contact us at **pumpbrossupport@gmail.com** about privacy, account, or data requests.

The codebase supplied for this audit does not identify the legal entity name or registered postal address of the operator. Those details are required to be confirmed and added before publication where applicable under law.

## 2. Information we collect

We collect and process information that the app actually uses to provide its current features.

### Account and authentication information

Depending on how you sign in, the app uses:

- your email address for email/password authentication;
- information returned through Google Sign-In, including the name and email made available by Google; and
- information returned through Sign in with Apple, including the name and email made available by Apple. Apple may allow you to use a private relay email address.

Authentication is handled through Supabase Auth in the configured production code. The app also stores a local authentication/session fallback when Supabase is not configured; that fallback is intended for an unconfigured/local environment and should not be relied on as the production account system.

### Profile information

Your Pump Bros profile can contain:

- username;
- display name;
- profile picture;
- initials and a generated profile color;
- XP and workout streak information;
- your selected workout split name and weekly split configuration; and
- notification preferences.

Your profile is visible to signed-in Pump Bros users to the extent required by the app's social features. In particular, the current database permits any authenticated user to read profile rows, while the app uses profiles for friend discovery, leaderboards, groups, and chats.

### Workout and fitness activity

The app stores:

- workout category (`strength`, `cardio`, or `other`);
- the XP earned for a logged workout;
- the time the workout was logged;
- your total XP;
- your calculated day streak; and
- your current streak-week representation.

Pump Bros does **not**, in the supplied schema, store individual sets, repetitions, weights, heart-rate data, GPS/location data, or a detailed workout duration.

### Friends and social activity

The app stores friend requests and friendships, including the users involved, request status, and timestamps.

The app also stores group information, including group name, leader, invite code, privacy mode (`code`, `invite_only`, or `public`), membership, and membership timestamps.

Public groups can be discoverable to signed-in users. Group members can see the group's roster and group activity as implemented by the app.

### Messages and images

Pump Bros currently supports direct messages and group messages. Depending on the message, the service stores:

- message text;
- the sender and recipient or group;
- message creation time;
- delivery and read timestamps for direct messages;
- group read-cursor timestamps;
- message image URLs where a user sends an image; and
- records indicating that a user has hidden a message from their own view.

A sender can delete their own direct or group message for everyone. A user can also hide messages from their own view.

Profile pictures and chat images are stored in Supabase Storage. The supplied schema makes both the avatar and chat-image buckets publicly readable by URL. Do not treat a chat-image URL as a private or access-controlled link.

### Push notifications

If you grant notification permission, Pump Bros can obtain and store an Expo push token for the device, together with its platform and update time.

The current push system can send notifications for:

- friend requests;
- accepted friend requests;
- direct messages; and
- group messages.

Notification settings are stored both locally and, for server-side delivery, in the profile's notification preferences. Message notification previews can include the sender's display name, message text (truncated in the push function), or an indication that a photo was sent. Group notifications can include the group name and sender/message preview.

You can turn push notifications off in Pump Bros' notification settings and/or through your device settings.

### Error, crash, and performance reporting

The supplied production environment contains a Sentry DSN, and the codebase is wired to use **Sentry** when that DSN is configured.

Sentry is used for crash/error reporting and performance/session telemetry. The code explicitly associates Sentry events with the signed-in user's:

- Pump Bros user ID;
- email address, when available; and
- display name, when available.

Some captured error events also include technical context such as a component stack, operation name, user ID, workout type, group ID, or conversation-related identifiers. Sentry is not configured as an advertising analytics system in the supplied code, and no advertising SDK or App Tracking Transparency implementation was found.

The exact Sentry retention period, data-region configuration, and any organization-level processing settings cannot be verified from this codebase and must be confirmed in the Sentry project before publication.

### Simulated trainer profiles

Pump Bros includes three locally simulated trainer competitors (Trainer Joe, Trainer Max, and Trainer Leo). Their displayed XP and streaks are generated deterministically on the device from fixed configuration and the user's account start date.

No external AI model, AI API, or AI provider was found in the supplied codebase. Despite the in-app "AI trainer" terminology, these trainer profiles are currently simulated local data rather than a remote generative-AI service.

## 3. Information we do not currently collect through the implemented app

The supplied code does not implement collection of:

- precise location or GPS data;
- contacts/address books;
- advertising identifiers or personalized advertising;
- browsing activity outside Pump Bros;
- microphone recordings;
- camera recordings;
- health-device or wearable data;
- payment-card information;
- subscription billing information; or
- a remote generative-AI service.

The app does request photo-library access when you choose a profile picture or chat image, and it uploads the selected image to Pump Bros' Supabase Storage.

## 4. Why we use information

We use information to:

- create and authenticate your account;
- maintain your profile;
- provide workout logging, XP, streaks, splits, and leaderboards;
- enable friend requests and friendships;
- provide direct and group messaging;
- store and display profile and chat images;
- operate groups;
- send requested push notifications;
- troubleshoot crashes and technical errors;
- maintain security and prevent misuse; and
- respond to support and privacy requests.

We do not use the implemented data flows for advertising or sale of personal information.

## 5. Third-party services

The current codebase integrates with the following external services:

### Supabase

Supabase provides the configured authentication, PostgreSQL database, realtime functionality, database functions, and object storage used by Pump Bros.

### Google

Google Sign-In can be used to authenticate an account. Google controls its own processing of information under its own terms and privacy practices.

### Apple

Sign in with Apple can be used to authenticate an account. Apple controls its own processing of information under its own terms and privacy practices.

### Sentry

Sentry receives error, crash, and performance/session telemetry when Sentry is enabled. The supplied code explicitly sends user context such as ID, email, and display name.

### Expo push service

Pump Bros sends push notification requests through Expo's push service. The payload can contain notification titles, sender/group names, message previews, and routing data needed to open the relevant Pump Bros feature.

No Stripe, RevenueCat, Apple In-App Purchase, Google Play Billing, OpenAI, Anthropic, Gemini, or other generative-AI/payment SDK was found in the supplied codebase.

## 6. Sharing

Pump Bros shares information with service providers only as needed to operate the implemented features, including the providers described above.

Your profile information, friendship information, leaderboard information, group information, and messages are also made available to other Pump Bros users according to the app's social permissions. For example, messages are available to the participants of a direct conversation, and group messages are available to members of the relevant group.

We may disclose information when required by law, legal process, or to protect the rights, safety, security, and integrity of Pump Bros, our users, or others.

We do not sell personal information and do not use personal information for targeted advertising in the supplied implementation.

## 7. International processing

Third-party providers may process information in countries other than the country where you live. The supplied code does not establish the actual data-region configuration selected in Supabase or Sentry, nor the exact transfer mechanisms applicable to each provider.

Those provider-region and transfer settings must be verified before publication if you offer Pump Bros in jurisdictions with cross-border transfer requirements.

## 8. Security

The supplied Supabase schema uses authentication and Row Level Security policies for the main application tables. The database also uses server-side functions for sensitive operations such as workout XP calculation and account deletion.

No security measure is completely guaranteed. You are responsible for keeping your login credentials secure and for notifying Pump Bros if you believe your account has been compromised.

## 9. Retention

For account data, Pump Bros is designed to retain information while your account is active and to remove account-linked database records when you delete your account.

The implemented account-deletion function deletes the authenticated user's `auth.users` record, which cascades through the supplied relational schema to the user's profile, friendships, friend requests, workouts, messages, group memberships, group content, push-token records, and related database records.

The codebase does not establish exact retention periods for:

- Supabase backups or provider-level logs;
- Sentry events and session/performance data;
- provider authentication records maintained by Apple or Google; or
- copies that may remain temporarily in technical backups.

Those retention periods must be confirmed in the relevant provider consoles and documented before publication.

## 10. Account deletion

You can initiate deletion from **Profile → Privacy & data → Delete account**.

The current deletion function is designed to permanently remove the account and associated database records. The supplied database schema does not establish a user-facing recovery period.

Before production release, the operator should verify that the deployed deletion function also removes the user's own Supabase Storage objects (profile and chat images) and that provider-side backups follow the intended deletion lifecycle. The codebase audit identified storage objects as the one area that is not relationally cascaded by account deletion.

Deletion may be subject to limited legal retention obligations where applicable.

## 11. Your privacy rights

Depending on where you live and the law that applies, you may have rights including:

- access to personal information;
- correction of inaccurate information;
- deletion;
- restriction of processing;
- objection to certain processing;
- data portability;
- withdrawal of consent where processing relies on consent; and
- the right to complain to a competent data-protection authority.

Pump Bros currently provides an in-app **Request a data export** action that opens an email request to **pumpbrossupport@gmail.com**. There is no automated self-service export endpoint in the supplied implementation.

To exercise a privacy right, contact **pumpbrossupport@gmail.com** and describe the request. We may need reasonable information to verify that the request concerns your account.

For users in the European Economic Area, GDPR rights apply where the GDPR applies. The legal basis for each processing activity depends on the circumstances and may include performance of the account/service contract, legitimate interests, compliance with legal obligations, or consent where consent is required.

## 12. Children and age requirements

Pump Bros is not designed as a children's service.

The supplied codebase contains **no age-verification or age-gating mechanism**. Therefore, the operator must confirm the intended minimum age and any parental-consent process before launch.

If Pump Bros is offered directly to children or processes children's data on a consent basis, additional requirements can apply under applicable law. In the EU, GDPR Article 8 sets a default age of 16 for certain consent-based information-society services, while Member States may lower that threshold to no less than 13.

## 13. User-generated content, blocking, and reporting

Pump Bros contains user-generated content through direct messages, group messages, profile information, and uploaded images.

The supplied codebase does **not** contain an implemented user-reporting system, user-blocking system, or server-side objectionable-content filtering system. Users can delete/hide messages and can remove friends or leave groups, but those controls are not equivalent to a platform-wide block/report/moderation system.

This is a material App Store readiness issue. Apple requires apps with user-generated content to provide filtering, reporting with timely responses, blocking abusive users, and published contact information. These controls should be implemented and tested before App Store submission.

## 14. Changes to this Policy

We may update this Policy when Pump Bros' features, processing activities, providers, or legal obligations change. The effective date at the top of this Policy will be updated when the Policy changes.

If a change materially affects how we process personal information, we will provide additional notice where required by law.

## 15. Contact

For privacy, account, deletion, data-access, or support requests:

**pumpbrossupport@gmail.com**

**Important publication item:** the operator's legal name and registered postal address are not identifiable from the supplied codebase and should be confirmed before publishing this Policy.
