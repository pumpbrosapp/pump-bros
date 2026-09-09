import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { colors, radius, shadow, type } from '../theme';
import { HapticTouchableOpacity as TouchableOpacity } from '../components/Haptic';
import { useAuth } from '../context/AuthContext';
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  isGoogleSignInConfigured,
} from '../config/auth';
import LegalDocumentsModal, { LegalDocument } from '../components/LegalDocumentsModal';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'signIn' | 'signUp';

export default function AuthScreen() {
  const [legalVisible, setLegalVisible] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument>('privacy');
  const { signInWithEmail, signUpWithEmail, completeGoogleSignIn, completeAppleSignIn, error, clearError } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  // useIdTokenAuthRequest (rather than the plain access-token request)
  // returns a signed Google ID token, which is what Supabase needs to
  // link this sign-in to an account via signInWithIdToken. Decoding the
  // token's payload also gives us name/email locally, so we don't need a
  // separate userinfo fetch either way.
  const [request, response, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params?.id_token ?? response.authentication?.idToken;
    if (!idToken) return;

    (async () => {
      try {
        setSubmitting(true);
        const claims = decodeJwtPayload(idToken);
        await completeGoogleSignIn({
          idToken,
          id: claims?.sub ?? idToken,
          email: claims?.email ?? null,
          name: claims?.name ?? null,
        });
      } catch {
        Alert.alert('Google sign-in failed', 'Something went wrong signing you in. Please try again.');
      } finally {
        setSubmitting(false);
      }
    })();
  }, [response, completeGoogleSignIn]);

  const isSignUp = mode === 'signUp';

  const switchMode = (next: Mode) => {
    clearError();
    setMode(next);
  };

  const handleEmailSubmit = async () => {
    clearError();
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
    } catch {
      // Error message already set in context; swallow so we don't throw
      // an unhandled rejection warning.
    } finally {
      setSubmitting(false);
    }
  };

  const handleGooglePress = async () => {
    if (!isGoogleSignInConfigured) {
      Alert.alert(
        'Google sign-in not configured',
        'Add your Google OAuth client IDs in config/auth.ts to enable this button. See the comments in that file for setup steps.'
      );
      return;
    }
    try {
      await promptGoogleAsync();
    } catch {
      Alert.alert('Google sign-in failed', 'Please try again.');
    }
  };

  const handleApplePress = async () => {
    try {
      // Supabase's native Apple flow wants the raw nonce (to re-hash and
      // compare against the one baked into the signed identity token) —
      // this stops a captured token from being replayed later.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ')
        : null;
      setSubmitting(true);
      await completeAppleSignIn({
        idToken: credential.identityToken,
        nonce: rawNonce,
        id: credential.user,
        email: credential.email,
        name: fullName,
      });
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple sign-in failed', 'Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitEmail = useMemo(() => {
    if (submitting) return false;
    if (!email.trim() || password.length < 6) return false;
    return true;
  }, [email, password, submitting]);

  return (
    <View style={styles.container}>
      <Svg style={styles.bgGradient} width="100%" height={380} pointerEvents="none">
        <Defs>
          <LinearGradient id="authBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.backgroundGradientTop} stopOpacity="1" />
            <Stop offset="0.6" stopColor={colors.background} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height={380} fill="url(#authBg)" />
      </Svg>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandBlock}>
              <View style={styles.brandMark}>
                <Ionicons name="flash" size={22} color={colors.iconOnDark} />
              </View>
              <Text style={styles.title}>{isSignUp ? 'Create your account' : 'Welcome back'}</Text>
              <Text style={styles.subtitle}>
                {isSignUp
                  ? 'Sign up to start tracking your workouts and XP.'
                  : 'Sign in to pick up your streak where you left off.'}
              </Text>
            </View>

            <View style={styles.providerStack}>
              {appleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.pill}
                  style={styles.appleButton}
                  onPress={handleApplePress}
                />
              )}

              <TouchableOpacity
                style={styles.providerButton}
                activeOpacity={0.85}
                onPress={handleGooglePress}
                disabled={submitting}
              >
                <View style={styles.providerIconWrap}>
                  <GoogleGlyph />
                </View>
                <Text style={styles.providerButtonText}>Continue with Google</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.form}>
              {isSignUp && (
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              )}

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleEmailSubmit}
                />
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.submitBtn, !canSubmitEmail && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleEmailSubmit}
                disabled={!canSubmitEmail}
                hapticStyle="confirm"
              >
                {submitting ? (
                  <ActivityIndicator color={colors.iconOnDark} />
                ) : (
                  <Text style={styles.submitBtnText}>{isSignUp ? 'Sign Up' : 'Sign In'}</Text>
                )}
              </TouchableOpacity>
            </View>

            {isSignUp && (
              <View style={styles.legalRow}>
                <Text style={styles.legalText}>By signing up, you agree to our </Text>
                <TouchableOpacity onPress={() => { setLegalDocument('terms'); setLegalVisible(true); }}>
                  <Text style={styles.legalLink}>Terms of Service</Text>
                </TouchableOpacity>
                <Text style={styles.legalText}> and </Text>
                <TouchableOpacity onPress={() => { setLegalDocument('privacy'); setLegalVisible(true); }}>
                  <Text style={styles.legalLink}>Privacy Policy</Text>
                </TouchableOpacity>
                <Text style={styles.legalText}>.</Text>
              </View>
            )}

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              </Text>
              <TouchableOpacity onPress={() => switchMode(isSignUp ? 'signIn' : 'signUp')} hitSlop={8}>
                <Text style={styles.switchLink}>{isSignUp ? 'Sign in' : 'Sign up'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <LegalDocumentsModal
        visible={legalVisible}
        onClose={() => setLegalVisible(false)}
        initialDocument={legalDocument}
      />
    </View>
  );
}

// Minimal base64 decoder — `atob` isn't reliably available on the
// Hermes/React Native runtime, so this avoids depending on it.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeBase64(input: string): string {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  let output = '';
  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = BASE64_CHARS.indexOf(clean[i]);
    const enc2 = BASE64_CHARS.indexOf(clean[i + 1]);
    const enc3 = BASE64_CHARS.indexOf(clean[i + 2]);
    const enc4 = BASE64_CHARS.indexOf(clean[i + 3]);
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    output += String.fromCharCode(chr1);
    if (enc3 !== -1 && clean[i + 2] !== undefined) output += String.fromCharCode(chr2);
    if (enc4 !== -1 && clean[i + 3] !== undefined) output += String.fromCharCode(chr3);
  }
  return output;
}

// Decodes the (unverified — verification happens server-side, in
// Supabase) payload of a JWT so we can read basic claims like
// name/email/sub without an extra network round trip.
function decodeJwtPayload(token: string): { sub?: string; email?: string; name?: string } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = decodeBase64(base64);
    const json = decodeURIComponent(
      decoded
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Google's standard four-color "G" mark, drawn in-line so we don't need
// to bundle an image asset just for the provider button icon.
function GoogleGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.581C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  safe: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    flexGrow: 1,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.iconDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...shadow.nav,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  providerStack: {
    gap: 12,
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    ...shadow.card,
  },
  providerIconWrap: {
    width: 18,
    height: 18,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: type.label,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  form: {
    gap: 14,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: type.label,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  input: {
    height: 50,
    borderRadius: radius.cardSmall,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.textPrimary,
  },
  errorText: {
    fontSize: type.body,
    color: '#E0483E',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: colors.iconDark,
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...shadow.nav,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: colors.iconOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 12,
  },
  legalText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  legalLink: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  switchText: {
    fontSize: type.body,
    color: colors.textSecondary,
  },
  switchLink: {
    fontSize: type.body,
    fontWeight: '800',
    color: colors.textPrimary,
    marginLeft: 6,
  },
});
