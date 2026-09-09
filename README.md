# Pump Bros (prototype)

A basic React Native + Expo + TypeScript prototype, styled after the StepUp
app screenshot, but tracking XP instead of steps.

## What's included

- Header bar
- Big XP counter for "today"
- Friends leaderboard (rank, avatar, name, XP, last-active time), with
  medal icons for the top 3
- Bottom nav with three tabs: Home, Progress (raised dumbbell button), and
  Profile (icons only, no labels)
- Progress screen: today's workout check-in + day streak, a weekly progress
  line chart (react-native-svg) with a peak-value callout, and a daily
  average minutes card — all placeholder data

Everything else from the reference screenshot (settings gear, bell/chat
icons, date-range tabs, streak/mileage/calorie stats, group tabs) was left
out on purpose, per the current scope.

## Run it

1. Install dependencies:
   ```
   npm install
   ```
2. Start the dev server:
   ```
   npx expo start
   ```
3. Scan the QR code with the Expo Go app (iOS or Android), or press `i`
   for the iOS simulator / `a` for the Android emulator.

## Project structure

```
App.tsx                     - root component, tab switching
screens/HomeScreen.tsx      - XP counter + leaderboard
screens/WorkoutScreen.tsx   - workout progress screen (check-in, streak, chart)
screens/ProfileScreen.tsx   - placeholder profile screen
components/LeaderboardRow.tsx
components/BottomNav.tsx
data/friends.ts             - mock data
data/workout.ts             - mock workout stats
theme.ts                    - shared design tokens
types.ts
```

## Next steps (not built yet)

- Real navigation library (React Navigation) if more screens get added
- Any of the features intentionally omitted above

## Accounts, sign-in, and account deletion setup

The app now has real account infrastructure, but three things need your
own credentials/accounts to fully turn on — until then it degrades
gracefully to local, device-only storage.

### 1. Supabase (accounts, friends, workout/XP sync)

1. Create a free project at https://supabase.com.
2. Open the SQL editor and run `supabase/schema.sql` (in this repo) once,
   in full. This creates the `profiles`, `friendships`, and `workouts`
   tables, their row-level security policies, and the account-deletion
   function.
3. In Project Settings -> API, copy the **Project URL** and the **anon
   public** key into a `.env` file at the repo root (copy `.env.example`
   to `.env` and fill in the two values). Do **not** use the
   `service_role` key anywhere in the app. Restart `expo start` after
   editing `.env` so Metro picks up the change.
4. That's it — email/password sign-up, friend search/add, and XP/streak
   sync will all start writing to Supabase instead of local storage.

Using a separate Supabase project per environment (dev/staging/prod) is
just a matter of giving each build profile its own `.env` / env vars —
see `config/supabase.ts` for details.

Cost: Supabase's free tier covers this comfortably for a small app
(500MB database, 50k monthly active users). No cost until you outgrow it.

**Admin access (report review):** there's no in-app way to make someone
an admin. To let an account see and act on submitted reports (Profile ->
Reports (Admin), only visible to admins), run this once in the SQL
editor for that account's user id:
`update public.profiles set is_admin = true where id = '<user-uuid>';`

### 2. Google sign-in

Already wired up (`config/auth.ts`) — needs your own OAuth client IDs
from a free Google Cloud project. See the comments at the top of
`config/auth.ts` for exact steps. No cost.

### 3. Apple sign-in

Already fully wired up in code (`expo-apple-authentication`, the
`usesAppleSignIn` capability in `app.json`, and the button in
`AuthScreen.tsx`). Apple requires offering Sign in with Apple if you
offer Google (or any other third-party) sign-in on iOS, and this
satisfies that. Three things to do, no more code:

1. **Set your real bundle identifier.** `app.json` currently has
   `ios.bundleIdentifier: "com.example.pumpbros"` — change this to your own
   (e.g. `com.yourcompany.pumpbros`) before doing the two steps below, since
   both depend on it.
2. **Apple Developer portal** (needs a paid Apple Developer Program
   account, $99/year): create/select the App ID matching your bundle
   identifier and turn on the "Sign In with Apple" capability. If you
   build with EAS (`eas build`), this is handled for you automatically
   from `usesAppleSignIn: true` in `app.json` — you can skip doing it by
   hand.
3. **Supabase dashboard:** Authentication -> Providers -> enable
   **Apple**, and paste your bundle identifier into its "Client IDs"
   field so Supabase can verify the token came from your app. This step
   is easy to miss — without it, native Apple sign-in fails with an
   audience-mismatch error even though everything on the app side is
   correct. Leave the "Secret Key" field blank; that's only needed for
   the web OAuth redirect flow, not native sign-in.

### 4. Account deletion

Done — Profile -> Account -> "Delete account" calls a Postgres function
(`delete_own_account`, created by `supabase/schema.sql`) that removes the
auth user and cascades to delete their profile, friendships, and
workouts. This satisfies Apple/Google's requirement that apps with
account creation also offer in-app account deletion.

### 5. Push notifications (friend requests, messages, group chat)

Friend requests, DMs, and group chat used to only update live while the
app was open (Supabase Realtime), so anything that arrived while it was
backgrounded or closed just sat there until the next launch. That's now
backed by real push delivery too — see `NOTIFICATIONS_SETUP.md` for the
one-time setup (an EAS project link plus two Supabase secrets). Until
that's done, the app runs exactly as before with no crashes or errors —
push is purely additive.

### 6. Privacy policy

A starting draft is in `PRIVACY_POLICY.md`. Host it somewhere with a
public URL (a GitHub Pages page, a Notion page shared publicly, etc.)
and use that URL in App Store Connect and Google Play Console — both
require one for apps that collect account data. Read it over and adjust
the specifics (contact email, any analytics you add later, etc.) before
publishing.

## Building & submitting

`eas.json` defines three build profiles (`development`, `preview`,
`production`) — that's what turns `eas build` from "which kind of build
do you mean?" into a one-word command. If you haven't linked an EAS
project yet, do that first (`npx eas init` — also required for push,
see `NOTIFICATIONS_SETUP.md`), then:

- **`eas build --profile development`** — an internal-distribution
  build with the dev client UI (Expo's dev menu, fast refresh against a
  Metro server) instead of your production JS bundle. Requires the
  `expo-dev-client` package, which isn't installed by default:
  `npx expo install expo-dev-client` once, then this profile works.
- **`eas build --profile preview`** — a real, store-shaped build (no
  dev client) distributed internally (a link you can install from
  directly, no App Store/Play Console needed) — for TestFlight-style
  testing before you're ready to submit.
- **`eas build --profile production --platform ios|android`** — the
  build you actually submit. `autoIncrement: true` bumps the build
  number for you on every run, so you don't have to track it by hand.
  Follow with **`eas submit --profile production`** to upload straight
  to App Store Connect / Play Console, or upload the build artifact by
  hand from either dashboard.

Any of these needs the Apple ($99/year) and/or Google Play (one-time
$25) developer account set up on their end first — EAS can't create
those for you.
