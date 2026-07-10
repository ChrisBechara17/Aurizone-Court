import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { COLORS } from '@/constants/colors';
import { useAppStore, useThemeName } from '@/store/useAppStore';

export default function RulesScreen() {
  useThemeName();
  const router = useRouter();
  const rules = useAppStore((s) => s.courtRules);
  const sorted = [...rules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
              }}
            >
              <ArrowLeft size={20} color={COLORS.text} />
            </View>
          </Pressable>
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>Court Rules</Text>
        </View>

        <GlassCard accent={COLORS.tennis}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ShieldCheck size={26} color={COLORS.tennis} />
            <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 }}>
              Please follow these rules to keep the Main Court fair and fun for everyone.
            </Text>
          </View>
        </GlassCard>

        <View style={{ gap: 12 }}>
          {sorted.map((rule, i) => (
            <Animated.View key={rule.id} entering={FadeInDown.delay(i * 40).duration(300)}>
              <GlassCard>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: `${COLORS.neon}1f`,
                    }}
                  >
                    <Text style={{ color: COLORS.neon, fontWeight: '800', fontSize: 14 }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>{rule.title}</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 19 }}>{rule.content}</Text>
                  </View>
                </View>
              </GlassCard>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
