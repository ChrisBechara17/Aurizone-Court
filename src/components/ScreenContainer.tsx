import { ReactNode } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { APP_GRADIENT } from '@/constants/colors';

interface Props {
  children: ReactNode;
  edges?: Edge[];
}

/** App-wide dark gradient background + safe area. */
export function ScreenContainer({ children, edges = ['top'] }: Props) {
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={APP_GRADIENT} style={{ position: 'absolute', inset: 0 }} />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}
