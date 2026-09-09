import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabaseClient';

const AVATAR_BUCKET = 'avatars';

// Avatars render small (a few dozen px up to ~96px for the group settings
// ring) even though ImagePicker hands back a full camera-resolution crop
// (often several MB, more once base64-encoded). Uploading that untouched
// was slow enough on cellular to time out — this caps the long edge and
// re-encodes as JPEG before it ever hits FileSystem/Supabase, same fix
// already applied to chat images in chatImageUpload.ts.
const MAX_DIMENSION = 512;
const COMPRESSION_QUALITY = 0.8;

function extensionFromUri(uri: string): string {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri);
  const ext = match?.[1]?.toLowerCase();
  // ImagePicker occasionally hands back a URI with no extension at all
  // (some Android content:// URIs) — jpeg is a safe, universally
  // supported default for a photo library picker result.
  return ext && ext.length <= 5 ? ext : 'jpg';
}

function contentTypeFromExtension(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

// Downscales to MAX_DIMENSION on the long edge and re-encodes as JPEG.
// Falls back to the original URI/extension if manipulation fails for any
// reason, so a picker quirk on some device can't block the upload
// entirely — it just re-attempts with the original, larger file.
async function prepareForUpload(localUri: string): Promise<{ uri: string; ext: string }> {
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: COMPRESSION_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: manipulated.uri, ext: 'jpg' };
  } catch {
    return { uri: localUri, ext: extensionFromUri(localUri) };
  }
}

// Uploads a locally-picked image to the user's folder in the avatars
// bucket and returns a public URL suitable for storing in
// profiles.avatar_url and for any device to render directly. Local
// file:// (and content://) URIs can't be fetched by other people's
// devices, which is the whole reason this upload step exists.
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const { uri, ext } = await prepareForUpload(localUri);
  const contentType = contentTypeFromExtension(ext);
  // Fixed filename per user (rather than one-per-upload) so re-uploading
  // overwrites the old picture instead of leaving orphaned files behind
  // in storage every time someone changes their avatar.
  const path = `${userId}/avatar.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, decode(base64), { contentType, upsert: true });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  // Cache-bust: the path (and therefore the public URL) stays identical
  // across re-uploads, so without this an <Image> that already cached the
  // old bytes for that URL would keep showing the old picture even after
  // a successful re-upload.
  return `${data.publicUrl}?t=${Date.now()}`;
}

const GROUP_AVATAR_BUCKET = 'group-avatars';

// Same idea as uploadAvatar above, but keyed by group id instead of user
// id and written to the separate group-avatars bucket (see schema.sql —
// only the group's leader is allowed to write to a given group's folder
// there). Only ever called from GroupSettingsPanel, which is itself only
// reachable by the leader.
export async function uploadGroupAvatar(groupId: string, localUri: string): Promise<string> {
  const { uri, ext } = await prepareForUpload(localUri);
  const contentType = contentTypeFromExtension(ext);
  const path = `${groupId}/avatar.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error: uploadError } = await supabase.storage
    .from(GROUP_AVATAR_BUCKET)
    .upload(path, decode(base64), { contentType, upsert: true });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(GROUP_AVATAR_BUCKET).getPublicUrl(path);

  return `${data.publicUrl}?t=${Date.now()}`;
}
