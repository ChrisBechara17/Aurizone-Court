import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Crown, Lock } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { COLORS } from '@/constants/colors';
import { MEMBERSHIPS } from '@/data/seedData';
import { SportType } from '@/models';

const accentFor = (sport: SportType | 'all') =>
  sport === 'basketball' ? COLORS.basketball : sport === 'tennis' ? COLORS.tennis : COLORS.coach;

export default function MembershipsScreen() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))} hitSlop={12}>
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
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>Memberships</Text>
        </View>

        <LinearGradient
          colors={[`${COLORS.coach}33`, COLORS.glassEdge]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 22, padding: 18, borderWidth: 1, borderColor: `${COLORS.coach}55`, gap: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Crown size={24} color={COLORS.coach} />
            <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 18 }}>Packages are on the way</Text>
          </View>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 19 }}>
            Save with session bundles and monthly memberships. These are previews — booking opens soon.
          </Text>
        </LinearGradient>

        <View style={{ gap: 12 }}>
          {MEMBERSHIPS.map((pkg, i) => {
            const accent = accentFor(pkg.sportType);
            return (
              <Animated.View key={pkg.id} entering={FadeInDown.delay(i * 60).duration(350)}>
                <View
                  style={{
                    borderRadius: 22,
                    padding: 18,
                    backgroundColor: COLORS.card,
                    borderWidth: 1,
                    borderColor: `${accent}44`,
                    gap: 10,
                    opacity: 0.96,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 17, flex: 1, paddingRight: 10 }}>
                      {pkg.name}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: `${COLORS.warning}1f`,
                        borderWidth: 1,
                        borderColor: `${COLORS.warning}55`,
                      }}
                    >
                      <Lock size={12} color={COLORS.warning} />
                      <Text style={{ color: COLORS.warning, fontWeight: '700', fontSize: 11 }}>Coming Soon</Text>
                    </View>
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 19 }}>{pkg.description}</Text>
                </View>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
