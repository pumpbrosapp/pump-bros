# Privacy Policy — Pump Bros

**App:** Pump Bros
**Operated by:** David Oliver Fairfax-Jones, an individual (non-trader)
**Country:** Luxembourg
**iOS bundle identifier:** `com.pumpbros.app`
**Contact:** [pumpbrossupport@gmail.com](mailto:pumpbrossupport@gmail.com)
**Effective date:** September 23, 2026

This Privacy Policy explains how Pump Bros processes information when you use the Pump Bros mobile application.

## 1. Who is responsible for your information

Pump Bros is currently developed and operated by **David Oliver Fairfax-Jones**, an individual based in **Luxembourg**, on a non-trader basis. Pump Bros is not currently operated through a registered company or other business entity, so this Policy does not list a company name, business registration number, VAT number, or business/residential address. You can contact us at **[pumpbrossupport@gmail.com](mailto:pumpbrossupport@gmail.com)** about privacy, account, or data requests.

## 2. Information we collect

We collect and process information that the app actually uses to provide its current features.

### Account and authentication information

Depending on how you sign in, the app uses:

* your email address for email/password authentication; and
* information returned through Sign in with Apple, including the name and email made available by Apple. Apple may allow you to use a private relay email address.

Authentication is handled through Supabase Auth in the configured production code. The app also stores a local authentication/session fallback when Supabase is not configured; that fallback is intended for an unconfigured/local environment and should not be relied on as the production account system.

### Profile information

Your Pump Bros profile can contain:

* username;
* display name;
* profile picture;
* initials and a generated profile color;
* XP and workout streak information;
* your selected workout split name and weekly split configuration; and
* notification preferences.

Your profile is visible to signed-in Pump Bros users to the extent required by the app's social features. In particular, the current database permits authenticated users to read profile information needed for friend discovery, leaderboards, groups, and chats.

### Workout and fitness activity

The app stores:

* workout category (`strength`, `cardio`, or `other`);
* the XP earned for a logged workout;
* the time the workout was logged;
* your total XP;
* your calculated day streak; and
* your current streak-week representation.

Pump Bros does **not** store individual sets, repetitions, weights, heart-rate data, GPS/location data, or a detailed workout duration.

### Friends and social activity

The app stores friend requests and friendships, including the users involved, request status, and timestamps.

The app also stores group information, including group name, leader, invite code, privacy mode (`code`, `invite_only`, or `public`), membership, and membership timestamps.

Public groups can be discoverable to signed-in users. Group members can see the group's roster and group activity as implemented by the app.

If a group's leader sets a group photo, it is stored in Supabase Storage.

### Messages and images

Pump Bros currently supports direct messages and group messages. Depending on the message, the service stores:

* message text;
* the sender and recipient or group;
* message creation time;
* delivery and read timestamps for direct messages;
* group read-cursor timestamps;
* message image URLs where a user sends an image; and
* records indicating that a user has hidden a message from their own view.

A sender can delete their own direct or group message for everyone. A user can also hide messages from their own view.

Profile pictures, group photos, and chat images are stored in Supabase Storage.

### Blocking, reporting, and content filtering

Pump Bros lets you block another user. Blocking is stored as a directed record between the two accounts (who blocked whom) and stops the blocked account from sending you direct messages or friend requests in either direction. Only you can see your own block list; a blocked user is not told that you blocked them.

Pump Bros also lets you report a user's profile or a specific direct/group message, choosing from a fixed list of reasons (for example, harassment, spam, a fake profile, or inappropriate content). A report you submit stores the reason, your account, the reported account, and, if applicable, the specific message reported. Reports are reviewed by Pump Bros administrators, who can update a report's status (pending, reviewed, or resolved). The person you report is not notified that you reported them. Only you and Pump Bros administrators can see a report you submit; other users cannot.

Before a direct or group message is sent, the app checks the message text (and profile names) against a basic, fixed word list and blocks the send if it matches. This is a first-pass automated filter, not a complete moderation system, and does not review images.

### Push notifications

If you grant notification permission, Pump Bros can obtain and store an Expo push token for the device, together with its platform and update time.

The current push system can send notifications for:

* friend requests;
* accepted friend requests;
* direct messages; and
* group messages.

Notification settings are stored both locally and, for server-side delivery, in the profile's notification preferences. Message notification previews can include the sender's display name, message text (truncated in the push function), or an indication that a photo was sent. Group notifications can include the group name and sender/message preview.

You can turn push notifications off in Pump Bros' notification settings and/or through your device settings.

### Error, crash, and performance reporting

The production environment contains a Sentry DSN, and the app is wired to use **Sentry** when that DSN is configured.

Sentry is used for crash/error reporting and performance/session telemetry. The app may associate Sentry events with the signed-in user's:

* Pump Bros user ID; and
* display name, when available.

Some captured error events may also include technical context such as a component stack, operation name, user ID, workout type, group ID, or conversation-related identifiers. Sentry is not configured as an advertising analytics system, and no advertising SDK or App Tracking Transparency implementation is used.

The Sentry project configured in the production environment sends events to Sentry's EU (Germany) data-ingestion region.

### Simulated trainer profiles

Pump Bros includes three locally simulated trainer competitors (Trainer Joe, Trainer Max, and Trainer Leo). Their displayed XP and streaks are generated deterministically on the device from fixed configuration and the user's account start date.

No external AI model, AI API, or AI provider is used for these trainer profiles. Despite the in-app "AI trainer" terminology, these trainer profiles are currently simulated local data rather than a remote generative-AI service.

## 3. Information we do not currently collect through the implemented app

The app does not implement collection of:

* precise location or GPS data;
* contacts/address books;
* advertising identifiers or personalized advertising;
* browsing activity outside Pump Bros;
* microphone recordings;
* camera recordings;
* health-device or wearable data;
* payment-card information;
* subscription billing information; or
* a remote generative-AI service.

The app does request photo-library access when you choose a profile picture or chat image, and it uploads the selected image to Pump Bros' Supabase Storage.

At sign-up, the app asks for your date of birth to calculate whether you meet the 16-and-older age requirement (see Section 12). That date of birth is used only for that on-device calculation and is not transmitted to or stored by Pump Bros' servers.

## 4. Why we use information

We use information to:

* create and authenticate your account;
* confirm, at sign-up, that you meet Pump Bros' 16-and-older age requirement;
* maintain your profile;
* provide workout logging, XP, streaks, splits, and leaderboards;
* enable friend requests and friendships;
* provide direct and group messaging;
* store and display profile and chat images;
* operate groups;
* send requested push notifications;
* let you block accounts you don't want contact from, and review reports of accounts or content;
* filter obviously prohibited language out of messages and profile names before they're sent or saved;
* troubleshoot crashes and technical errors;
* maintain security and prevent misuse; and
* respond to support and privacy requests.

We do not use the implemented data flows for advertising or sale of personal information.

## 5. Third-party services

The current codebase integrates with the following external services:

### Supabase

Supabase provides the configured authentication, PostgreSQL database, realtime functionality, database functions, and object storage used by Pump Bros.

### Apple

Sign in with Apple can be used to authenticate an account. Apple controls its own processing of information under its own terms and privacy practices.

### Sentry

Sentry receives error, crash, and performance/session telemetry when Sentry is enabled. The app may send user context such as ID and display name.

### Expo push service

Pump Bros sends push notification requests through Expo's push service. The payload can contain notification titles, sender/group names, message previews, and routing data needed to open the relevant Pump Bros feature.

## 6. Sharing

Pump Bros shares information with service providers only as needed to operate the implemented features, including the providers described above.

Your profile information, friendship information, leaderboard information, group information, and messages are also made available to other Pump Bros users according to the app's social permissions. For example, messages are available to the participants of a direct conversation, and group messages are available to members of the relevant group.

A report you submit is visible to you and to Pump Bros administrators, not to the reported user. Blocking another user is visible only to you.

We may disclose information when required by law, legal process, or to protect the rights, safety, security, and integrity of Pump Bros, our users, or others.

We do not sell personal information and do not use personal information for targeted advertising.

## 7. International processing

Pump Bros is operated from Luxembourg. Third-party providers may process information in countries other than the country where you live. The configured Sentry project's ingest endpoint indicates an EU (Germany) processing region.

Supabase and other service providers may process information in accordance with their own infrastructure and data-processing arrangements. Where required by applicable law, appropriate safeguards will be used for international transfers of personal information.

## 8. Security

The Pump Bros service uses authentication and Row Level Security policies for the main application tables. The database also uses server-side functions for sensitive operations such as workout XP calculation and account deletion.

No security measure is completely guaranteed. You are responsible for keeping your login credentials secure and for notifying Pump Bros if you believe your account has been compromised.

## 9. Retention

For account data, Pump Bros is designed to retain information while your account is active and to remove account-linked database records when you delete your account.

Account deletion is designed to remove the user's profile, friendships, friend requests, workouts, messages, group memberships, group content, push-token records, block-list entries, submitted reports, and related database records.

Profile pictures and chat-image files associated with the deleted account are also removed as part of account deletion where supported by the deployed deletion process.

Group-avatar files may require separate cleanup where a group is deleted, and retention of those files may therefore differ from account-linked database records.

Some information may remain temporarily in provider backups, logs, or other technical systems according to the applicable provider's retention practices.

Sentry events may also be retained according to the retention settings configured for the Sentry project.

## 10. Account deletion

You can initiate deletion from **Profile → Privacy & data → Delete account**.

The current deletion function is designed to permanently remove the account and associated database records.

Account deletion also removes the account's associated profile and chat-image files where supported by the deployed storage-deletion process.

If you participate in direct conversations, deleting your account may also remove messages associated with those conversations according to the application's deletion behavior. If you are the leader of a group, deleting your account may also result in the associated group being deleted according to the application's current behavior.

Deletion may be subject to limited legal retention obligations where applicable.

## 11. Your privacy rights

Depending on where you live and the law that applies, you may have rights including:

* access to personal information;
* correction of inaccurate information;
* deletion;
* restriction of processing;
* objection to certain processing;
* data portability;
* withdrawal of consent where processing relies on consent; and
* the right to complain to a competent data-protection authority.

Pump Bros currently provides an in-app **Request a data export** action that opens an email request to **[pumpbrossupport@gmail.com](mailto:pumpbrossupport@gmail.com)**. There is no automated self-service export endpoint.

To exercise a privacy right, contact **[pumpbrossupport@gmail.com](mailto:pumpbrossupport@gmail.com)** and describe the request. We may need reasonable information to verify that the request concerns your account.

For users in the European Economic Area, GDPR rights apply where the GDPR applies. The legal basis for each processing activity depends on the circumstances and may include performance of the account/service contract, legitimate interests, compliance with legal obligations, or consent where consent is required.

## 12. Children and age requirements

**Pump Bros requires users to be at least 16 years old.**

At sign-up, the app asks for your date of birth and uses it to calculate whether you meet the minimum age requirement. The date of birth is used only for this on-device calculation and is not transmitted to or stored by Pump Bros' servers.

The age check is based on the date of birth entered by the user and is not identity-document verification.

If you believe that someone under 16 has created an account, please contact **[pumpbrossupport@gmail.com](mailto:pumpbrossupport@gmail.com)** so that the account can be reviewed and removed where appropriate.

## 13. User-generated content, blocking, and reporting

Pump Bros contains user-generated content through direct messages, group messages, profile information, and uploaded images.

The app provides blocking and reporting features. Users can block other accounts, report profiles or messages, remove friends, leave groups, and delete or hide messages where supported.

Reports are reviewed by Pump Bros administrators. We aim to review reports within **48 hours**, although actual response times may vary depending on the nature and volume of reports.

The app also uses a basic fixed-word-list filter for message text and profile names. This filter does not review images and is not a complete moderation system.

Users can contact **[pumpbrossupport@gmail.com](mailto:pumpbrossupport@gmail.com)** for safety concerns or support with content or account issues.

## 14. Changes to this Policy

We may update this Policy when Pump Bros' features, processing activities, providers, or legal obligations change. The effective date at the top of this Policy will be updated when the Policy changes.

If a change materially affects how we process personal information, we will provide additional notice where required by law.

## 15. Contact

For privacy, account, deletion, data-access, or support requests:

**[pumpbrossupport@gmail.com](mailto:pumpbrossupport@gmail.com)**

Pump Bros is operated by **David Oliver Fairfax-Jones**, an individual based in **Luxembourg**, on a non-trader basis.
