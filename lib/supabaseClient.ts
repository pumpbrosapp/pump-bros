import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../config/supabase';

// Falls back to a harmless placeholder URL when not configured so the
// client can be constructed without throwing — callers check
// `isSupabaseConfigured` before actually using it (see AuthContext).
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // PKCE (rather than the default implicit flow) is what Supabase
      // recommends for native apps: the confirmation/magic-link URL
      // carries a short-lived `code` param instead of tokens in a URL
      // fragment, which is what AuthContext's deep-link handler expects
      // when it calls exchangeCodeForSession() on the pumpbros://
      // auth-callback link.
      flowType: 'pkce',
    },
  }
);

export { isSupabaseConfigured };
