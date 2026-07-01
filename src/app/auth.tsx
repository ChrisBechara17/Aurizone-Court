import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck, Zap } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { isAdminContact } from '@/constants/admin';

const schema = z.object({
  name: z.string().min(2, 'Please enter your name'),
  phoneOrEmail: z.string().min(5, 'Enter a phone number or email'),
});
type FormValues = z.infer<typeof schema>;

export default function Auth() {
  const router = useRouter();
  const login = useAppStore((s) => s.login);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phoneOrEmail: '' },
  });

  const goAfterLogin = (name: string, phoneOrEmail: string) => {
    const admin = isAdminContact(phoneOrEmail) || isAdminContact(name);
    router.replace('/(tabs)/home');
    if (admin) router.push('/admin'); // admins land straight in the console
  };

  const onSubmit = async (values: FormValues) => {
    await login(values.name, values.phoneOrEmail);
    goAfterLogin(values.name, values.phoneOrEmail);
  };

  const enterAsAdmin = async () => {
    await login('Admin', 'admin@courthub.com');
    goAfterLogin('Admin', 'admin@courthub.com');
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 28 }}>
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
              <Zap size={36} color={COLORS.neon} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>Welcome to CourtHub</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center' }}>
              Sign in to book the Main Court. Demo only — no password needed.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(500)}>
            <GlassCard>
              <View style={{ gap: 18 }}>
                <Field
                  label="Full Name"
                  placeholder="e.g. Alex Rivera"
                  control={control}
                  name="name"
                  error={errors.name?.message}
                />
                <Field
                  label="Phone or Email"
                  placeholder="e.g. alex@email.com"
                  control={control}
                  name="phoneOrEmail"
                  error={errors.phoneOrEmail?.message}
                  keyboardType="email-address"
                />
                <PrimaryGradientButton
                  label="Enter CourtHub"
                  onPress={handleSubmit(onSubmit)}
                  loading={isSubmitting}
                />
              </View>
            </GlassCard>
          </Animated.View>

          {/* Demo admin shortcut */}
          <Animated.View entering={FadeInDown.delay(250).duration(500)} style={{ alignItems: 'center', gap: 8 }}>
            <Text style={{ color: COLORS.textFaint, fontSize: 12 }}>Demo access</Text>
            <Pressable
              onPress={enterAsAdmin}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 12,
                paddingHorizontal: 18,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: `${COLORS.warning}66`,
                backgroundColor: `${COLORS.warning}14`,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <ShieldCheck size={16} color={COLORS.warning} />
              <Text style={{ color: COLORS.warning, fontWeight: '800', fontSize: 14 }}>Enter as Demo Admin</Text>
            </Pressable>
            <Text style={{ color: COLORS.textFaint, fontSize: 11, textAlign: 'center' }}>
              or sign in with email “admin@courthub.com”
            </Text>
          </Animated.View>
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
  error,
  keyboardType,
}: {
  label: string;
  placeholder: string;
  control: any;
  name: keyof FormValues;
  error?: string;
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
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
            autoCapitalize={name === 'name' ? 'words' : 'none'}
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderWidth: 1,
              borderColor: error ? `${COLORS.danger}88` : COLORS.cardBorder,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              color: COLORS.text,
              fontSize: 15,
            }}
          />
        )}
      />
      {error ? <Text style={{ color: COLORS.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}
