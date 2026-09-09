import { XP_PER_WORKOUT } from '../context/WorkoutContext';

// Permanent AI "trainer" competitors that always show up on the combined
// leaderboard (You + Real Friends + AI Trainers) unless the user removes
// them individually. Unlike real friends, they're never fetched from a
// backend — their XP is simulated deterministically from the config below
// so it's stable within a day (no flicker on re-render / app restart) but
// keeps drifting day to day, the same way a real person's training does.
export interface AiTrainerConfig {
  id: string;
  name: string;
  username: string;
  initials: string;
  color: string;
  // Roughly how many days a week this trainer works out. Drives the
  // per-day probability of logging a session — not a hard schedule, so
  // the actual days land differently week to week.
  daysPerWeek: number;
  difficulty: 'Hardest' | 'Medium' | 'Easiest';
  // Scales the XP earned per session, on top of the frequency above, so
  // "hardest" also means bigger sessions, not just more of them.
  xpMultiplier: number;
}

export const AI_TRAINERS: AiTrainerConfig[] = [
  {
    id: 'trainer-joe',
    name: 'Trainer Joe',
    username: 'trainerjoe',
    initials: 'TJ',
    color: '#E0483E',
    daysPerWeek: 7,
    difficulty: 'Hardest',
    xpMultiplier: 1.2,
  },
  {
    id: 'trainer-max',
    name: 'Trainer Max',
    username: 'trainermax',
    initials: 'TM',
    color: '#FF8A3D',
    daysPerWeek: 5,
    difficulty: 'Medium',
    xpMultiplier: 1.0,
  },
  {
    id: 'trainer-leo',
    name: 'Trainer Leo',
    username: 'trainerleo',
    initials: 'TL',
    color: '#34A853',
    daysPerWeek: 3,
    difficulty: 'Easiest',
    xpMultiplier: 0.85,
  },
];

export function isAiTrainerId(id: string): boolean {
  return AI_TRAINERS.some((t) => t.id === id);
}

export function getTrainerConfig(id: string): AiTrainerConfig | undefined {
  return AI_TRAINERS.find((t) => t.id === id);
}

// --- Deterministic simulation --------------------------------------------
//
// Every trainer's history is derived from (trainerId, calendar day) so it
// never needs to be stored: the same day always resolves to the same
// workout/no-workout decision and the same XP, but which days "hit" and
// how big each session is still comes out different from one trainer (and
// one day) to the next — it just doesn't require a persisted log to do it.

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// mulberry32 — small, fast, deterministic PRNG seeded from the hash above.
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayIndexFor(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_DAY);
}

// Decides whether this trainer trained on a given day, and if so, how much
// XP that session was worth (using the same base per-workout XP real users
// earn, scaled by the trainer's difficulty).
function decideDay(config: AiTrainerConfig, dayIndex: number): { worked: boolean; xp: number } {
  const rand = mulberry32(hashString(`${config.id}:${dayIndex}`));
  const probability = config.daysPerWeek / 7;
  const worked = rand() < probability;
  if (!worked) return { worked: false, xp: 0 };

  const variation = (rand() - 0.5) * 0.4; // ±20% session-to-session swing
  const bigSession = rand() < 0.12; // occasional extra-good day
  let xp = XP_PER_WORKOUT * config.xpMultiplier * (1 + variation);
  if (bigSession) xp += XP_PER_WORKOUT * 0.5;
  return { worked: true, xp: Math.max(40, Math.round(xp)) };
}

// How many days of (simulated) training history feed into a trainer's
// displayed XP, at most — a safety cap so a very old account doesn't
// force thousands of PRNG calls on every render. Far beyond any account's
// realistic age, so it never kicks in during normal use.
const MAX_SIMULATION_DAYS = 3650;
// How far back to look for an active streak before giving up.
const STREAK_LOOKBACK_DAYS = 365;

export interface TrainerStats {
  xp: number;
  dayStreak: number;
}

const statsCache = new Map<string, TrainerStats>();

// Trainers accrue XP the same way the player does: starting from 0 on the
// day the account was created, not with a pre-existing backlog. Passing
// the signed-in user's join date as `startDate` means a brand-new player
// sees their AI trainers at 0 XP too, and both grow forward together from
// there — an existing account's trainers reflect the same real-world
// stretch of time the player themself has been training.
export function getTrainerStats(
  config: AiTrainerConfig,
  startDate: Date,
  referenceDate: Date = new Date()
): TrainerStats {
  const dateKey = referenceDate.toISOString().slice(0, 10);
  const startKey = startDate.toISOString().slice(0, 10);
  const cacheKey = `${config.id}_${startKey}_${dateKey}`;
  const cached = statsCache.get(cacheKey);
  if (cached) return cached;

  const todayIndex = dayIndexFor(referenceDate);
  const startIndex = dayIndexFor(startDate);
  // +1 so the start day itself counts as day one, same as a player who
  // could in principle log a workout the day they sign up.
  const daysElapsed = Math.min(Math.max(todayIndex - startIndex + 1, 0), MAX_SIMULATION_DAYS);

  let xp = 0;
  for (let i = 0; i < daysElapsed; i++) {
    xp += decideDay(config, startIndex + i).xp;
  }

  let dayStreak = 0;
  const streakLookback = Math.min(STREAK_LOOKBACK_DAYS, daysElapsed);
  for (let i = 0; i < streakLookback; i++) {
    if (!decideDay(config, todayIndex - i).worked) break;
    dayStreak++;
  }

  const result: TrainerStats = { xp, dayStreak };
  statsCache.set(cacheKey, result);
  return result;
}
