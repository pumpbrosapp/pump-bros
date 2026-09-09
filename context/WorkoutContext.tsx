import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StreakDay, toDateKey, computeDayStreak, computeStreakWeek, bucketForType } from '../data/workout';
import { INITIAL_USER_XP } from '../data/friends';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { reportError } from '../lib/errorReporting';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { useSplit } from './SplitContext';
import { WorkoutType } from '../types';

// XP awarded for every workout logged.
export const XP_PER_WORKOUT = 125;

// One-time bonus for logging a workout on day 1 of a *new* streak — i.e.
// you had logged before, your streak had broken (hit 0), and this log
// restarts it. Rewards getting back on track instead of piling a second
// punishment on top of the missed day.
export const COMEBACK_BONUS_XP = 50;

// Local cache of every date a workout was logged ('YYYY-MM-DD' strings) and
// the running XP total, so the streak survives an app restart even when
// signed out. When signed in, this is unioned with the `workouts` table
// (the real source of truth across devices) rather than replaced outright,
// so nothing logged offline is ever lost.
//
// All three are keyed per-user (same pattern as the avatar cache in
// UserContext). Without that, signing out and into a *different* account
// on the same device would read the previous account's leftover XP/streak
// out of a shared slot — showing a stranger's number for a beat before the
// Supabase fetch overwrites it, and in the worst case adding a freshly
// logged workout's XP on top of that leftover number and persisting the
// corrupted total back to the real account.
const loggedDatesKey = (userId: string) => `gymbro_logged_dates_${userId}`;
// Superset of loggedDatesKey that also remembers *which bucket* (workout
// vs cardio) was logged on each date, so "already logged today" can be
// checked per-bucket instead of once for the whole day. loggedDatesKey
// itself is still written (kept below for any older client reading it),
// but this is the one WorkoutProvider actually reads back from.
const loggedEntriesKey = (userId: string) => `gymbro_logged_entries_${userId}`;
const xpKey = (userId: string) => `gymbro_xp_${userId}`;
const lastTypeKey = (userId: string) => `gymbro_last_workout_type_${userId}`;

// One row per log: which calendar day, and what type was logged. A day
// can carry up to two entries — one 'workout' bucket (strength/other) and
// one 'cardio' — since the two buckets are tracked independently.
export interface LoggedEntry {
  date: string;
  type: WorkoutType;
}

interface WorkoutContextValue {
  dayStreak: number;
  streakWeek: StreakDay[];
  // True if *anything* (workout or cardio) was logged today — drives the
  // overall day/streak status shown on the Progress screen.
  todayLogged: boolean;
  // Per-bucket flags: each resets independently, so logging one bucket
  // today doesn't block logging the other.
  todayWorkoutLogged: boolean;
  todayCardioLogged: boolean;
  xp: number;
  loggedDates: string[];
  lastWorkoutType: WorkoutType;
  // Returns true when this log just triggered the comeback bonus, so the
  // caller (the log sheet) can show a distinct "welcome back" moment.
  // No-ops (returns false) if today's entry for that type's bucket has
  // already been logged.
  logWorkout: (type: WorkoutType) => boolean;
  // Whether the last attempt to push a split edit to the profile row
  // failed. The edit itself is never lost (SplitContext's local state is
  // the source of truth for what's on screen) — this only tells the split
  // UI that the *sync* didn't make it, so it can tell the user rather than
  // let it fail invisibly in the background.
  splitSyncFailed: boolean;
  // Re-attempts the push that failed. Safe to call any time; it's a no-op
  // if there's nothing pending or a sync is already in flight.
  retrySplitSync: () => void;
}

const WorkoutContext = createContext<WorkoutContextValue | undefined>(undefined);

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { days: splitDays, splitName, restoreSplit } = useSplit();
  const { showToast } = useToast();

  const [loggedEntries, setLoggedEntries] = useState<LoggedEntry[]>([]);
  const [xp, setXp] = useState(INITIAL_USER_XP);
  const [lastWorkoutType, setLastWorkoutType] = useState<WorkoutType>('strength');

  // Load whatever was logged locally before any network round-trip, so a
  // signed-out (or still-loading) session still shows the real streak.
  // Scoped to this user's own keys, and merged with Math.max rather than
  // overwritten, so a slower local read that resolves after the Supabase
  // fetch below can never drag a lower/stale number back over a higher
  // one that's already showing.
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(loggedEntriesKey(user.id))
      .then(async (stored) => {
        if (stored) {
          setLoggedEntries(JSON.parse(stored));
          return;
        }
        // Migration for installs from before per-bucket tracking: the
        // old key only ever recorded dates for the single daily workout
        // slot that existed back then, so every date it holds is safe
        // to treat as a 'workout' bucket entry (cardio couldn't have
        // been logged separately at the time).
        const oldDates = await AsyncStorage.getItem(loggedDatesKey(user.id)).catch(() => null);
        if (oldDates) {
          const migrated: LoggedEntry[] = JSON.parse(oldDates).map((date: string) => ({
            date,
            type: 'strength' as WorkoutType,
          }));
          setLoggedEntries(migrated);
        }
      })
      .catch(() => {});
    AsyncStorage.getItem(xpKey(user.id))
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored);
        setXp((current) => Math.max(current, parsed));
      })
      .catch(() => {});
    AsyncStorage.getItem(lastTypeKey(user.id))
      .then((stored) => {
        if (stored === 'strength' || stored === 'cardio' || stored === 'other') {
          setLastWorkoutType(stored);
        }
      })
      .catch(() => {});
  }, [user]);

  // Pull the signed-in user's history from Supabase so it picks up where
  // they left off on any device. `workouts.logged_at` is the real record
  // of every workout ever logged, so the streak is derived from it rather
  // than from a manually-incremented counter that could drift.
  //
  // profiles.xp is server-authoritative now (see log_workout() + the
  // column-level revoke on profiles in schema.sql), so this never writes
  // xp back — it only merges with Math.max for *display*, so a very
  // recent optimistic bump from logWorkout can't flash backward if this
  // fetch happens to resolve a beat later.
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;
    let cancelled = false;
    (async () => {
      const [{ data: profile }, { data: workouts }] = await Promise.all([
        supabase.from('profiles').select('xp').eq('id', user.id).maybeSingle(),
        supabase.from('workouts').select('logged_at, type').eq('user_id', user.id),
      ]);
      if (cancelled) return;
      const remoteXp = profile?.xp ?? INITIAL_USER_XP;
      setXp((current) => {
        const resolved = Math.max(current, remoteXp);
        AsyncStorage.setItem(xpKey(user.id), JSON.stringify(resolved)).catch(() => {});
        return resolved;
      });
      if (workouts) {
        const remoteEntries: LoggedEntry[] = workouts.map((w: { logged_at: string; type: WorkoutType }) => ({
          date: toDateKey(new Date(w.logged_at)),
          type: w.type,
        }));
        // Union on date+type (not just date) so a workout and a cardio
        // log on the same day both survive the merge instead of one
        // shadowing the other.
        setLoggedEntries((local) => {
          const merged = new Map(local.map((e) => [`${e.date}|${e.type}`, e]));
          remoteEntries.forEach((e) => merged.set(`${e.date}|${e.type}`, e));
          return Array.from(merged.values());
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Any-activity date list — a day counts here if either bucket was
  // logged on it — kept for the streak math and the heatmap, both of
  // which only care whether *something* was logged that day.
  const loggedDates = useMemo(() => loggedEntries.map((e) => e.date), [loggedEntries]);
  const loggedDatesSet = useMemo(() => new Set(loggedDates), [loggedDates]);
  const workoutDatesSet = useMemo(
    () => new Set(loggedEntries.filter((e) => bucketForType(e.type) === 'workout').map((e) => e.date)),
    [loggedEntries]
  );
  const cardioDatesSet = useMemo(
    () => new Set(loggedEntries.filter((e) => bucketForType(e.type) === 'cardio').map((e) => e.date)),
    [loggedEntries]
  );
  const dayStreak = useMemo(
    () => computeDayStreak(loggedDatesSet, splitDays),
    [loggedDatesSet, splitDays]
  );
  const streakWeek = useMemo(() => computeStreakWeek(loggedDatesSet), [loggedDatesSet]);
  const todayKeyNow = toDateKey(new Date());
  const todayLogged = loggedDatesSet.has(todayKeyNow);
  const todayWorkoutLogged = workoutDatesSet.has(todayKeyNow);
  const todayCardioLogged = cardioDatesSet.has(todayKeyNow);

  // The split lives in SplitContext, which has no Supabase access of its
  // own (it sits above AuthProvider in the tree — see App.tsx — purely so
  // a split picked during onboarding survives into the signed-in app).
  // This provider sits below AuthProvider *and* can already useSplit(), so
  // it's the natural place to bridge the split to/from profiles, the same
  // way it already bridges xp and streak history.
  const splitHydratedRef = useRef(false);
  const [splitSyncFailed, setSplitSyncFailed] = useState(false);
  // Bumped to force the push effect below to re-run even when splitName/
  // splitDays haven't changed, so "retry" can re-attempt the exact same
  // payload that just failed.
  const [splitSyncAttempt, setSplitSyncAttempt] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;
    splitHydratedRef.current = false;
    setSplitSyncFailed(false);
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('split_name, split_days')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled && data && Array.isArray(data.split_days) && data.split_days.length === 7) {
        restoreSplit(data.split_name ?? null, data.split_days);
      }
      if (!cancelled) splitHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Push split edits back to the profile row — but only once the fetch
  // above has actually resolved, so the empty split this provider starts
  // with (before hydration) can't race ahead and stomp a saved one.
  useEffect(() => {
    if (!isSupabaseConfigured || !user || !splitHydratedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ split_name: splitName, split_days: splitDays })
          .eq('id', user.id);
        if (cancelled) return;
        // Surfaced to the split UI (see splitSyncFailed) instead of being
        // swallowed here — a dropped connection or an RLS/permission error
        // used to leave the edit looking "saved" on screen while nothing
        // reached the server, silently diverging from every other device.
        setSplitSyncFailed(Boolean(error));
      } catch {
        if (!cancelled) setSplitSyncFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, splitName, splitDays, splitSyncAttempt]);

  const retrySplitSync = useCallback(() => {
    setSplitSyncAttempt((n) => n + 1);
  }, []);

  // day_streak/streak_week on the profile row (read by a *friend's*
  // profile page, which only has access to profiles, not this user's own
  // workouts under RLS) used to be pushed from here too. That's now done
  // server-side inside log_workout() instead — see schema.sql — both
  // because profiles.day_streak/streak_week are column-revoked for
  // direct client writes the same way xp is, and because computing them
  // there means they're derived from the real workouts rows rather than
  // from whatever this client happens to think the streak is.

  const logWorkout = useCallback(
    (type: WorkoutType) => {
      if (!user) return false;
      const todayKey = toDateKey(new Date());
      const bucket = bucketForType(type);
      const bucketAlreadyLogged = bucket === 'cardio' ? cardioDatesSet.has(todayKey) : workoutDatesSet.has(todayKey);
      if (bucketAlreadyLogged) return false; // this bucket already logged today, no-op

      // dayStreak here reflects the chain *before* today (today isn't in
      // loggedDatesSet yet at this point) — 0 with real prior history
      // means the streak had broken, so this log is a fresh restart.
      // This local guess only drives the immediate "welcome back" UI
      // moment; log_workout() below recomputes the same thing
      // server-side from real workouts rows, and that's the answer that
      // actually gets persisted.
      const isComeback = loggedDates.length > 0 && dayStreak === 0;
      const bonusXp = isComeback ? COMEBACK_BONUS_XP : 0;

      const prevEntries = loggedEntries;
      const prevXp = xp;
      const nextEntries = [...loggedEntries, { date: todayKey, type }];
      // Optimistic bump so the UI updates instantly. This is a display
      // guess only — the log_workout() RPC below computes and persists
      // the real xp_earned itself from server-side history, and its
      // response corrects this guess (or the whole thing is rolled back
      // below if the server rejects the log, e.g. a race with another
      // device already logging this bucket today).
      const optimisticXp = prevXp + XP_PER_WORKOUT + bonusXp;

      setLoggedEntries(nextEntries);
      setXp(optimisticXp);
      setLastWorkoutType(type);

      AsyncStorage.setItem(loggedEntriesKey(user.id), JSON.stringify(nextEntries)).catch(() => {});
      // Kept in sync too, purely so an older app build reading only this
      // key (pre-buckets) still sees every active date.
      AsyncStorage.setItem(
        loggedDatesKey(user.id),
        JSON.stringify(Array.from(new Set(nextEntries.map((e) => e.date))))
      ).catch(() => {});
      AsyncStorage.setItem(xpKey(user.id), JSON.stringify(optimisticXp)).catch(() => {});
      AsyncStorage.setItem(lastTypeKey(user.id), type).catch(() => {});

      if (isSupabaseConfigured) {
        // The only place xp/day_streak/streak_week are ever actually
        // written now that direct column updates are revoked (see
        // schema.sql) — the server computes xp_earned and the comeback
        // bonus itself from real history, so a client can no longer
        // hand it an arbitrary total.
        const rollBack = (err: unknown) => {
          // Server rejected the log (or the request itself failed) —
          // roll the optimistic update back rather than leave a number
          // the server never actually granted, and let the user know
          // why their streak/xp just changed back.
          setLoggedEntries(prevEntries);
          setXp(prevXp);
          AsyncStorage.setItem(loggedEntriesKey(user.id), JSON.stringify(prevEntries)).catch(() => {});
          AsyncStorage.setItem(
            loggedDatesKey(user.id),
            JSON.stringify(Array.from(new Set(prevEntries.map((e) => e.date))))
          ).catch(() => {});
          AsyncStorage.setItem(xpKey(user.id), JSON.stringify(prevXp)).catch(() => {});
          reportError(err ?? new Error('log_workout rejected'), { userId: user.id, workoutType: type });
          showToast("Couldn't save your workout — try again", 'error');
        };

        (async () => {
          try {
            const { data, error } = await supabase.rpc('log_workout', { p_type: type });
            if (error || !data || !data[0]) {
              rollBack(error);
              return;
            }
            const totalXp = data[0].total_xp as number;
            setXp(totalXp);
            AsyncStorage.setItem(xpKey(user.id), JSON.stringify(totalXp)).catch(() => {});
          } catch (err) {
            // Covers a thrown network error, not just a returned `error`
            // field — previously unhandled entirely (no .catch on this
            // call at all).
            rollBack(err);
          }
        })();
      }

      return isComeback;
    },
    [loggedEntries, loggedDates, workoutDatesSet, cardioDatesSet, dayStreak, xp, user, showToast]
  );

  const value = useMemo(
    () => ({
      dayStreak,
      streakWeek,
      todayLogged,
      todayWorkoutLogged,
      todayCardioLogged,
      xp,
      loggedDates,
      lastWorkoutType,
      logWorkout,
      splitSyncFailed,
      retrySplitSync,
    }),
    [
      dayStreak,
      streakWeek,
      todayLogged,
      todayWorkoutLogged,
      todayCardioLogged,
      xp,
      loggedDates,
      lastWorkoutType,
      logWorkout,
      splitSyncFailed,
      retrySplitSync,
    ]
  );

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export function useWorkout() {
  const ctx = useContext(WorkoutContext);
  if (!ctx) {
    throw new Error('useWorkout must be used within a WorkoutProvider');
  }
  return ctx;
}
