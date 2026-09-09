import { Friend } from '../types';

// Supabase-backed groups now get a real weekly number from
// get_group_weekly_xp (see schema.sql + GroupsContext), which lands on
// friend.weeklyXp before this is ever called. This function only kicks in
// for the local, no-Supabase demo mode, where there's no workouts table to
// sum over — it approximates each friend's weekly number as a stable slice
// of their total, seeded off their id so it stays put between renders
// instead of jumping around. It must never be used as a stand-in for a
// real friend's real stats — that erodes trust the moment two people
// compare numbers and they don't add up.
export function estimateWeeklyXp(friend: Friend): number {
  if (typeof friend.weeklyXp === 'number') return friend.weeklyXp;

  let hash = 0;
  for (let i = 0; i < friend.id.length; i++) {
    hash = (hash * 31 + friend.id.charCodeAt(i)) >>> 0;
  }
  const fraction = 0.08 + (hash % 100 / 100) * 0.22; // roughly 8%-30% of lifetime total
  return Math.round((friend.xp * fraction) / 5) * 5;
}
