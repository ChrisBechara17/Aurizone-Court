import { useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarCheck, Repeat } from 'lucide-react-native';
import { BasketballIcon, TennisIcon } from '@/components/icons/SportIcon';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: (c: string) => <CalendarCheck size={64} color={c} />,
    accent: COLORS.neon,
    title: 'Reserve the shared court instantly',
    body: 'One Main Court, one tap. Lock your slot in seconds with a clean, fast booking flow.',
  },
  {
    icon: (_c: string) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <BasketballIcon size={58} color={COLORS.basketball} />
        <TennisIcon size={58} color={COLORS.tennis} />
      </View>
    ),
    accent: COLORS.basketball,
    title: 'Choose basketball or tennis',
    body: 'Switch between Basketball Mode and Tennis Mode. Same court — the sport just sets the price.',
  },
  {
    icon: (c: string) => <Repeat size={64} color={c} />,
    accent: COLORS.coach,
    title: 'Find coaches & repeat weekly',
    body: 'Browse our private coaches and contact them directly, and set recurring weekly court bookings.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const complete = useAppStore((s) => s.completeOnboarding);
  const ref = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    await complete();
    router.replace('/auth');
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      ref.current?.scrollTo({ x: width * (index + 1), animated: true });
      setIndex(index + 1);
    } else {
      void finish();
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <ScreenContainer>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 }}>
          <Pressable onPress={finish} hitSlop={12}>
            <Text style={{ color: COLORS.textMuted, fontSize: 15, fontWeight: '600' }}>Skip</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
        >
          {SLIDES.map((s, i) => (
            <View key={i} style={{ width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 28 }}>
              <Animated.View
                entering={FadeIn.duration(400)}
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: `${s.accent}1a`,
                  borderWidth: 1.5,
                  borderColor: `${s.accent}55`,
                  shadowColor: s.accent,
                  shadowOpacity: 0.5,
                  shadowRadius: 30,
                }}
              >
                {s.icon(s.accent)}
              </Animated.View>
              <View style={{ gap: 14, alignItems: 'center' }}>
                <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900', textAlign: 'center' }}>{s.title}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>{s.body}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 24, paddingBottom: 32, gap: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  height: 8,
                  width: i === index ? 24 : 8,
                  borderRadius: 999,
                  backgroundColor: i === index ? COLORS.neon : COLORS.cardBorder,
                }}
              />
            ))}
          </View>
          <PrimaryGradientButton
            label={index === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            onPress={next}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}
