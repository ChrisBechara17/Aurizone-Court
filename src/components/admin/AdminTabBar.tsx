import { Pressable, Text, View } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';

export interface AdminTabDef<K extends string> {
  key: K;
  label: string;
  Icon: LucideIcon;
}

interface Props<K extends string> {
  tabs: AdminTabDef<K>[];
  active: K;
  onChange: (key: K) => void;
}

/**
 * Fixed bottom navigation for the admin console — mirrors the main app's tab bar
 * (same height, lift and active-pill treatment) but in the admin gold accent.
 * Section content is swapped in-place, so there's no giant scroll to hunt
 * through.
 */
export function AdminTabBar<K extends string>({ tabs, active, onChange }: Props<K>) {
  const ADMIN = COLORS.warning;
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        backgroundColor: COLORS.tabBar,
        borderTopColor: COLORS.cardBorder,
        borderTopWidth: 1,
        height: 82,
        paddingTop: 10,
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -3 },
        elevation: 16,
      }}
    >
      {tabs.map((t) => {
        const focused = t.key === active;
        const color = focused ? ADMIN : COLORS.textFaint;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            android_ripple={{ color: 'transparent' }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View
              style={{
                width: 52,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? `${ADMIN}1f` : 'transparent',
              }}
            >
              <t.Icon size={21} color={color} />
            </View>
            <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
