import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Check your .env file.',
  );
}

// Only the anon/public key belongs here. It's safe to bundle: RLS policies
// (see supabase/policies.sql) enforce what each signed-in user can access.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Default (implicit) flow — PKCE needs WebCrypto, which React Native lacks.
    // Password reset uses an emailed OTP code (verifyOtp), not a code-challenge.
    detectSessionInUrl: false,
  },
});
