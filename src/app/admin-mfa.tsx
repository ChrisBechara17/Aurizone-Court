import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { COLORS } from '@/constants/colors';
import { authService } from '@/services/authService';
import { useAppStore } from '@/store/useAppStore';

type Enrollment = { id: string; totp: { secret: string; uri: string } };

export default function AdminMfaScreen() {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.isAdmin) return;
    authService.getMfaStatus().then(async (status) => {
      if (status.currentLevel === 'aal2') return router.replace('/admin');
      const existing = status.verifiedFactors[0];
      if (existing) setFactorId(existing.id);
      else {
        const enrolled = await authService.enrollAdminTotp();
        setEnrollment(enrolled as Enrollment);
        setFactorId(enrolled.id);
      }
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [router, user?.isAdmin]);

  if (!user?.isAdmin) return <Redirect href="/(tabs)/profile" />;

  const verify = async () => {
    if (!factorId || code.length !== 6) return;
    setError(null);
    setLoading(true);
    const result = await authService.verifyTotp(factorId, code).finally(() => setLoading(false));
    if (!result.ok) return setError(result.error ?? 'Verification failed. Request a fresh code and try again.');
    router.replace('/admin');
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={46} color={COLORS.warning} />
          <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '900' }}>Admin verification</Text>
          <Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>Enter the current 6-digit code from your authenticator app.</Text>
        </View>
        <GlassCard accent={COLORS.warning}>
          <View style={{ gap: 14 }}>
            {enrollment ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: '800' }}>Add RizeON to your authenticator</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Use this setup key, then enter the generated code below.</Text>
                <Pressable style={{ padding: 12, backgroundColor: COLORS.chip, borderRadius: 8 }}>
                  <Text selectable style={{ color: COLORS.neon, fontFamily: 'monospace', fontSize: 15 }}>{enrollment.totp.secret}</Text>
                </Pressable>
              </View>
            ) : null}
            <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" placeholderTextColor={COLORS.textFaint} style={{ color: COLORS.text, backgroundColor: COLORS.chip, borderWidth: 1, borderColor: COLORS.cardBorder, borderRadius: 8, padding: 14, textAlign: 'center', fontSize: 24, letterSpacing: 8 }} />
            <ErrorBanner message={error} />
            <PrimaryGradientButton label="Verify Admin" onPress={verify} loading={loading} disabled={code.length !== 6 || !factorId} />
          </View>
        </GlassCard>
      </ScrollView>
    </ScreenContainer>
  );
}
