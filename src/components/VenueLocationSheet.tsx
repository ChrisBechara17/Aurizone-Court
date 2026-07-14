import { Alert, Linking, Modal, Pressable, Text, View } from 'react-native';
import { ExternalLink, MapPin, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/colors';
import { DEFAULT_VENUE_LOCATION } from '@/constants/venue';
import { VenueLocation } from '@/models';
import { PrimaryGradientButton } from './PrimaryGradientButton';

interface Props {
  visible: boolean;
  location: VenueLocation;
  onClose: () => void;
}

export function VenueLocationSheet({ visible, location, onClose }: Props) {
  const { bottom } = useSafeAreaInsets();

  const openDirections = async () => {
    const mapsUrl = /^https?:\/\//i.test(location.mapsUrl)
      ? location.mapsUrl
      : DEFAULT_VENUE_LOCATION.mapsUrl;
    try {
      if (!(await Linking.canOpenURL(mapsUrl))) throw new Error('No map handler');
      await Linking.openURL(mapsUrl);
      onClose();
    } catch {
      Alert.alert('Could not open maps', 'Please try again from a device with a maps app or web browser.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close location details"
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: COLORS.bg700,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: COLORS.cardBorder,
            paddingTop: 12,
            paddingHorizontal: 20,
            paddingBottom: Math.max(bottom, 16) + 8,
            gap: 20,
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.cardBorder, alignSelf: 'center' }} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${COLORS.neon}1f`,
                borderWidth: 1,
                borderColor: `${COLORS.neon}44`,
              }}
            >
              <MapPin size={24} color={COLORS.neon} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: COLORS.text, fontSize: 21, fontWeight: '900' }}>{location.name}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 14, marginTop: 3 }}>{location.shortLocation}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={22} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <PrimaryGradientButton
            label="Get Directions"
            onPress={openDirections}
            icon={<ExternalLink size={20} color="#05060f" />}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
