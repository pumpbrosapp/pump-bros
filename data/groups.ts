// No demo/placeholder groups anymore — every user starts with zero
// groups and has to actually create or join one. (Previously this
// seeded a fake "Weekly Crew" group for every signed-in user, which
// showed up regardless of who they actually trained with.)

// Used only in local/no-Supabase fallback mode to generate a short,
// shareable code for a newly created group. In Supabase mode the real
// code comes back from the create_group() RPC instead (see schema.sql).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to read aloud

export function generateLocalInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
