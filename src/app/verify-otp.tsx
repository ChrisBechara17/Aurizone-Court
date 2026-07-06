import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { OtpCodeInput } from '@/components/OtpCodeInput';
import { COLORS } from '@/constants/colors';
import { authService } from '@/services/authService';
import { useAppStore } from '@/store/useAppStore';

type Flow = 'signup' | 'recovery';
const RESEND_COOLDOWN = 30; // seconds

/**
 * Shared 6-digit code screen for both email-OTP flows:
 *  - flow=signup   → confirm the account, create the profile, go home.
 *  - flow=recovery → verify the reset code, then continue to set a new password.
 */
export default function VerifyOtp() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; name?: string; flow?: Flow }>();
  const flow: Flow = params.flow === 'recovery' ? 'recovery' : 'signup';
  const email = params.email ?? '';
  const name = params.name ?? '';

  const confirmSignup = useAppStore((s) => s.confirmSignup);
  const resetPassword = useAppStore((s) => s.resetPassword);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (submitted: string) => {
    if (submitted.length < 6) return setError('Enter the 6-digit code from your email.');
    setError(null);
    setNotice(null);
    setVerifying(true);

    if (flow === 'signup') {
      const res = await confirmSignup(name, email, submitted);
      setVerifying(false);
      if (!res.ok) return setError(res.error ?? 'That code is invalid or expired.');
      router.replace('/(tabs)/home');
    } else {
      const res = await authService.verifyRecoveryCode(email, submitted);
      setVerifying(false);
      if (!res.ok) return setError(res.error ?? 'That code is invalid or expired.');
      // Recovery session is now active — continue to choose a new password.
      router.replace('/reset-password');
    }
  };

  const onResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    setNotice(null);
    const res = flow === 'signup' ? await authService.resendSignupCode(email) : await resetPassword(email);
    if (!res.ok) return setError(res.error ?? 'Could not resend the code.');
    setCode('');
    setCooldown(RESEND_COOLDOWN);
    setNotice(`A new code was sent to ${email}.`);
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
              <MailCheck size={34} color={COLORS.neon} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '900', textAlign: 'center' }}>
              {flow === 'signup' ? 'Verify your email' : 'Enter your reset code'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center' }}>
              We sent a 6-digit code to{'\n'}
              <Text style={{ color: COLORS.text, fontWeight: '700' }}>{email || 'your email'}</Text>
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(500)}>
            <GlassCard>
              <View style={{ gap: 20 }}>
                <OtpCodeInput value={code} onChange={setCode} onComplete={(c) => void verify(c)} />

                <ErrorBanner message={error} />
                {notice ? (
                  <Text style={{ color: COLORS.success, fontSize: 13, textAlign: 'center' }}>{notice}</Text>
                ) : null}

                <PrimaryGradientButton
                  label={flow === 'signup' ? 'Verify & Continue' : 'Verify Code'}
                  onPress={() => void verify(code)}
                  loading={verifying}
                />

                <Pressable onPress={onResend} disabled={cooldown > 0} hitSlop={8} style={{ alignSelf: 'center' }}>
                  <Text
                    style={{
                      color: cooldown > 0 ? COLORS.textFaint : COLORS.neon,
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
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
