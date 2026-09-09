import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { setUserContext } from '../lib/errorReporting';
import { containsProhibitedLanguage, PROHIBITED_NAME_MESSAGE } from '../utils/contentFilter';

// pumpbros://auth-callback (see app.json's "scheme", same pattern as the
// pumpbros://invite/<CODE> links in FriendsContext) — where signUpWithEmail
// below tells Supabase to send users after they tap "Confirm your email".
const AUTH_CALLBACK_URL = 'pumpbros://auth-callback';

// Pulls the PKCE `code` param back out of the callback URL Linking hands
// us, tolerating whichever of query-string or fragment form it shows up
// in (both appear in the wild depending on the mail client's link
// rewriting).
function parseAuthCodeFromUrl(url: string | null): string | null {
  if (!url || !url.includes('auth-callback')) return null;
  const match = url.match(/[?&#]code=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export type AuthProviderName = 'email' | 'google' | 'apple';

export interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  provider: AuthProviderName;
  // Grants access to the admin report-management screen. Always false
  // in local/demo mode (no backend, no admin concept there) — see
  // profiles.is_admin in supabase/schema.sql for how this gets set.
  isAdmin: boolean;
  // When the account was created. Used to give AI trainers the same
  // starting line as the player — see data/trainers.ts — rather than
  // Date.now() at every app open.
  createdAt: string | null;
}

// Passed in from the native Google/Apple sign-in flows in AuthScreen.
// `idToken` is what links the sign-in to a Supabase account; the rest is
// only used for local-only fallback mode (no Supabase configured yet).
export interface ProviderSignInPayload {
  idToken?: string | null;
  // Raw (unhashed) nonce used when requesting the ID token. Required for
  // Apple's native flow so Supabase can verify the token wasn't replayed
  // — see generateNonce() in AuthScreen.tsx.
  nonce?: string | null;
  id: string;
  email: string | null;
  name: string | null;
}

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  error: string | null;
  clearError: () => void;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  completeGoogleSignIn: (payload: ProviderSignInPayload) => Promise<void>;
  completeAppleSignIn: (payload: ProviderSignInPayload) => Promise<void>;
  signOut: () => Promise<void>;
  // Permanently deletes the account and all of its data (friends,
  // workouts, profile). Cannot be undone.
  deleteAccount: () => Promise<void>;
  // Account settings: username, email, and password can each be changed
  // independently from the Edit Profile screen. Each throws (with a
  // human-readable message left in `error`) on failure, e.g. a taken
  // username or an incorrect current password, so the caller can show the
  // right inline message without the other fields being disturbed.
  updateUsername: (newUsername: string) => Promise<void>;
  // On Supabase this sends a confirmation link to the new address rather
  // than changing it immediately — `requiresConfirmation` on the result
  // tells the caller which message to show.
  updateEmail: (newEmail: string) => Promise<{ requiresConfirmation: boolean }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ----------------------------------------------------------------------
// Local (device-only) fallback, used until Supabase is configured in
// config/supabase.ts. Mirrors what real accounts will look/behave like
// so nothing else in the app has to branch on which mode is active.
// ----------------------------------------------------------------------
interface StoredAccount {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  provider: AuthProviderName;
  passwordHash?: string;
  passwordSalt?: string;
  providerId?: string;
  createdAt: string;
}

const ACCOUNTS_KEY = 'gymbro_accounts_v1';
const SESSION_KEY = 'gymbro_session_v1';

// Mirrors the slugify-and-dedupe logic in the Supabase `handle_new_user`
// trigger (see supabase/schema.sql) so local fallback mode behaves the
// same way: lowercase, alphanumeric/underscore only, and suffixed with a
// number if it's already taken by another local account.
function slugifyUsername(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  return base || 'user';
}

function uniqueLocalUsername(base: string, accounts: StoredAccount[], excludeId?: string): string {
  const taken = new Set(
    accounts.filter((a) => a.id !== excludeId).map((a) => a.username?.toLowerCase())
  );
  let candidate = base;
  let suffix = 0;
  while (taken.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

async function loadLocalAccounts(): Promise<StoredAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    const accounts: StoredAccount[] = raw ? JSON.parse(raw) : [];
    // Backfill fields for accounts created before they existed.
    let changed = false;
    const migrated = accounts.map((a) => {
      let next = a;
      if (!next.username) {
        changed = true;
        next = {
          ...next,
          username: uniqueLocalUsername(slugifyUsername(next.displayName || next.email?.split('@')[0] || 'user'), accounts, next.id),
        };
      }
      if (!next.createdAt) {
        changed = true;
        // Unknown for pre-existing accounts — best guess is "now", which
        // just means their AI trainers start from today too.
        next = { ...next, createdAt: new Date().toISOString() };
      }
      return next;
    });
    if (changed) await saveLocalAccounts(migrated);
    return migrated;
  } catch {
    return [];
  }
}

async function saveLocalAccounts(accounts: StoredAccount[]) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function localAccountToAuthUser(account: StoredAccount): AuthUser {
  return {
    id: account.id,
    email: account.email,
    username: account.username,
    displayName: account.displayName,
    avatarUrl: null,
    provider: account.provider,
    isAdmin: false,
    createdAt: account.createdAt,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Tags every subsequent crash/error report with who it happened to —
  // runs on sign in, sign out (user becomes null, which clears it), and
  // account switch. Lives here rather than further out in the tree since
  // this is the one place that actually owns `user`.
  useEffect(() => {
    setUserContext(
      user ? { id: user.id, email: user.email, displayName: user.displayName } : null
    );
  }, [user]);

  // ---- Supabase-backed session bootstrap + live auth state ----
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    const hydrateFromSession = async (
      supabaseUser: { id: string; email?: string | null; app_metadata?: any; created_at?: string } | null
    ) => {
      if (!supabaseUser) {
        if (!cancelled) setUser(null);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, is_admin')
        .eq('id', supabaseUser.id)
        .maybeSingle();

      if (cancelled) return;
      const provider = (supabaseUser.app_metadata?.provider as AuthProviderName) ?? 'email';
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email ?? null,
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        provider: provider === 'email' || provider === 'google' || provider === 'apple' ? provider : 'email',
        isAdmin: profile?.is_admin ?? false,
        createdAt: supabaseUser.created_at ?? null,
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      hydrateFromSession(data.session?.user ?? null).finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrateFromSession(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // ---- Email confirmation deep link (pumpbros://auth-callback) ----
  // Tapping "Confirm your email" opens this instead of the dead
  // localhost page — exchange the code it carries for a real session.
  // onAuthStateChange above picks up the resulting session automatically
  // and hydrates `user`, so there's nothing else to do here.
  const handledAuthUrlRef = useRef<string | null>(null);

  const completeEmailConfirmation = useCallback(async (url: string | null) => {
    if (!isSupabaseConfigured || !url || handledAuthUrlRef.current === url) return;
    const code = parseAuthCodeFromUrl(url);
    if (!code) return;
    handledAuthUrlRef.current = url;
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      setError(exchangeError.message);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    Linking.getInitialURL().then(completeEmailConfirmation).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      completeEmailConfirmation(url);
    });
    return () => subscription.remove();
  }, [completeEmailConfirmation]);

  // ---- Local fallback session bootstrap ----
  useEffect(() => {
    if (isSupabaseConfigured) return;

    (async () => {
      try {
        const [sessionRaw, accounts] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEY),
          loadLocalAccounts(),
        ]);
        const session = sessionRaw ? (JSON.parse(sessionRaw) as { userId: string }) : null;
        const account = session ? accounts.find((a) => a.id === session.userId) : undefined;
        if (account) setUser(localAccountToAuthUser(account));
      } catch {
        // Corrupt or missing storage just means "not signed in".
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const persistLocalSession = useCallback(async (account: StoredAccount) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ userId: account.id }));
    setUser(localAccountToAuthUser(account));
  }, []);

  // ---------------- Email sign up / sign in ----------------
  const signUpWithEmail = useCallback(
    async (emailInput: string, password: string, displayName?: string) => {
      setError(null);
      const email = normalizeEmail(emailInput);
      if (!email || !email.includes('@')) {
        setError('Enter a valid email address.');
        throw new Error('invalid_email');
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        throw new Error('weak_password');
      }
      const trimmedDisplayName = displayName?.trim();
      if (trimmedDisplayName && containsProhibitedLanguage(trimmedDisplayName)) {
        setError(PROHIBITED_NAME_MESSAGE);
        throw new Error('prohibited_display_name');
      }

      if (isSupabaseConfigured) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName?.trim() || null },
            // Without this, Supabase sends the confirmation link to
            // whatever "Site URL" is set in the project's Auth settings
            // — for a fresh project that's the http://localhost:3000
            // default, which is why the email opened a dead "localhost"
            // page instead of the app. Pointing it at our own scheme
            // makes the link open Pump Bros directly; the matching
            // Linking listener below finishes signing the user in.
            // NOTE: pumpbros://auth-callback also has to be added to the
            // "Redirect URLs" allow-list in the Supabase dashboard
            // (Authentication > URL Configuration) — Supabase silently
            // falls back to the Site URL for any redirect that isn't on
            // that list.
            emailRedirectTo: AUTH_CALLBACK_URL,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          throw signUpError;
        }
        return;
      }

      const accounts = await loadLocalAccounts();
      if (accounts.some((a) => a.email && normalizeEmail(a.email) === email)) {
        setError('An account with that email already exists.');
        throw new Error('email_in_use');
      }
      const salt = Crypto.randomUUID();
      const passwordHash = await hashPassword(password, salt);
      const username = uniqueLocalUsername(
        slugifyUsername(displayName?.trim() || email.split('@')[0] || 'user'),
        accounts
      );
      const account: StoredAccount = {
        id: Crypto.randomUUID(),
        email,
        username,
        displayName: displayName?.trim() || null,
        provider: 'email',
        passwordHash,
        passwordSalt: salt,
        createdAt: new Date().toISOString(),
      };
      await saveLocalAccounts([...accounts, account]);
      await persistLocalSession(account);
    },
    [persistLocalSession]
  );

  const signInWithEmail = useCallback(
    async (emailInput: string, password: string) => {
      setError(null);
      const email = normalizeEmail(emailInput);

      if (isSupabaseConfigured) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          throw signInError;
        }
        return;
      }

      const accounts = await loadLocalAccounts();
      const account = accounts.find((a) => a.provider === 'email' && a.email && normalizeEmail(a.email) === email);
      if (!account || !account.passwordSalt || !account.passwordHash) {
        setError('No account found for that email.');
        throw new Error('no_account');
      }
      const attemptHash = await hashPassword(password, account.passwordSalt);
      if (attemptHash !== account.passwordHash) {
        setError('Incorrect password.');
        throw new Error('bad_password');
      }
      await persistLocalSession(account);
    },
    [persistLocalSession]
  );

  // ---------------- Local fallback for Google/Apple ----------------
  const completeProviderSignInLocal = useCallback(
    async (provider: Exclude<AuthProviderName, 'email'>, payload: ProviderSignInPayload) => {
      const accounts = await loadLocalAccounts();
      // A provider-supplied name isn't something the person typed into
      // Pump Bros, so a flagged one shouldn't block sign-in — just treat
      // it as absent and fall back the same way as if the provider had
      // sent nothing, rather than saving it.
      const safeName = payload.name && !containsProhibitedLanguage(payload.name) ? payload.name : null;
      let account = accounts.find((a) => a.provider === provider && a.providerId === payload.id);
      if (!account && payload.email) {
        account = accounts.find(
          (a) => a.email && payload.email && normalizeEmail(a.email) === normalizeEmail(payload.email)
        );
      }
      if (account) {
        account = {
          ...account,
          providerId: payload.id,
          displayName: safeName ?? account.displayName,
          email: payload.email ?? account.email,
        };
        await saveLocalAccounts(accounts.map((a) => (a.id === account!.id ? account! : a)));
      } else {
        const username = uniqueLocalUsername(
          slugifyUsername(safeName || payload.email?.split('@')[0] || 'user'),
          accounts
        );
        account = {
          id: Crypto.randomUUID(),
          email: payload.email,
          username,
          displayName: safeName,
          provider,
          providerId: payload.id,
          createdAt: new Date().toISOString(),
        };
        await saveLocalAccounts([...accounts, account]);
      }
      await persistLocalSession(account);
    },
    [persistLocalSession]
  );

  // ---------------- Google / Apple, Supabase-backed ----------------
  const completeProviderSignIn = useCallback(
    async (provider: Exclude<AuthProviderName, 'email'>, payload: ProviderSignInPayload) => {
      setError(null);

      if (isSupabaseConfigured && payload.idToken) {
        const { error: linkError } = await supabase.auth.signInWithIdToken({
          provider,
          token: payload.idToken,
          // Only Apple's native flow sends a nonce today; Supabase ignores
          // this field for providers that don't use one.
          nonce: payload.nonce ?? undefined,
        });
        if (linkError) {
          setError(linkError.message);
          throw linkError;
        }
        // If this is the very first sign-in and we have a display name
        // from the provider (Apple only sends this once), save it — but
        // skip a flagged name rather than blocking the sign-in over
        // something the person didn't type into Pump Bros.
        if (payload.name && !containsProhibitedLanguage(payload.name)) {
          const { data } = await supabase.auth.getUser();
          if (data.user) {
            await supabase
              .from('profiles')
              .update({ display_name: payload.name })
              .eq('id', data.user.id)
              .is('display_name', null);
          }
        }
        return;
      }

      await completeProviderSignInLocal(provider, payload);
    },
    [completeProviderSignInLocal]
  );

  const completeGoogleSignIn = useCallback(
    (payload: ProviderSignInPayload) => completeProviderSignIn('google', payload),
    [completeProviderSignIn]
  );

  const completeAppleSignIn = useCallback(
    (payload: ProviderSignInPayload) => completeProviderSignIn('apple', payload),
    [completeProviderSignIn]
  );

  // ---------------- Account settings ----------------
  const updateUsername = useCallback(
    async (newUsernameInput: string) => {
      setError(null);
      const newUsername = slugifyUsername(newUsernameInput);
      if (newUsername.length < 3 || newUsername.length > 20) {
        const message = 'Username must be 3-20 characters (letters, numbers, underscore).';
        setError(message);
        throw new Error(message);
      }
      // Check both the raw input and the slugified form — slugifying
      // strips spaces/punctuation, which could otherwise let a
      // multi-word prohibited phrase slip through as one word.
      if (containsProhibitedLanguage(newUsernameInput) || containsProhibitedLanguage(newUsername)) {
        setError(PROHIBITED_NAME_MESSAGE);
        throw new Error(PROHIBITED_NAME_MESSAGE);
      }
      if (!user) {
        const message = 'You need to be signed in to do that.';
        setError(message);
        throw new Error(message);
      }

      if (isSupabaseConfigured) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ username: newUsername })
          .eq('id', user.id);
        if (updateError) {
          // Postgres unique_violation on the `username` column.
          const message =
            updateError.code === '23505'
              ? 'That username is already taken.'
              : updateError.message;
          setError(message);
          throw new Error(message);
        }
        setUser((prev) => (prev ? { ...prev, username: newUsername } : prev));
        return;
      }

      const accounts = await loadLocalAccounts();
      if (accounts.some((a) => a.id !== user.id && a.username?.toLowerCase() === newUsername.toLowerCase())) {
        const message = 'That username is already taken.';
        setError(message);
        throw new Error(message);
      }
      const updated = accounts.map((a) => (a.id === user.id ? { ...a, username: newUsername } : a));
      await saveLocalAccounts(updated);
      setUser((prev) => (prev ? { ...prev, username: newUsername } : prev));
    },
    [user]
  );

  const updateEmail = useCallback(
    async (newEmailInput: string): Promise<{ requiresConfirmation: boolean }> => {
      setError(null);
      const newEmail = normalizeEmail(newEmailInput);
      if (!newEmail || !newEmail.includes('@')) {
        const message = 'Enter a valid email address.';
        setError(message);
        throw new Error(message);
      }
      if (!user) {
        const message = 'You need to be signed in to do that.';
        setError(message);
        throw new Error(message);
      }

      if (isSupabaseConfigured) {
        const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });
        if (updateError) {
          setError(updateError.message);
          throw updateError;
        }
        // Supabase doesn't apply the change until the person confirms it
        // via the link sent to the new address, so `user.email` is left
        // as-is here — the auth state listener will pick up the real
        // value once they confirm.
        return { requiresConfirmation: true };
      }

      const accounts = await loadLocalAccounts();
      if (accounts.some((a) => a.id !== user.id && a.email && normalizeEmail(a.email) === newEmail)) {
        const message = 'An account with that email already exists.';
        setError(message);
        throw new Error(message);
      }
      const updated = accounts.map((a) => (a.id === user.id ? { ...a, email: newEmail } : a));
      await saveLocalAccounts(updated);
      setUser((prev) => (prev ? { ...prev, email: newEmail } : prev));
      return { requiresConfirmation: false };
    },
    [user]
  );

  const updatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      setError(null);
      if (newPassword.length < 6) {
        const message = 'New password must be at least 6 characters.';
        setError(message);
        throw new Error(message);
      }
      if (!user) {
        const message = 'You need to be signed in to do that.';
        setError(message);
        throw new Error(message);
      }

      if (isSupabaseConfigured) {
        if (!user.email) {
          const message = "This account doesn't sign in with a password.";
          setError(message);
          throw new Error(message);
        }
        // Supabase's updateUser doesn't ask for the current password, but
        // requiring it here (by re-checking it against the live session)
        // stops someone from changing the password on a device where the
        // owner is still logged in but stepped away.
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (reauthError) {
          const message = 'Current password is incorrect.';
          setError(message);
          throw new Error(message);
        }
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
          setError(updateError.message);
          throw updateError;
        }
        return;
      }

      const accounts = await loadLocalAccounts();
      const account = accounts.find((a) => a.id === user.id);
      if (!account || !account.passwordSalt || !account.passwordHash) {
        const message = "This account doesn't sign in with a password.";
        setError(message);
        throw new Error(message);
      }
      const attemptHash = await hashPassword(currentPassword, account.passwordSalt);
      if (attemptHash !== account.passwordHash) {
        const message = 'Current password is incorrect.';
        setError(message);
        throw new Error(message);
      }
      const newSalt = Crypto.randomUUID();
      const newHash = await hashPassword(newPassword, newSalt);
      const updated = accounts.map((a) =>
        a.id === user.id ? { ...a, passwordSalt: newSalt, passwordHash: newHash } : a
      );
      await saveLocalAccounts(updated);
    },
    [user]
  );

  // ---------------- Sign out / delete ----------------
  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
      setUser(null);
      return;
    }
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    if (isSupabaseConfigured) {
      const { error: rpcError } = await supabase.rpc('delete_own_account');
      if (rpcError) {
        setError(rpcError.message);
        throw rpcError;
      }
      await supabase.auth.signOut();
      setUser(null);
      return;
    }
    if (!user) return;
    const accounts = await loadLocalAccounts();
    await saveLocalAccounts(accounts.filter((a) => a.id !== user.id));
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, [user]);

  const value = useMemo(
    () => ({
      isLoading,
      isAuthenticated: user !== null,
      user,
      error,
      clearError,
      signUpWithEmail,
      signInWithEmail,
      completeGoogleSignIn,
      completeAppleSignIn,
      signOut,
      deleteAccount,
      updateUsername,
      updateEmail,
      updatePassword,
    }),
    [
      isLoading,
      user,
      error,
      clearError,
      signUpWithEmail,
      signInWithEmail,
      completeGoogleSignIn,
      completeAppleSignIn,
      signOut,
      deleteAccount,
      updateUsername,
      updateEmail,
      updatePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
