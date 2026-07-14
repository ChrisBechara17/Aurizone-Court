import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { OtpCodeInput } from '@/components/OtpCodeInput';
import { COLORS } from '@/constants/colors';
import { authService } from '@/services/authService';
import { useAppStore } from '@/store/useAppStore';

/**
 * Final step of the forgot-password flow. The recovery code was already
 * verified on the verify-otp screen, so a recovery session is active here. If
 * that account has MFA enabled, the recovery session must be promoted to AAL2
 * with its verified TOTP factor before Supabase permits a password change.
 */
export default function ResetPassword() {
  const router = useRouter();
  const inputRow = inputRowFor();

  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingMfa, setCheckingMfa] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [mfaReady, setMfaReady] = useState(false);

  useEffect(() => {
    let active = true;

    authService
      .getMfaStatus()
      .then((status) => {
        if (!active) return;

        if (status.currentLevel === 'aal2' || status.nextLevel !== 'aal2') {
          setMfaReady(true);
          return;
        }

        setMfaRequired(true);
        const factor = status.verifiedFactors[0];
        if (!factor) {
          setError('Your authenticator could not be loaded. Return to sign in and request a new reset code.');
          return;
        }
        setMfaFactorId(factor.id);
      })
      .catch(() => {
        if (active) {
          setMfaRequired(true);
          setError('Could not verify your account security. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (active) setCheckingMfa(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const verifyMfa = async () => {
    if (!mfaFactorId || mfaCode.length !== 6 || mfaVerifying) return;
    setError(null);
    setMfaVerifying(true);
    const result = await authService.verifyTotp(mfaFactorId, mfaCode).finally(() => setMfaVerifying(false));
    if (!result.ok) return setError(result.error ?? 'That authenticator code is invalid or expired.');
    setMfaCode('');
    setMfaReady(true);
  };

  const onSubmit = async () => {
    setError(null);
    if (!mfaReady) return setError('Complete account verification before changing your password.');
    if (pw.length < 6) return setError('Password must be at least 6 characters.');
    if (pw !== confirm) return setError('Passwords do not match.');

    setSaving(true);
    const updated = await authService.updatePassword(pw);
    if (!updated.ok) {
      setSaving(false);
      return setError(updated.error ?? 'Could not update password. Your reset code may have expired.');
    }
    // Signed in via the recovery session — sync the app and go home.
    const user = await authService.getCurrentUser();
    useAppStore.setState({ user });
    await useAppStore.getState().registerPushToken();
    await useAppStore.getState().refresh();
    setSaving(false);
    router.replace('/(tabs)/home');
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 60, gap: 22 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', gap: 14 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${COLORS.neon}1f`,
                borderWidth: 1.5,
                borderColor: `${COLORS.neon}66`,
              }}
            >
              <Lock size={34} color={COLORS.neon} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '900' }}>Choose a new password</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center' }}>
              Your code was verified. Set a new password to finish.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(500)}>
            <GlassCard accent={mfaRequired && !mfaReady ? COLORS.warning : undefined}>
              {checkingMfa ? (
                <View style={{ paddingVertical: 12 }}>
                  <Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>Checking account security...</Text>
                </View>
              ) : mfaRequired && !mfaReady ? (
                <View style={{ gap: 18 }}>
                  <View style={{ alignItems: 'center', gap: 10 }}>
                    <ShieldCheck size={34} color={COLORS.warning} />
                    <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '900' }}>Confirm your identity</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center' }}>
                      Enter the current 6-digit code from your authenticator app before changing your password.
                    </Text>
                  </View>

                  <OtpCodeInput value={mfaCode} onChange={setMfaCode} onComplete={() => undefined} />
                  <ErrorBanner message={error} />
                  <PrimaryGradientButton
                    label="Verify Authenticator"
                    onPress={verifyMfa}
                    loading={mfaVerifying}
                    disabled={mfaCode.length !== 6 || !mfaFactorId}
                  />
                </View>
              ) : (
              <View style={{ gap: 18 }}>
                <Labeled label="New password">
                  <View style={inputRow}>
                    <TextInput
                      value={pw}
                      onChangeText={setPw}
                      placeholder="At least 6 characters"
                      placeholderTextColor={COLORS.textFaint}
                      secureTextEntry={!visible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={{ flex: 1, paddingVertical: 14, color: COLORS.text, fontSize: 15 }}
                    />
                    <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} style={{ paddingLeft: 10 }}>
                      {visible ? <EyeOff size={20} color={COLORS.textMuted} /> : <Eye size={20} color={COLORS.textMuted} />}
                    </Pressable>
                  </View>
                </Labeled>

                <Labeled label="Confirm password">
                  <TextInput
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="Re-enter your password"
                    placeholderTextColor={COLORS.textFaint}
                    secureTextEntry={!visible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={inputStyleFor()}
                  />
                </Labeled>

                <ErrorBanner message={error} />

                <PrimaryGradientButton label="Update Password" onPress={onSubmit} loading={saving} />
              </View>
              )}
            </GlassCard>
          </Animated.View>

          <Pressable onPress={() => router.replace('/auth')}>
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center' }}>
              Back to <Text style={{ color: COLORS.neon, fontWeight: '800' }}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// Built at render time so the input colors follow the active light/dark theme.
const inputStyleFor = () =>
  ({
    backgroundColor: COLORS.chip,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 15,
  }) as const;

const inputRowFor = () =>
  ({
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.chip,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
  }) as const;

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      {children}
    </View>
  );
}
