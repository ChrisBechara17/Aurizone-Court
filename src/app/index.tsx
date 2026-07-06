import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { APP_GRADIENT, COLORS } from '@/constants/colors';
import { useAppStore, useThemeName } from '@/store/useAppStore';

const MARK = require('../../assets/images/rizeon-mark.png');
// Real lockup typography, keyed from 1_blackback.png (white "Rize" — dark theme only).
const WORDMARK = require('../../assets/images/rizeon-wordmark.png');
const WORDMARK_AR = 1317 / 245; // source px, keep in sync with the asset
const WORD_H = 34;
const MARK_SIZE = 116;
const ROW_GAP = 12;
const WORDMARK_FONT = { fontSize: 40, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 } as const;

// Timeline (ms): mark lands → row opens into the lockup → tagline → route away.
const OPEN_AT = 700;
const ROUTE_AT = 2500;

export default function SplashScreen() {
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const onboarded = useAppStore((s) => s.onboarded);
  const user = useAppStore((s) => s.user);

  // Dark theme uses the real lockup image (white "Rize" would vanish on light
  // backgrounds, so light theme falls back to the themed text wordmark).
  const isDark = useThemeName() === 'dark';

  // Width of the rendered wordmark — needed so the mark can start dead-center
  // and spring left by exactly half the text width when the lockup opens.
  const [textW, setTextW] = useState<number | null>(null);
  const wordW = isDark ? WORD_H * WORDMARK_AR : textW;

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      if (!onboarded) router.replace('/onboarding');
      else if (!user) router.replace('/auth');
      else router.replace('/(tabs)/home');
    }, ROUTE_AT);
    return () => clearTimeout(t);
  }, [hydrated, onboarded, user, router]);

  return (
    <View style={{ flex: 1 }}>
      {/* Invisible measuring copy of the wordmark. */}
      <Text
        style={[WORDMARK_FONT, { position: 'absolute', opacity: 0 }]}
        onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
      >
        RizeON
      </Text>

      <LinearGradient colors={APP_GRADIENT} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {wordW !== null ? <LogoLockup key={isDark ? 'dark' : 'light'} wordW={wordW} image={isDark} /> : null}
      </LinearGradient>
    </View>
  );
}

/** The 05 mark lands centered, then the row springs open into the full lockup. */
function LogoLockup({ wordW, image }: { wordW: number; image: boolean }) {
  // Shifting the row right by half of (wordmark + gap) puts the mark dead-center.
  const closedShift = (wordW + ROW_GAP) / 2;

  const markIn = useSharedValue(0);
  const rowShift = useSharedValue(closedShift);
  const textIn = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    markIn.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
    ring.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
    rowShift.value = withDelay(OPEN_AT, withSpring(0, { damping: 16, stiffness: 110 }));
    textIn.value = withDelay(OPEN_AT + 120, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [markIn, rowShift, textIn, ring]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rowShift.value }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: markIn.value,
    transform: [{ scale: 0.85 + markIn.value * 0.15 }],
  }));

  // The wordmark slides out from "behind" the mark — matching its speed lines.
  const textStyle = useAnimatedStyle(() => ({
    opacity: textIn.value,
    transform: [{ translateX: (1 - textIn.value) * -36 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.5,
    transform: [{ scale: 1 + ring.value * 1.3 }],
  }));

  return (
    <View style={{ alignItems: 'center', gap: 26 }}>
      <Animated.View style={[rowStyle, { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP }]}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[
              ringStyle,
              {
                position: 'absolute',
                width: MARK_SIZE + 18,
                height: MARK_SIZE + 18,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: COLORS.tennis,
              },
            ]}
          />
          <Animated.View style={markStyle}>
            <Image source={MARK} style={{ width: MARK_SIZE, height: MARK_SIZE }} resizeMode="contain" />
          </Animated.View>
        </View>

        {image ? (
          <Animated.Image
            source={WORDMARK}
            style={[textStyle, { width: wordW, height: WORD_H }]}
            resizeMode="contain"
          />
        ) : (
          <Animated.Text style={[textStyle, WORDMARK_FONT, { color: COLORS.text }]}>
            Rize<Text style={{ color: COLORS.basketball }}>ON</Text>
          </Animated.Text>
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(OPEN_AT + 600).duration(500)} style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ color: COLORS.neon, fontSize: 14, fontWeight: '600', letterSpacing: 3 }}>
          BOOK. PLAY. REPEAT.
        </Text>
        <Text style={{ color: COLORS.textFaint, fontSize: 12 }}>Loading your court…</Text>
      </Animated.View>
    </View>
  );
}
