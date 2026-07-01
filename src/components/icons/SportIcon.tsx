import Svg, { Circle, Line, Path } from 'react-native-svg';
import { SportType } from '@/models';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Basketball: ball outline with the classic cross + side seams. */
export function BasketballIcon({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={12} y1={2} x2={12} y2={22} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={2} y1={12} x2={22} y2={12} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5 4 C 8.5 8, 8.5 16, 5 20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M19 4 C 15.5 8, 15.5 16, 19 20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Tennis: ball outline with the curved seam (no cross). */
export function TennisIcon({ size = 24, color = '#fff', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M6 3.5 C 11 8, 11 16, 6 20.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M18 3.5 C 13 8, 13 16, 18 20.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Sport-aware icon, matching the lucide size/color API. */
export function SportIcon({ sport, ...rest }: IconProps & { sport: SportType }) {
  return sport === 'basketball' ? <BasketballIcon {...rest} /> : <TennisIcon {...rest} />;
}
