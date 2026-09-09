-- GYMBro Supabase schema.
-- Run this once, in full, in your Supabase project's SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: everything is guarded with IF NOT EXISTS / OR REPLACE.

-- ============================================================
-- profiles: one row per account, mirrors auth.users 1:1
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  xp integer not null default 0,
  day_streak integer not null default 0,
  streak_week jsonb not null default '[]'::jsonb,
  -- Mirrors the signed-in user's SplitContext (name of the preset/'Custom',
  -- plus the 7-day Mon-Sun pattern) so a friend's profile page can show
  -- their split without needing a live connection to their device.
  split_name text,
  split_days jsonb,
  initials text not null default '',
  color text not null default '#4C8BF5',
  -- Grants access to the admin report-management screen (see reports
  -- below). There's no in-app way to promote someone to admin — same
  -- "no admin role yet, use the SQL editor or service_role" approach as
  -- the rest of this schema — so this only ever gets set to true by
  -- staff running an update directly in the Supabase SQL editor.
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Safe to re-run on a profiles table that predates the split columns.
alter table public.profiles add column if not exists split_name text;
alter table public.profiles add column if not exists split_days jsonb;
alter table public.profiles add column if not exists is_admin boolean not null default false;

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by any signed-in user" on public.profiles;
create policy "Profiles are viewable by any signed-in user"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- xp/day_streak/streak_week feed every friend's and group's leaderboard,
-- so they can't be left client-writable the way profile fields like
-- display_name or avatar_url are — RLS above is row-level only, so
-- without this a signed-in user could call
-- supabase.from('profiles').update({ xp: 999999999 }) directly and have
-- it show up on everyone else's leaderboard. This is a column-level
-- revoke on top of that row-level policy: `authenticated` keeps UPDATE
-- on the rest of the row, but xp/day_streak/streak_week can now only be
-- changed by security-definer functions — namely log_workout() below —
-- which derive them from real workouts rows rather than trusting
-- whatever value a client sends. is_admin is revoked for the same
-- underlying reason (don't trust a client-supplied value for something
-- privileged) even though nothing grants it back via a function — it's
-- only ever set by staff directly in the SQL editor. Without this
-- revoke, the row-level policy above would let anyone grant themselves
-- admin access with supabase.from('profiles').update({ is_admin: true
-- }).eq('id', <self>).
revoke update (xp, day_streak, streak_week, is_admin) on public.profiles from authenticated;

-- ============================================================
-- invite_code: every profile's personal, shareable code for the
-- "invite a friend" feature (see use_invite_code() further down) —
-- distinct from friend_requests, redeeming one instantly friends the
-- two accounts with no accept step.
-- ============================================================
alter table public.profiles add column if not exists invite_code text;

-- Column-level lockdown, separate from the row-level "viewable by any
-- signed-in user" policy above: that policy would otherwise let any
-- authenticated user read everyone else's invite_code straight off the
-- profiles table (same as they can already read username/display_name),
-- which would make the code useless as something the owner chooses when
-- and with whom to share. Revoking SELECT on just this column means
-- nobody — not even the owner, via an ordinary `.select()` — can read it
-- through the profiles table; get_my_invite_code() below is the only way
-- back in, and it's scoped to auth.uid() by definition.
revoke select (invite_code) on public.profiles from authenticated;

-- One-time backfill for rows that predate this column (fresh installs
-- get theirs from handle_new_user() below instead). Safe to re-run —
-- only ever touches rows that still have a null code.
do $$
declare
  r record;
  code text;
  attempt int;
begin
  for r in select id from public.profiles where invite_code is null loop
    attempt := 0;
    loop
      code := upper(substr(md5(random()::text || clock_timestamp()::text || r.id::text), 1, 8));
      exit when not exists (select 1 from public.profiles p where p.invite_code = code);
      attempt := attempt + 1;
      if attempt > 20 then
        raise exception 'Could not generate a unique invite code for %', r.id;
      end if;
    end loop;
    update public.profiles set invite_code = code where id = r.id;
  end loop;
end $$;

alter table public.profiles alter column invite_code set not null;
alter table public.profiles drop constraint if exists profiles_invite_code_key;
alter table public.profiles add constraint profiles_invite_code_key unique (invite_code);

-- The only way to read the caller's own invite code, now that SELECT on
-- the column is revoked from authenticated above — security definer so
-- it can bypass that revoke, but only for exactly the caller's own row.
create or replace function public.get_my_invite_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select invite_code from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_my_invite_code() from public;
grant execute on function public.get_my_invite_code() to authenticated;

-- ============================================================
-- avatars storage bucket: public read (so friends can load each
-- other's picture from the URL saved in profiles.avatar_url), but
-- each user can only write inside their own folder, enforced by
-- requiring the object's path to start with their uid — the app
-- uploads to "<uid>/avatar.<ext>".
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Auto-create a profile row whenever someone signs up
-- (email, Google, or Apple all go through Supabase auth.users).
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
  display text;
  new_invite_code text;
  code_attempt int := 0;
begin
  display := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'user');
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'user'), '[^a-zA-Z0-9_]', '', 'g'));
  if base_username = '' then
    base_username := 'user';
  end if;
  final_username := base_username;

  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  loop
    new_invite_code := upper(substr(md5(random()::text || clock_timestamp()::text || new.id::text), 1, 8));
    exit when not exists (select 1 from public.profiles where invite_code = new_invite_code);
    code_attempt := code_attempt + 1;
    if code_attempt > 20 then
      raise exception 'Could not generate a unique invite code, try again';
    end if;
  end loop;

  insert into public.profiles (id, username, display_name, initials, color, invite_code)
  values (
    new.id,
    final_username,
    display,
    upper(left(display, 1)),
    ('#' || lpad(to_hex((abs(hashtext(new.id::text)) % 16777215)), 6, '0')),
    new_invite_code
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- friendships: directed "user_id added friend_id"
-- ============================================================
create table if not exists public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friendships enable row level security;

drop policy if exists "Users can view their own friendships" on public.friendships;
create policy "Users can view their own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "Users can add friends" on public.friendships;
create policy "Users can add friends"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own friends" on public.friendships;
create policy "Users can remove their own friends"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- friend_requests: "sender_id wants to be friends with receiver_id",
-- sits in front of friendships so the receiver gets to accept/decline
-- (and see it as a notification) instead of being added instantly.
-- ============================================================
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id),
  unique (sender_id, receiver_id)
);

alter table public.friend_requests enable row level security;

drop policy if exists "Users can view requests they sent or received" on public.friend_requests;
create policy "Users can view requests they sent or received"
  on public.friend_requests for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Re-declared further down once blocked_users/is_blocked_between exist,
-- to also reject a request across a block in either direction.
drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests"
  on public.friend_requests for insert
  to authenticated
  with check (auth.uid() = sender_id);

drop policy if exists "Users can delete their own friend requests" on public.friend_requests;
create policy "Users can delete their own friend requests"
  on public.friend_requests for delete
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Accepting has to (a) mark the request accepted and (b) create the
-- friendship in both directions so it shows up in both people's friends
-- list — but a plain client-side insert can't do the sender's row (RLS
-- on friendships only lets you insert user_id = yourself). So this runs
-- as a security definer function the receiver calls instead.
-- Re-declared further down once blocked_users/is_blocked_between exist,
-- to also reject accepting a request across a block.
create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
begin
  select * into req from public.friend_requests where id = request_id;

  if req is null then
    raise exception 'Request not found';
  end if;
  if req.receiver_id <> auth.uid() then
    raise exception 'Not authorized to accept this request';
  end if;
  if req.status <> 'pending' then
    raise exception 'Request already resolved';
  end if;

  update public.friend_requests set status = 'accepted' where id = request_id;

  insert into public.friendships (user_id, friend_id)
  values (req.sender_id, req.receiver_id)
  on conflict do nothing;

  insert into public.friendships (user_id, friend_id)
  values (req.receiver_id, req.sender_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;

-- ============================================================
-- Redeeming a personal invite code (see profiles.invite_code above):
-- instantly friends the caller with whoever the code belongs to, both
-- directions, no accept step. The code isn't readable off the profiles
-- table at all (see the revoke next to invite_code), so the only way to
-- get here is someone actually sharing their code/link.
-- Re-declared further down once blocked_users/is_blocked_between exist,
-- to also reject redeeming a code across a block, same as
-- accept_friend_request above.
-- ============================================================
create or replace function public.use_invite_code(code text)
returns table(id uuid, username text, display_name text, avatar_url text, xp integer, initials text, color text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter record;
begin
  select p.id, p.username, p.display_name, p.avatar_url, p.xp, p.initials, p.color
  into inviter
  from public.profiles p
  where p.invite_code = upper(trim(code));

  if inviter is null then
    raise exception 'Invalid invite code';
  end if;

  if inviter.id = auth.uid() then
    raise exception 'You cannot use your own invite code';
  end if;

  insert into public.friendships (user_id, friend_id)
  values (auth.uid(), inviter.id)
  on conflict do nothing;

  insert into public.friendships (user_id, friend_id)
  values (inviter.id, auth.uid())
  on conflict do nothing;

  -- Clean up any pending friend request between the two so it doesn't
  -- linger as a stale notification now that they're friends anyway.
  delete from public.friend_requests
  where status = 'pending'
    and (
      (sender_id = auth.uid() and receiver_id = inviter.id)
      or (sender_id = inviter.id and receiver_id = auth.uid())
    );

  return query select inviter.id, inviter.username, inviter.display_name, inviter.avatar_url, inviter.xp, inviter.initials, inviter.color;
end;
$$;

grant execute on function public.use_invite_code(text) to authenticated;

-- ============================================================
-- workouts: one row per logged workout, feeds xp/streak history
-- ============================================================
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  xp_earned integer not null default 0,
  -- Broad category tagged at log time (see types.ts WorkoutType). Kept to
  -- a small fixed set on purpose — no sets/reps/duration tracking.
  type text not null default 'strength' check (type in ('strength', 'cardio', 'other')),
  logged_at timestamptz not null default now()
);

-- If this table already exists from before workout types were added,
-- this brings it up to date without touching existing rows (they'll
-- default to 'strength'). Safe to re-run.
alter table public.workouts
  add column if not exists type text not null default 'strength';

alter table public.workouts enable row level security;

drop policy if exists "Users can view their own workouts" on public.workouts;
create policy "Users can view their own workouts"
  on public.workouts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can log their own workouts" on public.workouts;
create policy "Users can log their own workouts"
  on public.workouts for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Server-side streak math, mirroring computeDayStreak/computeStreakWeek
-- in data/workout.ts as closely as SQL allows. Both operate in UTC
-- calendar days (there's no client timezone to consult from here),
-- which can occasionally disagree with the client's own local-time
-- computation by a day near midnight — a cosmetic edge case, not a
-- security-relevant one, since the important thing is that these
-- numbers now come from real workouts rows instead of a client-sent
-- value.
-- ------------------------------------------------------------------

-- Port of isWorkoutDay + computeDayStreak: walks backward from today
-- counting consecutive logged days, skipping over rest days from the
-- user's split (or treating every day as required if no split is set),
-- stopping at the first required-but-missed day.
create or replace function public.compute_day_streak_for(uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  split_days jsonb;
  has_split boolean;
  logged_dates date[];
  cursor_date date := (now() at time zone 'utc')::date;
  today_key date := cursor_date;
  streak int := 0;
  js_dow int;
  is_required boolean;
begin
  select p.split_days into split_days from public.profiles p where p.id = uid;
  has_split := split_days is not null
    and jsonb_typeof(split_days) = 'array'
    and exists (select 1 from jsonb_array_elements(split_days) e where (e ->> 'label') is not null);

  -- Fetched once as a plain array so the loop below is pure in-memory
  -- comparison rather than one workouts query per day of history.
  select array_agg(distinct (w.logged_at at time zone 'utc')::date)
    into logged_dates
  from public.workouts w
  where w.user_id = uid;

  for i in 0..3649 loop
    if logged_dates is not null and cursor_date = any(logged_dates) then
      streak := streak + 1;
    else
      if not has_split then
        is_required := true;
      else
        js_dow := extract(dow from cursor_date)::int; -- 0=Sun..6=Sat, matches JS getDay()
        is_required := (split_days -> ((js_dow + 6) % 7) ->> 'label') is not null; -- split_days is Mon-first
      end if;

      if is_required and cursor_date <> today_key then
        exit;
      end if;
    end if;

    cursor_date := cursor_date - 1;
  end loop;

  return streak;
end;
$$;

-- Port of computeStreakWeek: this calendar week's Mon-Sun, flagging
-- which days actually have a logged workout.
create or replace function public.compute_streak_week_for(uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  monday_offset int := (extract(dow from today)::int + 6) % 7;
  monday date := today - monday_offset;
  labels text[] := array['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  logged_dates date[];
  result jsonb := '[]'::jsonb;
  d date;
begin
  select array_agg(distinct (w.logged_at at time zone 'utc')::date)
    into logged_dates
  from public.workouts w
  where w.user_id = uid and (w.logged_at at time zone 'utc')::date between monday and monday + 6;

  for i in 0..6 loop
    d := monday + i;
    result := result || jsonb_build_object(
      'day', labels[i + 1],
      'active', logged_dates is not null and d = any(logged_dates)
    );
  end loop;
  return result;
end;
$$;

-- Logs a workout for the caller and returns the authoritative totals.
-- xp_earned and the comeback bonus are computed entirely here from
-- fixed constants and the caller's real workout history — never from a
-- client-supplied number — then written into workouts + profiles in one
-- transaction. This is the only path that can move profiles.xp/
-- day_streak/streak_week now that direct column updates are revoked
-- above, so "log a workout" and "grant XP for it" can no longer be
-- pulled apart by a client calling the REST API directly.
--
-- XP_PER_WORKOUT (125) and COMEBACK_BONUS_XP (50) below must be kept in
-- sync with the constants of the same name in context/WorkoutContext.tsx.
create or replace function public.log_workout(p_type text default 'strength')
returns table(xp_earned integer, total_xp integer, day_streak integer, streak_week jsonb, is_comeback boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today_key date := (now() at time zone 'utc')::date;
  already_logged boolean;
  had_any_workout boolean;
  prior_streak int;
  bonus int := 0;
  earned int;
  new_xp int;
  new_streak int;
  new_week jsonb;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  if p_type not in ('strength', 'cardio', 'other') then
    raise exception 'Invalid workout type';
  end if;

  -- 'cardio' and everything else ('strength', 'other') are independent
  -- daily buckets: logging one never blocks the other, so the
  -- already-logged check only looks at rows in the *same* bucket as
  -- p_type rather than any workout logged today.
  if p_type = 'cardio' then
    select exists (
      select 1 from public.workouts w
      where w.user_id = uid
        and w.type = 'cardio'
        and (w.logged_at at time zone 'utc')::date = today_key
    ) into already_logged;
  else
    select exists (
      select 1 from public.workouts w
      where w.user_id = uid
        and w.type <> 'cardio'
        and (w.logged_at at time zone 'utc')::date = today_key
    ) into already_logged;
  end if;

  if already_logged then
    raise exception 'Already logged today';
  end if;

  select exists (select 1 from public.workouts w where w.user_id = uid) into had_any_workout;
  prior_streak := public.compute_day_streak_for(uid);

  if had_any_workout and prior_streak = 0 then
    bonus := 50; -- COMEBACK_BONUS_XP
  end if;

  earned := 125 + bonus; -- XP_PER_WORKOUT + bonus

  insert into public.workouts (user_id, xp_earned, type)
  values (uid, earned, p_type);

  update public.profiles
  set xp = xp + earned
  where id = uid
  returning xp into new_xp;

  new_streak := public.compute_day_streak_for(uid);
  new_week := public.compute_streak_week_for(uid);

  update public.profiles
  set day_streak = new_streak,
      streak_week = new_week
  where id = uid;

  return query select earned, new_xp, new_streak, new_week, (bonus > 0);
end;
$$;

grant execute on function public.log_workout(text) to authenticated;

-- ============================================================
-- messages: direct messages between two users (the "Message" button on
-- a friend's profile page, which only ever renders for friends — see
-- FriendProfileModal.tsx). Friends-only is enforced here too, not just
-- in the client: the insert policy below requires an existing
-- friendship, so a stranger can't reach your inbox by calling the API
-- directly. This matters more now that messages carry photos and
-- read receipts — an unsolicited DM used to just be unwanted text; now
-- it'd also hand a stranger an exact "they just opened it" timestamp,
-- which is the kind of presence signal that's worth restricting to
-- people you've actually chosen to connect with.
-- ============================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  -- Text is required unless the message carries a photo (image_url set) —
  -- a photo-only message is allowed to have an empty body.
  body text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id),
  check (char_length(trim(body)) > 0 or image_url is not null)
);

-- Safe to re-run on a messages table that predates photo attachments.
alter table public.messages add column if not exists image_url text;
alter table public.messages alter column body set default '';
-- Safe to re-run on a messages table that predates read receipts. Null
-- means unread; set once the receiver has actually opened the thread.
alter table public.messages add column if not exists read_at timestamptz;
-- Safe to re-run on a messages table that predates delivery tracking.
-- Null means the receiver's device hasn't taken receipt of it yet (e.g.
-- they're offline / the app is closed); set the moment their client
-- either gets it over Realtime or loads it via fetchMessages. Distinct
-- from read_at, which only fires once they've actually opened the thread.
alter table public.messages add column if not exists delivered_at timestamptz;
do $$
begin
  alter table public.messages drop constraint if exists messages_body_check;
  alter table public.messages add constraint messages_body_check
    check (char_length(trim(body)) > 0 or image_url is not null);
exception
  when duplicate_object then null;
end $$;

create index if not exists messages_conversation_idx
  on public.messages (least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at);

alter table public.messages enable row level security;

drop policy if exists "Users can view messages they sent or received" on public.messages;
create policy "Users can view messages they sent or received"
  on public.messages for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Requires an existing friendship before a message can be sent, so the
-- friends-only rule the UI already shows (see FriendProfileModal.tsx)
-- can't be bypassed by calling the API directly. accept_friend_request
-- always inserts both directions of a friendship, so checking one
-- direction would be enough in practice, but this checks both in case
-- anything ever inserts into friendships asymmetrically.
drop policy if exists "Users can send messages as themselves" on public.messages;
drop policy if exists "Users can send messages to friends only" on public.messages;
create policy "Users can send messages to friends only"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = receiver_id)
         or (f.user_id = receiver_id and f.friend_id = auth.uid())
    )
  );

drop policy if exists "Users can delete their own messages" on public.messages;
create policy "Users can delete their own messages"
  on public.messages for delete
  to authenticated
  using (auth.uid() = sender_id);

-- Full replica identity so a DELETE's realtime payload includes the row's
-- other columns (receiver_id, etc.), not just the primary key — the app
-- needs that to know who to notify that a message disappeared.
alter table public.messages replica identity full;

-- Marks every unread message from other_user_id to the signed-in user as
-- read, callable from the client as `supabase.rpc('mark_messages_read', {
-- other_user_id })`. Security-definer so the client only needs a single
-- narrow RPC rather than a general UPDATE policy on messages (which would
-- let a receiver rewrite a message's body/sender_id, not just read_at).
create or replace function public.mark_messages_read(other_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
  set read_at = now()
  where sender_id = other_user_id
    and receiver_id = auth.uid()
    and read_at is null;
$$;

grant execute on function public.mark_messages_read(uuid) to authenticated;

-- Marks specific messages as delivered, callable from the client as
-- `supabase.rpc('mark_messages_delivered', { message_ids })`. Called
-- with exactly the message ids the receiver's client just actually took
-- receipt of — a single id from the always-on inbox Realtime handler, or
-- a whole page's worth from fetchMessages after being offline. Scoped to
-- ids rather than "everything from this sender" so paging in one page of
-- history doesn't also mark later, not-yet-fetched backlog as delivered.
-- Security-definer for the same reason as mark_messages_read: a narrow
-- RPC instead of a general UPDATE policy on messages.
create or replace function public.mark_messages_delivered(message_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
  set delivered_at = now()
  where id = any(message_ids)
    and receiver_id = auth.uid()
    and delivered_at is null;
$$;

grant execute on function public.mark_messages_delivered(uuid[]) to authenticated;

-- ============================================================
-- message_hidden: per-user "delete for me" on a direct message, mirrors
-- group_message_hidden below. A row here means the named message no
-- longer shows up in that user's copy of the conversation — it's
-- untouched for the other party. Deliberately separate from the hard
-- delete on messages (sender-only, removes it for both sides) so the two
-- delete modes can't be confused: hiding never needs sender_id = caller,
-- since either side of a conversation can hide a message from their own
-- view regardless of who sent it.
-- ============================================================
create table if not exists public.message_hidden (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_hidden enable row level security;

drop policy if exists "Users can view their own hidden messages" on public.message_hidden;
create policy "Users can view their own hidden messages"
  on public.message_hidden for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can hide messages for themselves" on public.message_hidden;
create policy "Users can hide messages for themselves"
  on public.message_hidden for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_hidden.message_id
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );

-- Fetches one page of a direct conversation, newest-first, exactly like
-- the old direct `.from('messages').select(...)` call the client used to
-- make — except it also filters out anything the caller has hidden for
-- themselves. That filtering has to happen server-side, before the limit
-- is applied, or a page near a hidden message would silently come back
-- short (hidden rows still counted against the page size). Security
-- definer so it can join message_hidden without a client-visible policy
-- on it for the other party's hides; participation is still enforced
-- explicitly below since RLS is bypassed.
create or replace function public.fetch_messages(other_user_id uuid, before_ts timestamptz default null, page_size int default 50)
returns setof public.messages
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select m.*
    from public.messages m
    where ((m.sender_id = auth.uid() and m.receiver_id = other_user_id)
        or (m.sender_id = other_user_id and m.receiver_id = auth.uid()))
      and (before_ts is null or m.created_at < before_ts)
      and not exists (
        select 1 from public.message_hidden h
        where h.message_id = m.id and h.user_id = auth.uid()
      )
    order by m.created_at desc
    limit page_size;
end;
$$;

grant execute on function public.fetch_messages(uuid, timestamptz, int) to authenticated;

-- Returns the single most recent message from every direct conversation
-- the caller is part of — one row per conversation partner — for the
-- chat overview screen (the message icon on Home). `distinct on` picks
-- the latest row per unordered (sender, receiver) pair, matching the
-- pairing key messages_conversation_idx is built on. Same hidden-message
-- filtering and security-definer reasoning as fetch_messages above: a
-- hidden message shouldn't surface as the "latest" one, and the join
-- against message_hidden needs to bypass its owner-only RLS.
create or replace function public.fetch_conversations()
returns setof public.messages
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (least(m.sender_id, m.receiver_id), greatest(m.sender_id, m.receiver_id)) m.*
  from public.messages m
  where (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    and not exists (
      select 1 from public.message_hidden h
      where h.message_id = m.id and h.user_id = auth.uid()
    )
  order by least(m.sender_id, m.receiver_id), greatest(m.sender_id, m.receiver_id), m.created_at desc;
$$;

grant execute on function public.fetch_conversations() to authenticated;

-- ============================================================
-- chat-images storage bucket: public read (so the other person's
-- device can load a photo from the URL saved in messages.image_url),
-- but each user can only write inside their own folder, enforced the
-- same way as the avatars bucket — the app uploads to
-- "<uid>/<timestamp>.<ext>".
-- ============================================================
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

drop policy if exists "Chat images are publicly readable" on storage.objects;
create policy "Chat images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'chat-images');

drop policy if exists "Users can upload their own chat images" on storage.objects;
create policy "Users can upload their own chat images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own chat images" on storage.objects;
create policy "Users can delete their own chat images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lets ChatScreen subscribe to new rows in realtime instead of polling.
-- Safe to re-run: adding a table that's already in the publication errors,
-- so this is wrapped to just skip that case.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- Account deletion, callable from the client as
-- `supabase.rpc('delete_own_account')`. Runs as the table owner
-- (security definer) so it can remove the auth.users row, which then
-- cascades to profiles / friendships / workouts automatically. This is
-- the only privileged operation the app needs, so no service_role key
-- is ever shipped in the app itself.
-- ============================================================
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Storage objects are not foreign-key cascaded from auth.users, so remove
  -- this user's own profile/chat image objects explicitly before deleting
  -- the account record.
  delete from storage.objects
  where (bucket_id = 'avatars' or bucket_id = 'chat-images')
    and (storage.foldername(name))[1] = auth.uid()::text;

  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_account() to authenticated;

-- ============================================================
-- groups / group_members: real group creation + joining.
--
-- A group's roster is tracked in group_members rather than inferred from
-- the friends list, so GroupDetailModal shows who's actually *in* the
-- group instead of every friend the signed-in user happens to have.
-- Joining works by invite code (group_members can't be inserted for a
-- group you can't yet SELECT under the RLS policy below, so both
-- create and join go through security-definer RPCs, same pattern as
-- accept_friend_request above).
-- ============================================================
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  leader_id uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique,
  -- 'code' = join with the invite_code above; 'invite_only' = leader adds
  -- people directly, no self-serve join; 'public' = anyone can discover
  -- and join with one tap. Chosen by the leader at creation time.
  privacy text not null default 'code' check (privacy in ('code', 'invite_only', 'public')),
  -- Leader-set group photo (group-avatars storage bucket below). Null
  -- until the leader picks one — client falls back to a plain icon.
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Safe to re-run on a groups table that predates the privacy/avatar columns.
alter table public.groups add column if not exists privacy text not null default 'code';
alter table public.groups drop constraint if exists groups_privacy_check;
alter table public.groups add constraint groups_privacy_check check (privacy in ('code', 'invite_only', 'public'));
alter table public.groups add column if not exists avatar_url text;

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Security-definer helper so the RLS policies below can check membership
-- without a self-referential policy on group_members (which Postgres
-- disallows referencing directly inside its own table's policy).
create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = uid
  );
$$;

alter table public.groups enable row level security;

drop policy if exists "Members can view their groups" on public.groups;
create policy "Members can view their groups"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id, auth.uid()));

drop policy if exists "Leaders can delete their groups" on public.groups;
create policy "Leaders can delete their groups"
  on public.groups for delete
  to authenticated
  using (leader_id = auth.uid());

alter table public.group_members enable row level security;

drop policy if exists "Members can view their group's roster" on public.group_members;
create policy "Members can view their group's roster"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Members can remove themselves (leave)" on public.group_members;
create policy "Members can remove themselves (leave)"
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- group-avatars storage bucket: public read (so any member can load
-- the group's picture from the URL saved in groups.avatar_url), but
-- only the group's leader can write into that group's folder — the
-- app uploads to "<group_id>/avatar.<ext>", checked against
-- groups.leader_id rather than a folder-name-equals-uid rule like the
-- personal avatars bucket above, since the folder here is a group id.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('group-avatars', 'group-avatars', true)
on conflict (id) do nothing;

drop policy if exists "Group avatar images are publicly readable" on storage.objects;
create policy "Group avatar images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'group-avatars');

drop policy if exists "Leaders can upload their group's avatar" on storage.objects;
create policy "Leaders can upload their group's avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(name))[1] and g.leader_id = auth.uid()
    )
  );

drop policy if exists "Leaders can update their group's avatar" on storage.objects;
create policy "Leaders can update their group's avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(name))[1] and g.leader_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(name))[1] and g.leader_id = auth.uid()
    )
  );

drop policy if exists "Leaders can delete their group's avatar" on storage.objects;
create policy "Leaders can delete their group's avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(name))[1] and g.leader_id = auth.uid()
    )
  );

-- Creates a new group led by the caller, auto-generating a short unique
-- invite code (kept around even for invite_only/public groups in case the
-- leader ever switches modes, but only surfaced in the UI for 'code'
-- groups), and adds the caller as its first member. Returns both so the
-- client can show "share this code" right away without a refetch.
create or replace function public.create_group(group_name text, group_privacy text default 'code')
returns table(id uuid, invite_code text, privacy text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid := gen_random_uuid();
  code text;
  attempt int := 0;
begin
  if trim(group_name) = '' then
    raise exception 'Group name cannot be empty';
  end if;

  if group_privacy not in ('code', 'invite_only', 'public') then
    raise exception 'Invalid group privacy';
  end if;

  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate a unique invite code, try again';
    end if;
  end loop;

  insert into public.groups (id, name, leader_id, invite_code, privacy)
  values (new_id, trim(group_name), auth.uid(), code, group_privacy);

  insert into public.group_members (group_id, user_id)
  values (new_id, auth.uid());

  return query select new_id, code, group_privacy;
end;
$$;

grant execute on function public.create_group(text, text) to authenticated;

-- Looks a group up by its invite code and adds the caller to it. Only
-- works for 'code' privacy groups — invite_only/public groups reject a
-- code join even if someone guesses the underlying code. Has to run as
-- security definer since the caller can't SELECT a group under the RLS
-- policy above until *after* they're already a member of it.
create or replace function public.join_group_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  select * into target from public.groups where invite_code = upper(trim(code));

  if target is null or target.privacy <> 'code' then
    raise exception 'No group found for that code';
  end if;

  insert into public.group_members (group_id, user_id)
  values (target.id, auth.uid())
  on conflict do nothing;

  return target.id;
end;
$$;

grant execute on function public.join_group_by_code(text) to authenticated;

-- Browse joinable 'public' groups the caller isn't already in. Runs as
-- security definer since the base RLS policy on groups only lets members
-- see their own groups.
create or replace function public.list_public_groups()
returns table(id uuid, name text, leader_name text, member_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    coalesce(p.display_name, p.username) as leader_name,
    (select count(*) from public.group_members gm where gm.group_id = g.id) as member_count
  from public.groups g
  join public.profiles p on p.id = g.leader_id
  where g.privacy = 'public'
    and not exists (
      select 1 from public.group_members gm
      where gm.group_id = g.id and gm.user_id = auth.uid()
    )
  order by g.created_at desc;
$$;

grant execute on function public.list_public_groups() to authenticated;

-- Joins a 'public' group with no code needed. Security definer for the
-- same reason as join_group_by_code above.
create or replace function public.join_public_group(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  select * into target from public.groups where id = gid;

  if target is null or target.privacy <> 'public' then
    raise exception 'That group is not open to join';
  end if;

  insert into public.group_members (group_id, user_id)
  values (gid, auth.uid())
  on conflict do nothing;
end;
$$;

grant execute on function public.join_public_group(uuid) to authenticated;

-- Leader-only: adds one of the leader's friends straight into an
-- 'invite_only' group, no code and no request/approval step. Security
-- definer so it can both verify leadership and insert the membership in
-- one trusted step.
--
-- Dropped first because Postgres won't let `create or replace function`
-- rename an input parameter (e.g. an older deployed version using
-- `friend_id` instead of `p_friend_id`) - it errors with 42P13. Dropping
-- by signature and recreating immediately keeps this script safely
-- re-runnable without any gap in availability, and the grant right after
-- restores the same permissions the function had before.
drop function if exists public.invite_to_group(uuid, uuid);

create or replace function public.invite_to_group(gid uuid, p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  select * into target from public.groups where id = gid;

  if target is null then
    raise exception 'Group not found';
  end if;

  if target.leader_id <> auth.uid() then
    raise exception 'Only the group leader can invite people';
  end if;

  if target.privacy <> 'invite_only' then
    raise exception 'This group is not invite-only';
  end if;

  if not exists (
    select 1 from public.friendships
    where user_id = auth.uid() and friend_id = p_friend_id
  ) then
    raise exception 'You can only invite your friends';
  end if;

  insert into public.group_members (group_id, user_id)
  values (gid, p_friend_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.invite_to_group(uuid, uuid) to authenticated;

-- ============================================================
-- Leader management: rename/change privacy directly (own row,
-- ordinary RLS update), plus two security-definer RPCs for the parts
-- ordinary RLS can't express (regenerating the shared invite code
-- uniquely, and removing a member other than yourself).
-- ============================================================
drop policy if exists "Leaders can update their groups" on public.groups;
create policy "Leaders can update their groups"
  on public.groups for update
  to authenticated
  using (leader_id = auth.uid())
  with check (leader_id = auth.uid());

drop policy if exists "Leaders can remove members" on public.group_members;
create policy "Leaders can remove members"
  on public.group_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id and g.leader_id = auth.uid()
    )
  );

-- Leader-only: mints a fresh invite code for the group (e.g. if the old
-- one leaked). Security definer purely so uniqueness can be guaranteed
-- server-side the same way create_group does.
create or replace function public.regenerate_invite_code(gid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  code text;
  attempt int := 0;
begin
  select * into target from public.groups where id = gid;

  if target is null then
    raise exception 'Group not found';
  end if;
  if target.leader_id <> auth.uid() then
    raise exception 'Only the group leader can do that';
  end if;

  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.groups g where g.invite_code = code);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate a unique invite code, try again';
    end if;
  end loop;

  update public.groups set invite_code = code where id = gid;
  return code;
end;
$$;

grant execute on function public.regenerate_invite_code(uuid) to authenticated;

-- ============================================================
-- group_messages: chat scoped to a group, mirrors the direct-message
-- `messages` table but with one row per group instead of a pair of
-- users. Only current members can read or post.
-- ============================================================
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or image_url is not null)
);

create index if not exists group_messages_group_id_created_at_idx
  on public.group_messages (group_id, created_at);

alter table public.group_messages enable row level security;

drop policy if exists "Members can view their group's messages" on public.group_messages;
create policy "Members can view their group's messages"
  on public.group_messages for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Members can post to their group's chat" on public.group_messages;
create policy "Members can post to their group's chat"
  on public.group_messages for insert
  to authenticated
  with check (sender_id = auth.uid() and public.is_group_member(group_id, auth.uid()));

drop policy if exists "Members can delete their own group messages" on public.group_messages;
create policy "Members can delete their own group messages"
  on public.group_messages for delete
  to authenticated
  using (sender_id = auth.uid());

-- Same reasoning as messages above — lets a DELETE's realtime payload
-- carry group_id/sender_id so other members' clients know what to drop.
alter table public.group_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- group_message_reads: one row per (group, member) tracking how far
-- into the conversation that member has read — a read *cursor*, not a
-- per-message row. Deliberately not shaped like `messages.read_at`
-- (one timestamp per message) because a group has many recipients per
-- message; storing "member X has read up through time T" scales to a
-- busy group chat without a row per message per member. Wiped for a
-- member the moment they leave (group_id/user_id both cascade), so a
-- former member's old cursor never confuses a "seen by" count for
-- people still in the group.
-- ============================================================
create table if not exists public.group_message_reads (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_message_reads enable row level security;

drop policy if exists "Members can view their group's read receipts" on public.group_message_reads;
create policy "Members can view their group's read receipts"
  on public.group_message_reads for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- No client-facing insert/update policy — writes only happen through
-- mark_group_messages_read below (security definer), same reasoning as
-- mark_messages_read on the 1:1 side: a narrow RPC instead of a general
-- UPDATE policy that would let a client backdate its own read_at.

do $$
begin
  alter publication supabase_realtime add table public.group_message_reads;
exception
  when duplicate_object then null;
end $$;

-- Advances the caller's read cursor for a group to "now" — call whenever
-- the group's chat is actually on screen. Because it's a single cursor
-- rather than per-message rows, this is a flat upsert: no need to look
-- up which messages are new, and no risk of the cursor ever needing to
-- move backwards.
create or replace function public.mark_group_messages_read(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(gid, auth.uid()) then
    raise exception 'Not a member of this group';
  end if;

  insert into public.group_message_reads (group_id, user_id, read_at)
  values (gid, auth.uid(), now())
  on conflict (group_id, user_id)
  do update set read_at = excluded.read_at;
end;
$$;

grant execute on function public.mark_group_messages_read(uuid) to authenticated;

-- ============================================================
-- group_message_hidden: per-user "delete for me". A row here means the
-- named message no longer shows up in that user's copy of the thread —
-- it's untouched for everyone else. Deliberately separate from the hard
-- delete on group_messages (sender-only, removes it for the whole
-- group) so the two delete modes can't be confused with each other:
-- hiding never needs sender_id = caller, since anyone can hide a message
-- from their own view regardless of who sent it.
-- ============================================================
create table if not exists public.group_message_hidden (
  message_id uuid not null references public.group_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.group_message_hidden enable row level security;

drop policy if exists "Users can view their own hidden messages" on public.group_message_hidden;
create policy "Users can view their own hidden messages"
  on public.group_message_hidden for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can hide messages for themselves" on public.group_message_hidden;
create policy "Users can hide messages for themselves"
  on public.group_message_hidden for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_messages gm
      where gm.id = group_message_hidden.message_id
        and public.is_group_member(gm.group_id, auth.uid())
    )
  );

-- Fetches one page of a group's messages, newest-first, exactly like the
-- old direct `.from('group_messages').select(...)` call the client used
-- to make — except it also filters out anything the caller has hidden
-- for themselves. That filtering has to happen server-side, before the
-- limit is applied, or a page near a hidden message would silently come
-- back short (hidden rows still counted against the page size). Security
-- definer so it can join group_message_hidden without a client-visible
-- policy on it for other members' hides; membership is still enforced
-- explicitly below since RLS is bypassed.
create or replace function public.fetch_group_messages(gid uuid, before_ts timestamptz default null, page_size int default 50)
returns setof public.group_messages
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(gid, auth.uid()) then
    raise exception 'Not a member of this group';
  end if;

  return query
    select gm.*
    from public.group_messages gm
    where gm.group_id = gid
      and (before_ts is null or gm.created_at < before_ts)
      and not exists (
        select 1 from public.group_message_hidden h
        where h.message_id = gm.id and h.user_id = auth.uid()
      )
    order by gm.created_at desc
    limit page_size;
end;
$$;

grant execute on function public.fetch_group_messages(uuid, timestamptz, int) to authenticated;

-- Real per-member "this week" XP for a group's weekly leaderboard tab,
-- summed straight from workouts.xp_earned over the trailing 7 days.
-- Security definer so it can read other members' workouts, which the
-- base "Users can view their own workouts" RLS policy above wouldn't
-- otherwise allow; membership is checked explicitly below since RLS is
-- bypassed, same reasoning as fetch_group_messages. Only ever returns a
-- summed total per user, never individual workout rows, so it can't be
-- used to see what or when a friend actually trained.
create or replace function public.get_group_weekly_xp(gid uuid)
returns table(user_id uuid, weekly_xp bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(gid, auth.uid()) then
    raise exception 'Not a member of this group';
  end if;

  return query
    select gm.user_id, coalesce(sum(w.xp_earned), 0)::bigint as weekly_xp
    from public.group_members gm
    left join public.workouts w
      on w.user_id = gm.user_id
      and w.logged_at >= now() - interval '7 days'
    where gm.group_id = gid
    group by gm.user_id;
end;
$$;

grant execute on function public.get_group_weekly_xp(uuid) to authenticated;

-- ============================================================
-- PUSH NOTIFICATIONS
--
-- Everything below adds real push delivery for friend requests, DMs,
-- and group chat, so that stuff arriving while the app isn't open
-- doesn't just sit invisible until the next foreground. Three parts:
--
--   1. push_tokens          - one row per signed-in device
--   2. profiles.notification_prefs - per-category on/off, synced down
--      from NotificationSettingsScreen so the server can honor a
--      user's toggles instead of blasting everything regardless
--   3. triggers on insert/update of friend_requests, messages, and
--      group_messages that fire the "send-push" Edge Function via
--      pg_net, which is what actually calls Expo's push API.
--
-- One-time setup this file CANNOT do for you (needs your project's
-- own URL/keys, which don't belong in a file checked into source
-- control): after running this script, also do the two steps under
-- "Push delivery" in NOTIFICATIONS_SETUP.md. Until that's done, these
-- triggers no-op safely (checked via the `fn_url is null` guard below)
-- rather than erroring out or blocking inserts.
-- ============================================================

-- Per-device Expo push token. Composite primary key (not just user_id)
-- because one account can be signed in on more than one device at once
-- (phone + tablet, or a reinstall that grabs a new token before the old
-- one is known stale) — all of them should get the push.
create table if not exists public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'web', 'unknown')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can view their own push tokens" on public.push_tokens;
create policy "Users can view their own push tokens"
  on public.push_tokens for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can register their own push tokens" on public.push_tokens;
create policy "Users can register their own push tokens"
  on public.push_tokens for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can refresh their own push tokens" on public.push_tokens;
create policy "Users can refresh their own push tokens"
  on public.push_tokens for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own push tokens" on public.push_tokens;
create policy "Users can remove their own push tokens"
  on public.push_tokens for delete
  to authenticated
  using (auth.uid() = user_id);

-- Mirrors the shape of NotificationSettingsScreen's local AsyncStorage
-- prefs, so the client can push the same object up wholesale instead of
-- mapping field-by-field. Read by the send-push Edge Function (via the
-- service role key, which bypasses RLS) before it ever sends anything.
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{
    "pushEnabled": true,
    "friendRequests": true,
    "messages": true,
    "groupActivity": true,
    "workoutReminders": true,
    "streakReminders": true
  }'::jsonb;

-- Already covered by the existing "Users can update their own profile"
-- policy (auth.uid() = id, no column restriction), so no new policy
-- needed for notification_prefs specifically.

create extension if not exists pg_net with schema extensions;

-- Lets the client check (without ever seeing the secret values) whether
-- the Vault secrets notify_push_webhook needs are actually set. Without
-- this, a project that skipped the NOTIFICATIONS_SETUP.md Vault step
-- looks completely fine — the app builds, signs in, registers a push
-- token — and pushes just silently never arrive, with nothing in the
-- client's own logs to point at why. See lib/pushNotifications.ts /
-- PushNotificationsContext.tsx for where this gets called and reported.
create or replace function public.push_backend_configured()
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text;
  fn_key text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'edge_function_url';
  select decrypted_secret into fn_key from vault.decrypted_secrets where name = 'edge_function_service_key';
  return fn_url is not null and fn_key is not null;
end;
$$;

grant execute on function public.push_backend_configured() to authenticated;

-- Fires the send-push Edge Function for one row change. Reads the
-- function's URL and the service-role key it needs out of Vault rather
-- than hardcoding them here, since this file is meant to be safe to
-- check into source control and re-run on any project. See
-- NOTIFICATIONS_SETUP.md for the one-time `vault.create_secret` calls
-- that populate them.
create or replace function public.notify_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text;
  fn_key text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'edge_function_url';
  select decrypted_secret into fn_key from vault.decrypted_secrets where name = 'edge_function_service_key';

  -- Not configured yet (fresh clone of the repo, secrets not set up) —
  -- skip quietly. The insert/update this trigger is attached to must
  -- never fail just because push isn't wired up.
  if fn_url is null or fn_key is null then
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || fn_key),
    body := jsonb_build_object(
      'table', tg_table_name,
      'type', tg_op,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    )
  );

  return coalesce(new, old);
end;
$$;

-- New friend request -> push the receiver.
drop trigger if exists push_on_friend_request on public.friend_requests;
create trigger push_on_friend_request
  after insert on public.friend_requests
  for each row execute function public.notify_push_webhook();

-- Request accepted -> push the original sender back.
drop trigger if exists push_on_friend_request_accepted on public.friend_requests;
create trigger push_on_friend_request_accepted
  after update on public.friend_requests
  for each row
  when (new.status = 'accepted' and old.status = 'pending')
  execute function public.notify_push_webhook();

-- New direct message -> push the receiver.
drop trigger if exists push_on_message on public.messages;
create trigger push_on_message
  after insert on public.messages
  for each row execute function public.notify_push_webhook();

-- New group chat message -> push every other member (fanned out inside
-- the Edge Function, since a single row here has many recipients).
drop trigger if exists push_on_group_message on public.group_messages;
create trigger push_on_group_message
  after insert on public.group_messages
  for each row execute function public.notify_push_webhook();

-- ============================================================
-- blocked_users: directed "blocker_id has blocked blocked_id".
--
-- The direct-message insert policy below is wired up to reject a new
-- message in either direction between two users with a block between
-- them (see is_blocked_between and "Users can send messages to
-- friends only" further down). Friend requests and other surfaces are
-- a separate change.
-- ============================================================
create table if not exists public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocked_users enable row level security;

-- Only the blocker can see their own block list. Deliberately NOT
-- `auth.uid() = blocker_id or auth.uid() = blocked_id` — a blocked
-- user should not be able to discover, via a client-side query, that
-- they've been blocked or by whom.
drop policy if exists "Users can view their own block list" on public.blocked_users;
create policy "Users can view their own block list"
  on public.blocked_users for select
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "Users can block others" on public.blocked_users;
create policy "Users can block others"
  on public.blocked_users for insert
  to authenticated
  with check (auth.uid() = blocker_id);

-- No update policy: rows are add/remove only, so there's nothing to
-- change in place. With RLS enabled and no update policy, `authenticated`
-- gets no UPDATE on this table at all.

drop policy if exists "Users can unblock" on public.blocked_users;
create policy "Users can unblock"
  on public.blocked_users for delete
  to authenticated
  using (auth.uid() = blocker_id);

-- Security-definer so this can see both sides of a block regardless of
-- which way it points — a plain subquery from an ordinary RLS policy
-- would only ever see rows where the *current* user is the blocker
-- (see the select policy above), so it could never catch "the person
-- I'm messaging has blocked me" without leaking who blocked whom.
create or replace function public.is_blocked_between(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.blocked_users
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
$$;

revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Re-declare the DM insert policy (originally defined alongside the
-- messages table, above) now that blocked_users/is_blocked_between
-- exist, so a message can't be sent in either direction across a
-- block — whether the sender blocked the receiver, or the receiver
-- blocked the sender.
drop policy if exists "Users can send messages to friends only" on public.messages;
create policy "Users can send messages to friends only"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = receiver_id)
         or (f.user_id = receiver_id and f.friend_id = auth.uid())
    )
    and not public.is_blocked_between(auth.uid(), receiver_id)
  );

-- Re-declare the friend-request insert policy (originally defined
-- alongside friend_requests, above) now that blocked_users/
-- is_blocked_between exist. Without this, blocking someone only ever
-- stopped them from messaging you (see the messages policy above) —
-- they could still spam friend requests at the account that just
-- blocked them, which defeats the point of "block" as a way to stop
-- unwanted contact. Checked in both directions for the same reason as
-- the messages policy: it shouldn't matter whether the sender blocked
-- the receiver or the receiver blocked the sender.
drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests"
  on public.friend_requests for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and not public.is_blocked_between(auth.uid(), receiver_id)
  );

-- Re-declare accept_friend_request (originally defined alongside
-- friend_requests, above) now that blocked_users/is_blocked_between
-- exist. Defense in depth for the case where a block was created
-- *after* a request was already sent and left pending: without this,
-- the insert-time check above wouldn't have fired yet, and the
-- receiver could still accept a request from someone they've since
-- blocked (or vice versa), creating a friendship — and therefore
-- future message eligibility once/if the block is later lifted —
-- between two people the block was meant to keep apart.
create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
begin
  select * into req from public.friend_requests where id = request_id;

  if req is null then
    raise exception 'Request not found';
  end if;
  if req.receiver_id <> auth.uid() then
    raise exception 'Not authorized to accept this request';
  end if;
  if req.status <> 'pending' then
    raise exception 'Request already resolved';
  end if;
  if public.is_blocked_between(req.sender_id, req.receiver_id) then
    raise exception 'Cannot accept this request';
  end if;

  update public.friend_requests set status = 'accepted' where id = request_id;

  insert into public.friendships (user_id, friend_id)
  values (req.sender_id, req.receiver_id)
  on conflict do nothing;

  insert into public.friendships (user_id, friend_id)
  values (req.receiver_id, req.sender_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;

-- Re-declare use_invite_code (originally defined alongside
-- friend_requests, above) now that blocked_users/is_blocked_between
-- exist, so a code can't be redeemed across a block in either
-- direction — same reasoning as the messages/friend_requests policies
-- and accept_friend_request above.
create or replace function public.use_invite_code(code text)
returns table(id uuid, username text, display_name text, avatar_url text, xp integer, initials text, color text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter record;
begin
  select p.id, p.username, p.display_name, p.avatar_url, p.xp, p.initials, p.color
  into inviter
  from public.profiles p
  where p.invite_code = upper(trim(code));

  if inviter is null then
    raise exception 'Invalid invite code';
  end if;

  if inviter.id = auth.uid() then
    raise exception 'You cannot use your own invite code';
  end if;

  if public.is_blocked_between(auth.uid(), inviter.id) then
    raise exception 'Invalid invite code';
  end if;

  insert into public.friendships (user_id, friend_id)
  values (auth.uid(), inviter.id)
  on conflict do nothing;

  insert into public.friendships (user_id, friend_id)
  values (inviter.id, auth.uid())
  on conflict do nothing;

  delete from public.friend_requests
  where status = 'pending'
    and (
      (sender_id = auth.uid() and receiver_id = inviter.id)
      or (sender_id = inviter.id and receiver_id = auth.uid())
    );

  return query select inviter.id, inviter.username, inviter.display_name, inviter.avatar_url, inviter.xp, inviter.initials, inviter.color;
end;
$$;

grant execute on function public.use_invite_code(text) to authenticated;

-- ============================================================
-- reports: user-submitted reports of other users, optionally
-- pointing at the specific content (a DM or group message) that
-- prompted the report. Regular users can only insert their own
-- reports and see their own submitted history; reviewing and
-- changing a report's status is restricted to admins (profiles.is_admin)
-- via the admin report screen in the app — see the policies below.
-- ============================================================

-- Security-definer so this can check profiles.is_admin without relying
-- on the caller already having select access to that row a different
-- way — kept as its own function (rather than an inline subquery in
-- every policy below) so the "what counts as an admin" check lives in
-- exactly one place.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = uid),
    false
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  -- Optional pointer at the specific content being reported. Polymorphic
  -- (message vs group_message) rather than a plain foreign key, since a
  -- report can target either table or no content at all (e.g. reporting
  -- a profile in general). Not enforced as an FK for that reason; the
  -- content may also be deleted/hidden later without invalidating the
  -- report, which is why deletion of a message doesn't cascade here.
  content_type text check (content_type in ('message', 'group_message')),
  content_id uuid,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id),
  check (char_length(trim(reason)) > 0),
  check (
    (content_type is null and content_id is null)
    or (content_type is not null and content_id is not null)
  )
);

create index if not exists reports_reported_user_idx
  on public.reports (reported_user_id);

alter table public.reports enable row level security;

-- Reporters can see their own submitted reports (e.g. to show "report
-- sent" state in the UI) but not reports filed against them or by
-- other users — same reasoning as blocked_users: a reported user
-- should not be able to discover, via a client-side query, that
-- they've been reported or by whom.
drop policy if exists "Users can view their own submitted reports" on public.reports;
create policy "Users can view their own submitted reports"
  on public.reports for select
  to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "Users can report other users" on public.reports;
create policy "Users can report other users"
  on public.reports for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and reported_user_id <> auth.uid()
    and status = 'pending'
  );

-- Admins can see every report, not just their own — this is a second,
-- permissive select policy alongside "Users can view their own
-- submitted reports" above; Postgres OR's multiple permissive policies
-- for the same command together, so this only ever adds visibility, it
-- never takes away a regular user's ability to see their own reports.
drop policy if exists "Admins can view all reports" on public.reports;
create policy "Admins can view all reports"
  on public.reports for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- Admins can update a report's status; nobody else gets an update
-- policy at all, so a non-admin's update matches zero rows regardless
-- of what they target. Column-level revoke below (mirrors the
-- xp/day_streak/streak_week pattern on profiles) further limits even an
-- admin's client-side update to just the status column, so this policy
-- can't be used to rewrite who reported whom or what was reported.
drop policy if exists "Admins can update report status" on public.reports;
create policy "Admins can update report status"
  on public.reports for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

revoke update (reporter_id, reported_user_id, content_type, content_id, reason, created_at)
  on public.reports from authenticated;

-- No delete policy for anyone — resolved/dismissed reports are kept
-- for the record rather than removed.
