import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState } from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { fmtDate, fmtTime } from '@/utils/dateUtils';

export default function NotificationsScreen() {
  const router = useRouter();
  const notifications = useAppStore((s) => s.notifications);
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50, gap: 16 }} showsVerticalScrollIndicator={false}>
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
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>Notifications</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{unread} unread</Text>
          </View>
          {unread > 0 ? (
            <Pressable onPress={() => void markAllRead()} hitSlop={8}>
              <CheckCheck size={22} color={COLORS.neon} />
            </Pressable>
          ) : null}
        </View>

        {notifications.length === 0 ? (
          <EmptyState title="No notifications" subtitle="Booking updates from the front desk will appear here." />
        ) : (
          notifications.map((n, i) => (
            <Animated.View key={n.id} entering={FadeInDown.delay(i * 35).duration(280)}>
              <Pressable onPress={() => void markRead(n.id)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                <GlassCard accent={n.readAt ? undefined : COLORS.neon}>
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: n.readAt ? COLORS.chip : `${COLORS.neon}22`,
                        }}
                      >
                        <Bell size={18} color={n.readAt ? COLORS.textMuted : COLORS.neon} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.text, fontWeight: '900', fontSize: 15 }}>{n.title}</Text>
                        <Text style={{ color: COLORS.textFaint, fontSize: 11 }}>
                          {fmtDate(n.createdAt)} · {fmtTime(n.createdAt)}
                        </Text>
                      </View>
                      {!n.readAt ? <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: COLORS.neon }} /> : null}
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 19 }}>{n.message}</Text>
                  </View>
                </GlassCard>
              </Pressable>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
