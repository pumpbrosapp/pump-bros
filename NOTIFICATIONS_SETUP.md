# Push notifications setup

Friend requests, direct messages, and group chat now trigger real push
notifications, not just in-app Supabase Realtime updates. Realtime still
runs the same as before while the app is open (instant updates, no
polling delay); push is what covers the gap when the app is backgrounded
or fully closed.

Three things have to be true for a push to actually arrive:

1. The **client** has permission and a valid Expo push token registered
   (`lib/pushNotifications.ts`, wired into `App.tsx` via
   `context/PushNotificationsContext.tsx`) — this part is already done,
   no setup needed beyond installing the new dependencies.
2. Your Supabase project's database can reach the **Edge Function** that
   actually calls Expo's push API (`supabase/functions/send-push`).
3. Your app is linked to an **EAS project**, since `getExpoPushTokenAsync`
   needs a project ID to mint a token at all.

If you skip all of this, nothing breaks — the DB triggers in
`schema.sql` no-op safely, and the client detects it and reports it
(see the note under step 4) rather than silently doing nothing.
Realtime-while-open keeps working regardless.

## 1. Install the new dependencies

```
npm install
```

(`expo-notifications`, `expo-device`, and `expo-constants` were added to
`package.json`.)

## 2. Link an EAS project

```
npx eas init
```

This writes an EAS project ID into `app.json` under
`expo.extra.eas.projectId` — that's what `lib/pushNotifications.ts` reads
to request a push token. Free to do; you don't need to actually run an
EAS *build* to get this working in a dev client or a build you make
yourself, but EAS Build is the easiest path to a real device build with
push entitlements set up correctly (see step 4).

## 3. Deploy the Edge Function

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli).

```
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy send-push
```

No extra secrets to set on the function itself — it reads
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects
into every Edge Function automatically.

## 4. Point the database at the deployed function

This is the one step `schema.sql` can't do for you, since it needs your
project's own URL and service-role key — neither of which should be
hardcoded into a file that's checked into source control. In the
Supabase SQL editor, run:

```sql
select vault.create_secret(
  'https://<your-project-ref>.functions.supabase.co/send-push',
  'edge_function_url'
);

select vault.create_secret(
  '<your-service-role-key>',   -- Project Settings -> API -> service_role
  'edge_function_service_key'
);
```

(Find the service-role key in Project Settings -> API. Keep it out of
the app/client code entirely — it only ever lives in Vault and inside
the Edge Function's own environment.)

If you ever rotate the service-role key, update the secret with
`select vault.update_secret(...)` (see Supabase's Vault docs) rather
than re-running `create_secret`, which will error on a name that
already exists.

**If you skip this step**, don't expect to notice from the app just
running fine — permission, the token, and EAS can all be set up
correctly and pushes will still just never arrive. The client checks
for this itself (`push_backend_configured()`, called once per sign-in
from `PushNotificationsContext.tsx`) and reports it through the same
error-reporting path as any other caught error (Sentry if you've set
`EXPO_PUBLIC_SENTRY_DSN` in `.env`, otherwise a `console.error`)
— so it's worth actually watching your Sentry dashboard or logs the
first time you sign in after deploying, rather than assuming silence
means it worked.

## 5. Native push credentials (only needed for a real device build)

- **iOS**: EAS Build manages your APNs key for you automatically the
  first time you build — no separate Apple push certificate to create
  by hand, though you still need a paid Apple Developer account for any
  iOS build at all.
- **Android**: EAS Build manages Firebase Cloud Messaging credentials
  for you too by default (Expo's push service proxies FCM), so no
  `google-services.json` is required unless you later want to send FCM
  messages directly instead of through Expo's push API.

Push tokens can't be minted in the iOS Simulator or most Android
emulators — test on a real device.

## What's already wired up (no action needed)

- `push_tokens` table + RLS, `profiles.notification_prefs` column, and
  the triggers that fire on new friend requests, accepted friend
  requests, new DMs, and new group messages — all in `schema.sql`.
- Requesting permission, fetching the Expo push token, and keeping it
  in sync with Supabase (including removing it on sign-out) —
  `lib/pushNotifications.ts` + `context/PushNotificationsContext.tsx`.
- The toggles in Notification Settings now sync to
  `profiles.notification_prefs` (`components/NotificationSettingsScreen.tsx`),
  so the Edge Function honors the same on/off switches the user sees.
- Tapping a notification brings the app to the Social tab, where both
  DMs and group chats live (there's no deep-link-to-a-specific-thread
  routing yet — the app doesn't use a navigation/routing library at
  all, just tab-switching in `App.tsx`).
- A `push_backend_configured()` check that catches the step-4 Vault
  setup being skipped and reports it (Sentry, or `console.error` with
  no DSN set) the first time a device registers a token each session —
  see the note under step 4 above.
