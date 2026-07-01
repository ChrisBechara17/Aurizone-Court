import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap } from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { APP_GRADIENT, COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

export default function SplashScreen() {
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const onboarded = useAppStore((s) => s.onboarded);
  const user = useAppStore((s) => s.user);

  const glow = useSharedValue(0.6);
  const ring = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
    ring.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
  }, [glow, ring]);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      if (!onboarded) router.replace('/onboarding');
      else if (!user) router.replace('/auth');
      else router.replace('/(tabs)/home');
    }, 1600);
    return () => clearTimeout(t);
  }, [hydrated, onboarded, user, router]);

  const logoStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow.value,
    transform: [{ scale: 0.96 + glow.value * 0.06 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - ring.value,
    transform: [{ scale: 1 + ring.value * 1.4 }],
  }));

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={APP_GRADIENT} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[
              ringStyle,
              {
                position: 'absolute',
                width: 120,
                height: 120,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: COLORS.neon,
              },
            ]}
          />
          <Animated.View
            style={[
              logoStyle,
              {
                width: 96,
                height: 96,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${COLORS.neon}1f`,
                borderWidth: 1.5,
                borderColor: `${COLORS.neon}88`,
                shadowColor: COLORS.neon,
                shadowRadius: 30,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            <Zap size={48} color={COLORS.neon} />
          </Animated.View>
        </View>

        <Animated.View entering={FadeIn.delay(200).duration(600)} style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ color: COLORS.text, fontSize: 34, fontWeight: '900', letterSpacing: 1 }}>CourtHub</Text>
          <Text style={{ color: COLORS.neon, fontSize: 15, fontWeight: '600', letterSpacing: 3 }}>
            BOOK. PLAY. REPEAT.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600).duration(600)}>
          <Text style={{ color: COLORS.textFaint, fontSize: 12 }}>Loading your court…</Text>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}
