import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Users } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { UserRosterList } from '@/components/admin/UserRosterList';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

export default function AdminUsersScreen() {
  const ADMIN = COLORS.warning; // read live so it follows the active theme
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const roster = useAppStore((s) => s.users);
  const [search, setSearch] = useState('');

  if (!user?.isAdmin) return <Redirect href="/(tabs)/profile" />;

  return (
    <ScreenContainer>
      <LinearGradient
        colors={[`${ADMIN}33`, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} hitSlop={12}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Users size={22} color={ADMIN} />
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '900' }}>Users ({roster.length})</Text>
          </View>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, email, phone, tier..."
          placeholderTextColor={COLORS.textFaint}
          style={{
            backgroundColor: COLORS.chip,
            borderWidth: 1,
            borderColor: COLORS.cardBorder,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            color: COLORS.text,
            fontSize: 15,
          }}
        />

        <UserRosterList search={search} />
      </ScrollView>
    </ScreenContainer>
  );
}
