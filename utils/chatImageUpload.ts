import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabaseClient';

const CHAT_IMAGE_BUCKET = 'chat-images';

// Chat photos don't need to retain camera-native resolution — nobody is
// pinch-zooming into a chat bubble. Capping the long edge keeps mobile
// uploads fast on cellular and keeps Supabase storage/egress in check.
// Re-encoding to JPEG also sidesteps HEIC output, which some Android
// clients and browsers can't render inline anyway.
const MAX_DIMENSION = 1600;
const COMPRESSION_QUALITY = 0.7;

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
// reason, so a picker quirk on some device can't block sending entirely.
async function prepareForUpload(
  localUri: string
): Promise<{ uri: string; ext: string }> {
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

// Uploads a locally-picked photo to the sender's folder in the
// chat-images bucket and returns a public URL suitable for storing in
// messages.image_url and for the other person's device to render
// directly. Unlike avatars, every attachment gets its own filename
// (rather than one fixed path per user) since a conversation can carry
// many photos over time and each needs to keep its own bytes around.
export async function uploadChatImage(userId: string, localUri: string): Promise<string> {
  const { uri, ext } = await prepareForUpload(localUri);
  const contentType = contentTypeFromExtension(ext);
  const path = `${userId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error: uploadError } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .upload(path, decode(base64), { contentType, upsert: false });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(CHAT_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
