# Pump Bros Legal / Privacy Audit — September 7, 2026

## Scope

Audited the supplied Pump Bros source archive, including React Native/Expo code, authentication flows, Sentry integration, push notifications, chat/groups, storage helpers, `supabase/schema.sql`, Supabase Edge Function `send-push`, app configuration, and existing privacy-policy text.

The archive contains a Supabase schema and migration-style SQL, but no live Supabase dashboard/database state. Therefore this audit verifies the supplied schema/code, not the currently deployed database.

## Implemented data categories verified

- Supabase Auth account identity: email and authentication provider information.
- Google/Apple sign-in information made available by those providers.
- Profile: username, display name, avatar URL, initials, generated color.
- Fitness: workout type, XP earned, logged timestamp, total XP, streaks, split name/days.
- Social: friendships and friend requests.
- Groups: group name, leader, invite code, privacy mode, membership and timestamps.
- Direct messages: text/image URL, sender/receiver, created time, delivery/read timestamps.
- Group messages: text/image URL, sender/group, created time, group read cursor.
- Per-user hidden-message records.
- Push tokens and notification preferences.
- Sentry user context and error/performance/session telemetry.

## Third-party services verified

- Supabase: Auth, Postgres/database functions, Realtime, Storage.
- Google: sign-in.
- Apple: sign-in.
- Sentry: crash/error/performance/session telemetry when the configured DSN is present. The supplied `.env` contains a Sentry DSN.
- Expo push service: push notification delivery.

No payment/subscription SDK, Stripe, RevenueCat, Apple IAP, Google Play Billing, OpenAI, Anthropic, Gemini, or other remote generative-AI SDK was found.

The "AI trainer" profiles are local deterministic simulations in `data/trainers.ts`, not remote AI.

## Account deletion

The schema provides `delete_own_account()` and the client calls it from the in-app Delete account flow.

The audit identified that Supabase Storage objects are not relationally cascaded from account deletion. The supplied schema has therefore been updated so the deletion function explicitly removes the deleting user's own `avatars` and `chat-images` objects before deleting `auth.users`.

**Deployment check required:** the uploaded archive does not prove that this revised function has been applied to the live Supabase project. Run/deploy the revised schema before release and test deletion end-to-end.

## Major App Store blocker: user-generated content safety

Pump Bros contains user-generated content through direct messages, group messages, profiles, and uploaded images.

The supplied code does **not** implement:

1. an in-app report-content/user mechanism;
2. a user-blocking mechanism; or
3. an objectionable-content filtering/moderation mechanism.

Removing friends, hiding messages, deleting one's own messages, and emailing support are not equivalent to a full report/block/filter system.

Apple's current App Review Guideline 1.2 requires apps with user-generated content/social networking services to include filtering, reporting with timely responses, blocking abusive users, and published contact information.

**Status: NOT App Store-ready until these controls are implemented and tested.**

## Privacy publication blockers / verification items

1. **Legal operator identity:** the codebase gives the support email but does not identify the legal entity/registered postal address. Confirm these before publication.
2. **Public Privacy Policy URL:** Apple requires a Privacy Policy link in App Store Connect metadata and inside the app. The app now exposes the full policy in-app, but a publicly reachable HTTPS policy URL still needs to be hosted and entered in App Store Connect.
3. **Terms URL:** host the Terms at a stable public HTTPS URL if you intend to use it in store metadata/review materials.
4. **Live Supabase state:** the archive contains schema SQL but not live database state. Confirm the deployed schema, RLS policies, storage policies, Edge Function, triggers, and deletion function match the audited files.
5. **Sentry retention/data region:** exact organization settings are not visible in source code. Confirm retention and data-region/cross-border transfer settings.
6. **Supabase region/retention:** exact project region, backups, logs, and provider retention cannot be verified from source.
7. **Age control:** no age gate/verification exists. Confirm the intended minimum age and any required parental-consent flow before launch.
8. **Storage privacy:** `avatars` and `chat-images` are publicly readable buckets. A URL can therefore be accessed without normal application authentication. This must be an intentional design decision; private signed URLs would be safer for chat images.
9. **Privacy rights export:** the current "Request a data export" flow opens an email; there is no automated export endpoint.
10. **Terms acceptance:** the sign-up screen now presents links to the Terms and Privacy Policy, but there is no separately persisted acceptance record in the database.

## Files added/updated

- `PRIVACY_POLICY.md` — complete implementation-grounded Privacy Policy.
- `TERMS_OF_SERVICE.md` — complete implementation-grounded Terms of Service.
- `components/LegalDocumentsModal.tsx` — full Privacy Policy and Terms accessible in-app.
- `components/PrivacyDataScreen.tsx` — links to both documents and uses the requested support email.
- `screens/AuthScreen.tsx` — sign-up screen now exposes Terms and Privacy Policy before account creation.
- `components/HelpSupportScreen.tsx` — support/bug-report contact changed to `pumpbrossupport@gmail.com`.
- `supabase/schema.sql` — account deletion now explicitly removes the deleting user's own avatar/chat-image storage objects.

## Legal basis / law note

The Privacy Policy describes rights and GDPR-relevant processing at a practical level, but it does not invent a legal entity, address, DPO, provider retention period, provider data region, or transfer mechanism that cannot be verified from the archive.

This is deliberate: those facts need to be confirmed from the actual business/provider configuration before publication.

## Final status

**Legal documents:** substantially completed and integrated in-app.

**Production/App Store submission:** **not yet cleared**. The remaining material blockers are the user-generated-content moderation controls, public policy hosting, legal operator details, live Supabase/deletion verification, and provider retention/region verification.
