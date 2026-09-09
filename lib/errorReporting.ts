// Crash/error reporting via Sentry.
//
// Pump Bros ships with this wired in but pointed at nothing until you
// set EXPO_PUBLIC_SENTRY_DSN, and every function below checks
// isErrorReportingConfigured first. With no DSN, initErrorReporting()
// never calls Sentry.init, reportError() just logs to the console
// instead of dropping errors on the floor, and setUserContext() is a
// no-op — so none of this crashes or does anything surprising in dev
// or in a fork that hasn't set up Sentry yet.
//
// To turn it on:
//   1. Create a free project at https://sentry.io (React Native platform).
//   2. Settings -> Client Keys (DSN) -> copy the DSN string.
//   3. Put it in `.env` as EXPO_PUBLIC_SENTRY_DSN (see .env.example) —
//      same EXPO_PUBLIC_ mechanism as the Supabase config, so it's
//      inlined at build time with no extra plumbing, and can differ
//      per environment (dev/staging/prod) the same way EAS build
//      profiles already point at different Supabase projects.
//   4. Rebuild the app (a JS-only reload isn't enough the first time,
//      since native crash reporting needs the native module linked).
//
// A DSN is a public identifier, not a secret (it only tells the SDK
// where to send events) — safe to inline client-side, same as the
// Supabase anon key.
import * as Sentry from '@sentry/react-native';
import React from 'react';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

export const isErrorReportingConfigured = Boolean(SENTRY_DSN);

let initialized = false;

// Call once, as early as possible (module load in App.tsx) — before any
// component has a chance to throw.
export function initErrorReporting() {
  if (!isErrorReportingConfigured || initialized) return;
  initialized = true;
  Sentry.init({
    dsn: SENTRY_DSN,
    // Crash reports are always captured regardless of this setting;
    // this only controls the fraction of non-crash performance
    // transactions that get sent.
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
  });
}

// Deliberately narrower than AuthUser (context/AuthContext.tsx) — this
// file shouldn't depend on that one just to describe what it forwards
// to Sentry as user context on a crash report.
export interface ErrorReportingUser {
  id: string;
  email?: string | null;
  displayName?: string | null;
}

// Call whenever the signed-in user changes (sign in, sign out, account
// switch) so crash reports say who they happened to. Pass null on sign
// out to clear it.
export function setUserContext(user: ErrorReportingUser | null) {
  if (!isErrorReportingConfigured) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
    username: user.displayName ?? undefined,
  });
}

// Reports a caught error. Use this anywhere a try/catch or .catch()
// today just swallows the error (or only console.errors it) — it's
// meant to replace those silent failures, not just wrap new code.
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (!isErrorReportingConfigured) {
    console.error('[errorReporting]', err, context ?? '');
    return;
  }
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

// ---------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------
// Plain React error boundary (not Sentry.ErrorBoundary) so the fallback
// UI can be a normal themed component defined wherever it's used,
// without pulling Sentry's own UI package in. It still reports through
// reportError() above, so crashes are captured with or without a DSN.

interface ErrorBoundaryProps {
  children: React.ReactNode;
  // Renders in place of the crashed subtree. `retry` resets the
  // boundary so children remount — useful when the crash came from
  // transient bad state rather than a code bug.
  fallback: (error: Error, retry: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.retry);
    }
    return this.props.children;
  }
}
