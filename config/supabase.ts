// Supabase configuration.
//
// Pump Bros uses Supabase for accounts, friends, and workout/XP sync across
// devices. You need your own free Supabase project — there's no way to
// ship this without one:
//
//   1. Go to https://supabase.com and create a free project.
//   2. In the project, open the SQL editor and run the contents of
//      `supabase/schema.sql` (in this repo) once. That creates the
//      profiles/friendships/workouts tables, row-level security
//      policies, and the account-deletion function.
//   3. In Project Settings -> API, copy:
//        - "Project URL"        -> EXPO_PUBLIC_SUPABASE_URL
//        - "anon" "public" key  -> EXPO_PUBLIC_SUPABASE_ANON_KEY
//      Put these in a `.env` file at the repo root (see `.env.example`).
//      Metro/Expo inlines any var prefixed EXPO_PUBLIC_ at build time, so
//      no extra config or expo-constants plumbing is needed — just restart
//      `expo start` after editing `.env`.
//      (Never put the "service_role" key in this file, `.env`, or anywhere
//      in the app — it bypasses row-level security and must stay
//      server-side.)
//   4. In Authentication -> Providers, enable "Email" (on by default).
//   5. In Authentication -> Providers, also enable "Apple". Google/Apple
//      sign-in use their own native flows (see config/auth.ts), but
//      Supabase still needs the Apple provider turned on, with your app's
//      bundle identifier (ios.bundleIdentifier in app.json) entered in
//      its "Client IDs" field, so it can verify the identity token's
//      audience. Skip the "Secret Key" field — that's only for the
//      web/redirect OAuth flow, not native sign-in.
//   6. In Authentication -> URL Configuration, you can leave the default
//      redirect settings — this app doesn't use magic-link/OAuth redirect
//      URLs, only native sign-in.
//
// Using a different Supabase project per environment (dev/staging/prod) is
// just a matter of pointing EAS at a different `.env` / environment
// variable set for each build profile — see `.env.example`.
//
// Until these are filled in, auth/friends/workouts fall back to
// device-only storage instead of crashing.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
