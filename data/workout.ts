import { SplitDayValue } from './splits';
import { WorkoutType } from '../types';

// The three WorkoutType values collapse into two independently-loggable
// "buckets" per day: cardio on its own, and strength/other sharing the
// regular "workout" slot. Logging one bucket never blocks the other —
// only logging the *same* bucket twice in a day is disallowed.
export type WorkoutBucket = 'workout' | 'cardio';

export function bucketForType(type: WorkoutType): WorkoutBucket {
  return type === 'cardio' ? 'cardio' : 'workout';
}

export interface WorkoutStat {
  label: string;
  value: string;
  icon: string;
  color: string;
}

export interface StreakDay {
  day: string;
  active: boolean;
}

// 'YYYY-MM-DD' in local time — used as the canonical key for "was a
// workout logged on this calendar day", so streak math never drifts
// across timezones the way UTC ISO strings would.
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// A day only "counts" toward the streak if the user's split calls for a
// workout on it. With no split configured yet (or an all-rest split),
// every day is treated as required — same as the original simple model.
export function isWorkoutDay(date: Date, splitDays: SplitDayValue[] | null | undefined): boolean {
  if (!splitDays || !splitDays.some((d) => d.label)) return true;
  const jsDay = date.getDay(); // 0 = Sun ... 6 = Sat
  const splitIndex = (jsDay + 6) % 7; // splitDays is Mon-first
  return !!splitDays[splitIndex]?.label;
}

// Walks backward day-by-day from today, counting consecutive logged
// workouts. Rest days (per the split) are simply skipped over — they
// neither add to nor break the streak. The first *required* day that
// wasn't logged ends the count right there, so a missed planned workout
// truly resets the streak instead of just letting it sit unbroken.
// Today itself is never allowed to break the streak while the day is
// still in progress — it either adds to the streak (if logged) or is
// skipped for now (if not, since there's still time left to log it).
export function computeDayStreak(
  loggedDates: Set<string>,
  splitDays: SplitDayValue[] | null | undefined,
  today: Date = new Date()
): number {
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(cursor);

  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const key = toDateKey(cursor);
    if (loggedDates.has(key)) {
      streak += 1;
    } else if (isWorkoutDay(cursor, splitDays) && key !== todayKey) {
      break; // a required day was missed — streak ends here
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Builds the Mon-Sun week `weeksBack` weeks before the one containing
// `today` (0 = the current week, 1 = last week, etc.), marking which days
// were actually logged. Derived straight from loggedDates, so it can never
// disagree with the streak count above.
export function computeStreakWeekForOffset(
  loggedDates: Set<string>,
  weeksBack: number,
  today: Date = new Date()
): StreakDay[] {
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const mondayOffset = (today.getDay() + 6) % 7; // days since this week's Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset - weeksBack * 7);
  monday.setHours(0, 0, 0, 0);

  return labels.map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { day, active: loggedDates.has(toDateKey(d)) };
  });
}

// Builds the Mon-Sun week containing `today`, marking which days were
// actually logged. Kept as a thin wrapper around computeStreakWeekForOffset
// (offset 0) so existing call sites don't need to change.
export function computeStreakWeek(loggedDates: Set<string>, today: Date = new Date()): StreakDay[] {
  return computeStreakWeekForOffset(loggedDates, 0, today);
}

// Human-friendly label for a given week offset — "This Week" / "Last Week"
// for the two most recent, then an actual date range (e.g. "Aug 18 – Aug 24")
// further back so old weeks are still identifiable at a glance.
export function getWeekRangeLabel(weeksBack: number, today: Date = new Date()): string {
  if (weeksBack === 0) return 'This Week';
  if (weeksBack === 1) return 'Last Week';

  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset - weeksBack * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

// How many weeks back the weekly XP graph should allow swiping to, based on
// the earliest date the user ever logged a workout. Without this, swiping
// would let someone page back into weeks before they even had the app,
// which would just show a wall of empty graphs.
export function computeMaxWeeksBack(loggedDates: string[], today: Date = new Date()): number {
  if (loggedDates.length === 0) return 0;
  const earliestKey = loggedDates.reduce((min, d) => (d < min ? d : min), loggedDates[0]);
  const [y, m, d] = earliestKey.split('-').map(Number);
  const earliest = new Date(y, m - 1, d);

  const mondayOffset = (today.getDay() + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - mondayOffset);
  thisMonday.setHours(0, 0, 0, 0);

  const earliestMondayOffset = (earliest.getDay() + 6) % 7;
  const earliestMonday = new Date(earliest);
  earliestMonday.setDate(earliest.getDate() - earliestMondayOffset);
  earliestMonday.setHours(0, 0, 0, 0);

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diffWeeks = Math.round((thisMonday.getTime() - earliestMonday.getTime()) / msPerWeek);
  return Math.max(0, diffWeeks);
}

export interface WeekDateItem {
  label: string; // single-letter weekday label
  date: number; // day of month
  isToday: boolean;
  completed: boolean; // did the user hit the gym this day
}

// Builds the current Sun–Sat week with real calendar dates, marking which
// days the user completed a workout (driven by a Mon-first streak array).
export function getCurrentWeekDates(streakWeek: StreakDay[]): WeekDateItem[] {
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date();
  const todayIndex = today.getDay(); // 0 = Sun ... 6 = Sat
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - todayIndex);

  return labels.map((label, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);

    // streakWeek is Mon-first; convert this Sun-first index to that order.
    const streakIndex = (index + 6) % 7;

    return {
      label,
      date: date.getDate(),
      isToday: index === todayIndex,
      completed: streakWeek[streakIndex].active,
    };
  });
}

export interface WeeklyPoint {
  day: string;
  value: number; // XP earned that day
}

// Turns this week's Mon-Sun streak into an actual XP-per-day series —
// each logged day contributes one workout's worth of XP, so this is a
// direct reflection of real state rather than an invented "% of goal".
export function buildWeeklyXpPoints(streakWeek: StreakDay[], xpPerWorkout: number): WeeklyPoint[] {
  return streakWeek.map((day) => ({
    day: day.day,
    value: day.active ? xpPerWorkout : 0,
  }));
}

// Total XP earned so far this week (Mon-Sun), for the weekly group
// leaderboard. Ignores the one-off comeback bonus, same simplification
// buildWeeklyXpPoints above makes.
export function computeWeeklyXp(streakWeek: StreakDay[], xpPerWorkout: number): number {
  return streakWeek.filter((day) => day.active).length * xpPerWorkout;
}

// ------------------------------------------------------------------
// Streak history heatmap (GitHub-contributions style).
// ------------------------------------------------------------------
export interface HeatmapDay {
  date: Date;
  active: boolean;
  isToday: boolean;
}

// Built straight from the real logged-workout dates — no guessing.
// `endDate` is the most recent day the block should cover (defaults to
// today), so callers can page backward through older 35-day blocks —
// `isToday` still checks against the real calendar date rather than
// `endDate`, so it only ever highlights a cell when the current block
// actually includes today.
export function buildStreakHeatmap(
  loggedDates: Set<string> | string[],
  totalDays = 35,
  endDate: Date = new Date()
): HeatmapDay[] {
  const set = loggedDates instanceof Set ? loggedDates : new Set(loggedDates);
  const anchor = new Date(endDate);
  anchor.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(new Date());

  const days: HeatmapDay[] = [];
  for (let offset = totalDays - 1; offset >= 0; offset--) {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - offset);
    const key = toDateKey(date);
    days.push({ date, active: set.has(key), isToday: key === todayKey });
  }
  return days;
}

// How many `totalDays`-sized blocks back the streak history heatmap should
// allow swiping to, based on the earliest date the user ever logged a
// workout — mirrors computeMaxWeeksBack's reasoning so paging can't wander
// into empty pre-history blocks.
export function computeMaxHeatmapBlocksBack(
  loggedDates: string[],
  totalDays = 35,
  today: Date = new Date()
): number {
  if (loggedDates.length === 0) return 0;
  const earliestKey = loggedDates.reduce((min, d) => (d < min ? d : min), loggedDates[0]);
  const [y, m, d] = earliestKey.split('-').map(Number);
  const earliest = new Date(y, m - 1, d);
  earliest.setHours(0, 0, 0, 0);

  const anchor = new Date(today);
  anchor.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((anchor.getTime() - earliest.getTime()) / msPerDay);
  return Math.max(0, Math.floor(diffDays / totalDays));
}

// Human-friendly label for a given heatmap block offset — "Last N weeks"
// for the current block, then an actual date range further back so old
// blocks are still identifiable at a glance (mirrors getWeekRangeLabel).
export function getHeatmapRangeLabel(
  blocksBack: number,
  totalDays = 35,
  today: Date = new Date()
): string {
  if (blocksBack === 0) return `Last ${Math.round(totalDays / 7)} weeks`;

  const anchor = new Date(today);
  anchor.setHours(0, 0, 0, 0);
  anchor.setDate(anchor.getDate() - blocksBack * totalDays);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - (totalDays - 1));

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(anchor)}`;
}

// ------------------------------------------------------------------
// XP milestones — real thresholds checked against the live xp total.
// ------------------------------------------------------------------
export interface XpMilestone {
  xp: number;
  label: string;
  icon: string;
}

export const XP_MILESTONES: XpMilestone[] = [
  { xp: 125, label: 'First Workout', icon: 'footsteps' },
  { xp: 500, label: 'Getting Serious', icon: 'flame' },
  { xp: 1000, label: 'Committed', icon: 'barbell' },
  { xp: 2500, label: 'Iron Will', icon: 'shield-checkmark' },
  { xp: 5000, label: 'XP Machine', icon: 'trophy' },
  { xp: 10000, label: 'Legend', icon: 'diamond' },
];
