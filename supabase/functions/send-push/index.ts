// send-push
//
// Called by the Postgres triggers in supabase/schema.sql (via pg_net)
// whenever a friend request, direct message, or group message is
// inserted — or a friend request is accepted. Turns that row change
// into one or more real push notifications through Expo's push API,
// so the recipient finds out even if the app isn't open.
//
// Deploy with: supabase functions deploy send-push
// (see NOTIFICATIONS_SETUP.md for the one-time setup this depends on)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type PrefKey = 'friendRequests' | 'messages' | 'groupActivity';

interface PushTarget {
  userId: string;
  prefKey: PrefKey;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

interface WebhookPayload {
  table: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: any;
  old_record: any;
}

Deno.serve(async (req) => {
  // Only the Postgres trigger — which reads this same key out of Vault —
  // should ever be able to call this successfully. Anyone else gets 401.
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  try {
    const targets = await resolveTargets(payload);
    const sent = targets.length ? await sendPushes(targets) : 0;
    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // pg_net fires this and doesn't retry on failure, so log and return
    // 200 rather than letting a push-delivery bug ever look like it
    // should block/retry the database write that triggered it.
    console.error('send-push error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 200 });
  }
});

async function resolveTargets({ table, type, record, old_record }: WebhookPayload): Promise<PushTarget[]> {
  if (table === 'friend_requests' && type === 'INSERT') {
    const sender = await getProfile(record.sender_id);
    if (!sender) return [];
    return [
      {
        userId: record.receiver_id,
        prefKey: 'friendRequests',
        title: 'New friend request',
        body: `${displayName(sender)} wants to be friends.`,
        data: { type: 'friend_request', fromUserId: record.sender_id },
      },
    ];
  }

  if (
    table === 'friend_requests' &&
    type === 'UPDATE' &&
    record.status === 'accepted' &&
    old_record?.status === 'pending'
  ) {
    const receiver = await getProfile(record.receiver_id);
    if (!receiver) return [];
    return [
      {
        userId: record.sender_id,
        prefKey: 'friendRequests',
        title: 'Friend request accepted',
        body: `${displayName(receiver)} accepted your friend request.`,
        data: { type: 'friend_accept', fromUserId: record.receiver_id },
      },
    ];
  }

  if (table === 'messages' && type === 'INSERT') {
    const sender = await getProfile(record.sender_id);
    if (!sender) return [];
    return [
      {
        userId: record.receiver_id,
        prefKey: 'messages',
        title: displayName(sender),
        body: previewBody(record.body, record.image_url),
        data: { type: 'message', fromUserId: record.sender_id },
      },
    ];
  }

  if (table === 'group_messages' && type === 'INSERT') {
    const [sender, group, memberIds] = await Promise.all([
      getProfile(record.sender_id),
      getGroup(record.group_id),
      getOtherGroupMembers(record.group_id, record.sender_id),
    ]);
    if (!sender || !group || memberIds.length === 0) return [];
    const body = `${displayName(sender)}: ${previewBody(record.body, record.image_url)}`;
    return memberIds.map((userId) => ({
      userId,
      prefKey: 'groupActivity' as const,
      title: group.name,
      body,
      data: { type: 'group_message', groupId: record.group_id },
    }));
  }

  return [];
}

function displayName(profile: { display_name: string | null; username: string }): string {
  return profile.display_name || profile.username;
}

function previewBody(body: string | null, imageUrl: string | null): string {
  if (body && body.trim().length > 0) {
    return body.length > 80 ? `${body.slice(0, 79)}…` : body;
  }
  return imageUrl ? 'Sent a photo' : '';
}

async function getProfile(id: string) {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', id)
    .maybeSingle();
  return data;
}

async function getGroup(id: string) {
  const { data } = await supabase.from('groups').select('name').eq('id', id).maybeSingle();
  return data;
}

async function getOtherGroupMembers(groupId: string, excludeUserId: string): Promise<string[]> {
  const { data } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .neq('user_id', excludeUserId);
  return (data ?? []).map((row) => row.user_id as string);
}

// Sends the actual pushes, after filtering out anyone who's muted this
// notification category in their NotificationSettingsScreen prefs.
async function sendPushes(targets: PushTarget[]): Promise<number> {
  const candidateUserIds = [...new Set(targets.map((t) => t.userId))];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, notification_prefs')
    .in('id', candidateUserIds);
  const prefsById = new Map((profiles ?? []).map((p) => [p.id, p.notification_prefs ?? {}]));

  const allowedTargets = targets.filter((t) => {
    const prefs = prefsById.get(t.userId) ?? {};
    return prefs.pushEnabled !== false && prefs[t.prefKey] !== false;
  });
  if (allowedTargets.length === 0) return 0;

  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', [...new Set(allowedTargets.map((t) => t.userId))]);

  const tokensByUser = new Map<string, string[]>();
  for (const row of tokenRows ?? []) {
    const list = tokensByUser.get(row.user_id) ?? [];
    list.push(row.token);
    tokensByUser.set(row.user_id, list);
  }

  const messages: Record<string, unknown>[] = [];
  for (const target of allowedTargets) {
    for (const token of tokensByUser.get(target.userId) ?? []) {
      messages.push({
        to: token,
        title: target.title,
        body: target.body,
        data: target.data,
        sound: 'default',
      });
    }
  }
  if (messages.length === 0) return 0;

  // Expo caps a single push request at 100 messages per call.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(chunk),
    });
  }

  return messages.length;
}
