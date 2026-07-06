import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

interface FormValues {
  name: string;
  email: string;
  password: string;
}

export default function Auth() {
  const router = useRouter();
  const signUp = useAppStore((s) => s.signUp);
  const login = useAppStore((s) => s.login);
  const resetPassword = useAppStore((s) => s.resetPassword);

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  const {
    control,
    handleSubmit,
    getValues,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: { name: '', email: '', password: '' } });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setNotice(null);

    if (!values.email.includes('@')) return setError('Enter a valid email address.');
    if (values.password.length < 6) return setError('Password must be at least 6 characters.');
    if (mode === 'signup' && values.name.trim().length < 2) return setError('Please enter your name.');

    if (mode === 'signup') {
      const res = await signUp(values.name, values.email, values.password);
      if (!res.ok) return setError(res.error ?? 'Sign up failed.');
      if (res.needsVerification) {
        // Email confirmation is on — go verify the emailed 6-digit code.
        router.push(
          `/verify-otp?flow=signup&email=${encodeURIComponent(values.email.trim())}&name=${encodeURIComponent(
            values.name.trim(),
          )}`,
        );
      } else {
        router.replace('/(tabs)/home');
      }
    } else {
      const res = await login(values.email, values.password);
      if (!res.ok) return setError(res.error ?? 'Login failed.');
      router.replace('/(tabs)/home');
    }
  };

  const onForgotPassword = async () => {
    if (sendingReset) return;
    setError(null);
    setNotice(null);
    const email = getValues('email');
    if (!email.includes('@')) return setError('Enter your email above first, then tap “Forgot password”.');
    setSendingReset(true);
    const res = await resetPassword(email).finally(() => setSendingReset(false));
    if (!res.ok) return setError(res.error ?? 'Could not send reset email.');
    router.push(`/verify-otp?flow=recovery&email=${encodeURIComponent(email.trim())}`);
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
            <Image
              source={require('../../assets/images/rizeon-mark.png')}
              style={{ width: 88, height: 88 }}
              resizeMode="contain"
            />
            <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>
              {mode === 'signup' ? 'Create your account' : 'Welcome to RizeON'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center' }}>
              {mode === 'signup' ? 'Sign up to book the Main Court.' : 'Sign in to book the Main Court.'}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(500)}>
            <GlassCard>
              <View style={{ gap: 18 }}>
                {mode === 'signup' ? (
                  <Field label="Full Name" placeholder="e.g. Alex Rivera" control={control} name="name" autoCapitalize="words" />
                ) : null}
                <Field label="Email" placeholder="you@email.com" control={control} name="email" keyboardType="email-address" />
                <Field label="Password" placeholder="At least 6 characters" control={control} name="password" isPassword />

                {mode === 'login' ? (
                  <Pressable
                    onPress={onForgotPassword}
                    disabled={sendingReset}
                    hitSlop={8}
                    style={{ alignSelf: 'flex-end', opacity: sendingReset ? 0.6 : 1 }}
                  >
                    <Text style={{ color: COLORS.neon, fontSize: 13, fontWeight: '700' }}>
                      {sendingReset ? 'Sending reset code...' : 'Forgot password?'}
                    </Text>
                  </Pressable>
                ) : null}

                <ErrorBanner message={error} />
                {notice ? (
                  <Text style={{ color: COLORS.success, fontSize: 13, textAlign: 'center' }}>{notice}</Text>
                ) : null}

                <PrimaryGradientButton
                  label={mode === 'signup' ? 'Create Account' : 'Sign In'}
                  onPress={handleSubmit(onSubmit)}
                  loading={isSubmitting}
                />
              </View>
            </GlassCard>
          </Animated.View>

          <Pressable
            onPress={() => {
              setMode(mode === 'signup' ? 'login' : 'signup');
              setError(null);
              setNotice(null);
            }}
          >
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center' }}>
              {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={{ color: COLORS.neon, fontWeight: '800' }}>
                {mode === 'signup' ? 'Sign in' : 'Sign up'}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Field({
  label,
  placeholder,
  control,
  name,
  keyboardType,
  isPassword,
  autoCapitalize = 'none',
}: {
  label: string;
  placeholder: string;
  control: any;
  name: keyof FormValues;
  keyboardType?: 'default' | 'email-address';
  isPassword?: boolean;
  autoCapitalize?: 'none' | 'words';
}) {
  const [visible, setVisible] = useState(false);
  const secure = !!isPassword && !visible;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: COLORS.chip,
          borderWidth: 1,
          borderColor: COLORS.cardBorder,
          borderRadius: 14,
          paddingHorizontal: 16,
        }}
      >
        <Controller
          control={control}
          name={name}
          render={({ field: { value, onChange, onBlur } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={placeholder}
              placeholderTextColor={COLORS.textFaint}
              keyboardType={keyboardType}
              secureTextEntry={secure}
              autoCapitalize={autoCapitalize}
              autoCorrect={false}
              style={{ flex: 1, paddingVertical: 14, color: COLORS.text, fontSize: 15 }}
            />
          )}
        />
        {isPassword ? (
          <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} style={{ paddingLeft: 10 }}>
            {visible ? (
              <EyeOff size={20} color={COLORS.textMuted} />
            ) : (
              <Eye size={20} color={COLORS.textMuted} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
