import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  BookOpen,
  ChevronRight,
  Eye,
  EyeOff,
  Gift,
  LogOut,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { LoyaltyCard } from '@/components/LoyaltyCard';
import { Toggle } from '@/components/Toggle';
import { COLORS } from '@/constants/colors';
import { useAppStore, useThemeName } from '@/store/useAppStore';
import { computeLoyalty } from '@/utils/loyalty';
import { computeStanding } from '@/utils/accountStanding';
import { REMINDER_LEAD_MINUTES } from '@/services/notificationService';

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const allBookings = useAppStore((s) => s.bookings);
  const logout = useAppStore((s) => s.logout);
  const remindersEnabled = useAppStore((s) => s.remindersEnabled);
  const setRemindersEnabled = useAppStore((s) => s.setRemindersEnabled);
  const theme = useThemeName();
  const setTheme = useAppStore((s) => s.setTheme);
  const isLight = theme === 'light';
  const [showEmail, setShowEmail] = useState(false);
  const bookings = allBookings.filter((b) => b.userId === user?.id);
  const loyalty = computeLoyalty(bookings);
  const standing = computeStanding(bookings);

  const initials = (user?.name ?? 'P')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const onLogout = async () => {
    await logout();
    router.replace('/auth');
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 18 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>Profile</Text>

        <Animated.View entering={FadeInDown.duration(400)}>
          <GlassCard accent={COLORS.neon}>
            <View style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <LinearGradient
                  colors={[COLORS.neon, COLORS.coach]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 24 }}>{initials}</Text>
                </LinearGradient>
                <View style={{ flex: 1, gap: 7 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 20 }}>{user?.name ?? 'Player'}</Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      alignSelf: 'flex-start',
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: `${loyalty.tier.color}1f`,
                      borderWidth: 1,
                      borderColor: `${loyalty.tier.color}55`,
                    }}
                  >
                    <Sparkles size={12} color={loyalty.tier.color} />
                    <Text style={{ color: loyalty.tier.color, fontSize: 12, fontWeight: '800' }}>
                      {loyalty.tier.name} Member
                    </Text>
                  </View>
                </View>
              </View>

              {/* Email is hidden by default — tap to reveal. */}
              <Pressable
                onPress={() => setShowEmail((v) => !v)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: COLORS.chip,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Mail size={15} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }} numberOfLines={1}>
                    {showEmail ? user?.phoneOrEmail ?? '—' : maskEmail(user?.phoneOrEmail)}
                  </Text>
                </View>
                {showEmail ? (
                  <EyeOff size={16} color={COLORS.textFaint} />
                ) : (
                  <Eye size={16} color={COLORS.textFaint} />
                )}
              </Pressable>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Account standing (no-show strikes) */}
        <Animated.View entering={FadeInDown.delay(60).duration(400)} style={{ gap: 10 }}>
          <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '800' }}>Account Standing</Text>
          <GlassCard accent={standing.disabled ? COLORS.danger : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: standing.disabled ? COLORS.danger : COLORS.text, fontWeight: '800', fontSize: 15 }}>
                  {standing.disabled ? 'Account disabled' : standing.strikes === 0 ? 'Good standing' : 'Warnings active'}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  {standing.disabled
                    ? 'Reached 3 no-shows. Contact the front desk to restore access.'
                    : `${standing.strikes} of ${standing.maxStrikes} no-show strikes. 3 disables your account.`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {Array.from({ length: standing.maxStrikes }, (_, i) => {
                  const filled = i < standing.strikes;
                  return (
                    <View
                      key={i}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: filled ? '#000' : 'transparent',
                        borderWidth: 1.5,
                        borderColor: filled ? COLORS.text : COLORS.cardBorder,
                      }}
                    />
                  );
                })}
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Loyalty / rewards section */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ gap: 10 }}>
          <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '800' }}>RizeON Rewards</Text>
          <LoyaltyCard loyalty={loyalty} onPress={() => router.push('/loyalty')} />
        </Animated.View>

        {user?.isAdmin ? (
          <Animated.View entering={FadeInDown.delay(110).duration(400)}>
            <Pressable onPress={() => router.push('/admin')} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  borderRadius: 20,
                  backgroundColor: `${COLORS.warning}1f`,
                  borderWidth: 1,
                  borderColor: `${COLORS.warning}66`,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: `${COLORS.warning}33`,
                  }}
                >
                  <ShieldCheck size={22} color={COLORS.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>Admin Dashboard</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Manage bookings & block court time</Text>
                </View>
                <ChevronRight size={20} color={COLORS.warning} />
              </View>
            </Pressable>
          </Animated.View>
        ) : null}

        <View style={{ gap: 12 }}>
          <Row
            icon={<Gift size={20} color={loyalty.tier.color} />}
            label="Rewards & Loyalty"
            sub={`${loyalty.tier.name} · ${loyalty.points} pts`}
            onPress={() => router.push('/loyalty')}
          />
          <Row
            icon={<Trophy size={20} color={COLORS.neon} />}
            label="My Bookings"
            onPress={() => router.push('/(tabs)/bookings')}
          />
          <Row
            icon={<BookOpen size={20} color={COLORS.tennis} />}
            label="Court Rules"
            onPress={() => router.push('/rules')}
          />
          <Row
            icon={<Sparkles size={20} color={COLORS.coach} />}
            label="Memberships & Packages"
            sub="Coming soon"
            onPress={() => router.push('/memberships')}
          />
        </View>

        {/* Settings */}
        <Animated.View entering={FadeInDown.delay(160).duration(400)} style={{ gap: 10 }}>
          <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '800' }}>Settings</Text>
          <GlassCard>
            <View style={{ gap: 18 }}>
              {/* Appearance — light / dark theme */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isLight ? `${COLORS.warning}26` : `${COLORS.neon}1f`,
                    }}
                  >
                    {isLight ? <Sun size={20} color={COLORS.warning} /> : <Moon size={20} color={COLORS.neon} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>Appearance</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                      {isLight ? 'Light mode' : 'Dark mode'}
                    </Text>
                  </View>
                </View>
                <Toggle
                  value={isLight}
                  onValueChange={(v) => void setTheme(v ? 'light' : 'dark')}
                  activeColor={COLORS.warning}
                />
              </View>

              <View style={{ height: 1, backgroundColor: COLORS.cardBorder }} />

              {/* Booking reminders */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: COLORS.chip,
                    }}
                  >
                    <Bell size={20} color={COLORS.neon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>Booking Reminders</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                      Notify me {REMINDER_LEAD_MINUTES} min before each session
                    </Text>
                  </View>
                </View>
                <Toggle
                  value={remindersEnabled}
                  onValueChange={(v) => void setRemindersEnabled(v)}
                  activeColor={COLORS.neon}
                />
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        <Pressable onPress={onLogout} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              paddingVertical: 16,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: `${COLORS.danger}66`,
              backgroundColor: `${COLORS.danger}14`,
              overflow: 'hidden',
            }}
          >
            <LogOut size={18} color={COLORS.danger} />
            <Text style={{ color: COLORS.danger, fontWeight: '800', fontSize: 15 }}>Log Out (Demo)</Text>
          </View>
        </Pressable>

        <Text style={{ color: COLORS.textFaint, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
          RizeON · Demo build · v1.0
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

/** Obscure the email until the user taps to reveal it (e.g. "ch•••••@gmail.com"). */
function maskEmail(email?: string): string {
  if (!email) return '—';
  const [userPart, domain] = email.split('@');
  if (!domain) return '•'.repeat(Math.max(4, email.length));
  const head = userPart.slice(0, Math.min(2, userPart.length));
  return `${head}${'•'.repeat(Math.max(3, userPart.length - head.length))}@${domain}`;
}

function Row({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      <GlassCard padded={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.chip,
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>{label}</Text>
            {sub ? <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{sub}</Text> : null}
          </View>
          <ChevronRight size={20} color={COLORS.textMuted} />
        </View>
      </GlassCard>
    </Pressable>
  );
}
