import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BookOpen,
  CalendarRange,
  ChevronRight,
  Info,
  MapPin,
  ShieldCheck,
  Sparkles,
  Megaphone,
} from 'lucide-react-native';
import { BasketballIcon, TennisIcon } from '@/components/icons/SportIcon';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { MainCourtCard } from '@/components/MainCourtCard';
import { BookingCard } from '@/components/BookingCard';
import { EmptyState } from '@/components/EmptyState';
import { LoyaltyCard } from '@/components/LoyaltyCard';
import { COLORS } from '@/constants/colors';
import { useAppStore, useThemeName } from '@/store/useAppStore';
import { computeLoyalty } from '@/utils/loyalty';
import { parseISO } from 'date-fns';

export default function HomeScreen() {
  useThemeName();
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const allBookings = useAppStore((s) => s.bookings);
  const pricing = useAppStore((s) => s.pricing);
  const bookings = allBookings.filter((b) => b.userId === (user?.id ?? 'demo-user'));
  const loyalty = computeLoyalty(bookings);

  const upcoming = bookings
    .filter((b) => b.status === 'confirmed' && parseISO(b.endTime).getTime() > Date.now())
    .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
  const nextBooking = upcoming[0];

  return (
    <ScreenContainer>
      {/* No horizontal padding here — sections add their own 20px so the Quick
          Actions cards can go edge-to-edge without a (clipped-on-Android) negative margin. */}
      <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 110, gap: 18 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)} style={{ paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>Welcome back,</Text>
              <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>
                {user?.name ?? 'Player'} 👋
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
              }}
            >
              <MapPin size={14} color={COLORS.neon} />
              <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>1 Location</Text>
            </View>
          </View>
        </Animated.View>

        {/* Admin banner (admins only) */}
        {user?.isAdmin ? (
          <Animated.View entering={FadeInDown.delay(40).duration(400)} style={{ paddingHorizontal: 20 }}>
            <Pressable onPress={() => router.push('/admin')} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}>
              <LinearGradient
                colors={[COLORS.warning, '#ff9d2f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 18,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <ShieldCheck size={22} color="#1b1405" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#1b1405', fontWeight: '900', fontSize: 15 }}>Admin Mode</Text>
                  <Text style={{ color: 'rgba(27,20,5,0.75)', fontSize: 12, fontWeight: '600' }}>
                    Tap to open the Admin Console
                  </Text>
                </View>
                <ChevronRight size={20} color="#1b1405" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Shared court badge */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ paddingHorizontal: 20 }}>
          <MainCourtCard />
        </Animated.View>

        {/* Loyalty / rewards */}
        <Animated.View entering={FadeInDown.delay(110).duration(400)} style={{ gap: 10, paddingHorizontal: 20 }}>
          <SectionTitle title="RizeON Rewards" />
          <LoyaltyCard loyalty={loyalty} onPress={() => router.push('/loyalty')} />
        </Animated.View>

        {/* Upcoming booking */}
        <Animated.View entering={FadeInDown.delay(140).duration(400)} style={{ gap: 10, paddingHorizontal: 20 }}>
          <SectionTitle title="Upcoming Booking" />
          {nextBooking ? (
            <BookingCard booking={nextBooking} />
          ) : (
            <GlassCard>
              <EmptyState
                icon={<Sparkles size={28} color={COLORS.neon} />}
                title="No upcoming bookings"
                subtitle="Reserve the Main Court to see your next session here."
              />
            </GlassCard>
          )}
        </Animated.View>

        {/* Quick actions */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={{ gap: 10 }}>
          <View style={{ paddingHorizontal: 20 }}>
            <SectionTitle title="Quick Actions" />
          </View>
          {/* Full-bleed cards: the ScrollView has no horizontal padding, so this
              container spans the whole screen. Each pair splits 50/50 at center. */}
          <View style={{ gap: 12, paddingHorizontal: 20 }}>
              <QuickAction
                label="Book Tennis"
                sub={`$${pricing.tennis}/hr`}
                accent={COLORS.tennis}
                icon={<TennisIcon size={24} color={COLORS.tennis} />}
                onPress={() => router.push('/book?sport=tennis')}
              />
              <QuickAction
                label="Book Basketball"
                sub={`$${pricing.basketball}/hr`}
                accent={COLORS.basketball}
                icon={<BasketballIcon size={24} color={COLORS.basketball} />}
                onPress={() => router.push('/book?sport=basketball')}
              />
            {/* Row 2 — Coaches | Court Schedule (50/50) */}
              <QuickAction
                label="Our Coaches"
                sub="View & contact"
                accent={COLORS.coach}
                icon={<Megaphone size={24} color={COLORS.coach} />}
                onPress={() => router.push('/coaches')}
              />
              <QuickAction
                label="Court Schedule"
                sub="See availability"
                accent={COLORS.neon}
                icon={<CalendarRange size={24} color={COLORS.neon} />}
                onPress={() => router.push('/availability')}
              />
            {/* Row 3 — View Rules (full width) */}
            <QuickAction
              label="View Rules"
              sub="Court policy"
              accent={COLORS.tennis}
              icon={<BookOpen size={24} color={COLORS.tennis} />}
              onPress={() => router.push('/rules')}
            />
          </View>
        </Animated.View>

        {/* Shared court info */}
        <Animated.View entering={FadeInDown.delay(260).duration(400)} style={{ paddingHorizontal: 20 }}>
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
              backgroundColor: `${COLORS.neon}14`,
              borderColor: `${COLORS.neon}44`,
              borderWidth: 1,
              borderRadius: 18,
              padding: 14,
            }}
          >
            <Info size={18} color={COLORS.neon} />
            <Text style={{ color: COLORS.text, flex: 1, fontSize: 13, lineHeight: 19 }}>
              Basketball and tennis share the same court. A booked slot becomes unavailable for both sports.
            </Text>
          </View>
        </Animated.View>

        {/* Memberships coming soon */}
        <Animated.View entering={FadeInDown.delay(320).duration(400)} style={{ paddingHorizontal: 20 }}>
          <Pressable onPress={() => router.push('/memberships')}>
            <LinearGradient
              colors={[`${COLORS.coach}26`, COLORS.glassEdge]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 22,
                padding: 18,
                borderWidth: 1,
                borderColor: `${COLORS.coach}55`,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <Sparkles size={24} color={COLORS.coach} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>Memberships & Packages</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Bundles and savings — coming soon</Text>
                </View>
              </View>
              <ChevronRight size={20} color={COLORS.textMuted} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>{title}</Text>;
}

function QuickAction({
  label,
  sub,
  accent,
  icon,
  onPress,
}: {
  label: string;
  sub: string;
  accent: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View
        style={{
          borderRadius: 20,
          padding: 16,
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: `${accent}44`,
          minHeight: 84,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${accent}1f`,
            }}
          >
            {icon}
          </View>
          <View style={{ minWidth: 0 }}>
            <Text numberOfLines={2} adjustsFontSizeToFit style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>
              {label}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: COLORS.textMuted, fontSize: 12 }}>
              {sub}
            </Text>
          </View>
        </View>
        <ChevronRight size={22} color={COLORS.textMuted} />
      </View>
    </Pressable>
  );
}
