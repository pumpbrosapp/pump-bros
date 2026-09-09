import { Friend } from '../types';

// The signed-in user is represented by this entry (Pratik), keeping
// XP/rank consistent between the Home leaderboard and the Profile screen.
export const CURRENT_USER_ID = '2';

// Starting XP the first time the app loads. From then on the real,
// running total lives in WorkoutContext and grows as workouts are logged.
export const INITIAL_USER_XP = 0;

export const CURRENT_USER: Friend = {
  id: CURRENT_USER_ID,
  name: 'Pratik',
  username: 'pratik',
  xp: INITIAL_USER_XP,
  lastActive: 'now',
  initials: 'P',
  color: '#4C8BF5',
};

// Other people on Pump Bros who aren't friends yet. They show up when the user
// searches by username on the Social page and can be added from there —
// nobody is auto-added as a placeholder friend anymore.
export const discoverableUsers: Friend[] = [
  { id: '1', name: 'Annika', username: 'annika', xp: 10874, lastActive: 'day over', initials: 'A', color: '#F4B400' },
  { id: '3', name: 'David', username: 'davidlifts', xp: 9898, lastActive: '2h ago', initials: 'D', color: '#34A853' },
  { id: '4', name: 'Matt', username: 'mattg', xp: 8953, lastActive: '1h ago', initials: 'M', color: '#8E44AD' },
  { id: '5', name: 'Jack', username: 'jackk', xp: 6363, lastActive: '30m ago', initials: 'J', color: '#795548' },
  { id: '6', name: 'Pranip', username: 'pranip', xp: 4836, lastActive: '22m ago', initials: 'PR', color: '#607D8B' },
  { id: '7', name: 'Brigette', username: 'brigette_b', xp: 4434, lastActive: '1h ago', initials: 'B', color: '#E91E63' },
];

// Same alphabet as generateLocalInviteCode in data/groups.ts (no 0/O/1/I
// — easy to read aloud), but deterministic rather than random: there's
// no backend in local/demo mode to hand out real codes, so every
// account (the signed-in user and each discoverableUser) needs to
// always resolve to the *same* code across renders/restarts for
// "redeem a code" to be testable at all in this mode.
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function localInviteCodeForUser(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_CHARS[hash % INVITE_CODE_CHARS.length];
    hash = (Math.floor(hash / INVITE_CODE_CHARS.length) + (i + 1) * 7919) >>> 0;
  }
  return code;
}
