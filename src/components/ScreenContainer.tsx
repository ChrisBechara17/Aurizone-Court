import { ReactNode } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { APP_GRADIENT, COLORS } from '@/constants/colors';

interface Props {
  children: ReactNode;
  edges?: Edge[];
}

/** App-wide themed gradient background + safe area. The solid base color under
 *  the gradient prevents a white flash on the first frame of screen transitions
 *  (the LinearGradient is absolutely positioned and paints one frame later). */
export function ScreenContainer({ children, edges = ['top'] }: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.navBg }}>
      <LinearGradient colors={APP_GRADIENT} style={{ position: 'absolute', inset: 0 }} />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}
