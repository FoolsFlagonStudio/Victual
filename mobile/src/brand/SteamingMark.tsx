import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { brandGeometry as g } from './geometry';
import { tokens } from '@/theme/tokens';

// The bowl mark with its steam animated: each wisp rises, sways and fades on its
// own loop, offset from its neighbors so the steam reads as continuous.
// Runs on Reanimated (UI thread). Honors the system "Reduce Motion" setting by
// showing the steam still.

const { mark } = g;
const viewBox = `${mark.crop.x} ${mark.crop.y} ${mark.crop.width} ${mark.crop.height}`;
const wisps = mark.steam.split(/(?=M)/).map((d) => d.trim());
const CYCLE_MS = 1800;

/** One wisp: progress 0 -> 1 rises, sways and fades, then starts over. */
function Wisp({ d, index, width, height, unit, still }: { d: string; index: number; width: number; height: number; unit: number; still: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (still) return;
    progress.value = withDelay(
      index * (CYCLE_MS / 3),
      withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.inOut(Easing.sin) }), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [progress, index, still]);

  const style = useAnimatedStyle(() => wispStyle(progress, unit, still));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={width} height={height} viewBox={viewBox}>
        <Path d={d} fill="none" stroke={tokens.palette.mauve} strokeWidth={mark.steamWidth} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function wispStyle(progress: SharedValue<number>, unit: number, still: boolean) {
  'worklet';
  if (still) return { opacity: 1, transform: [{ translateY: 0 }, { translateX: 0 }] };
  const p = progress.value;
  return {
    opacity: interpolate(p, [0, 0.15, 0.7, 1], [0, 1, 0.9, 0]),
    transform: [
      { translateY: interpolate(p, [0, 1], [2.5 * unit, -3 * unit]) },
      { translateX: interpolate(p, [0, 0.33, 0.66, 1], [0, 0.8 * unit, -0.8 * unit, 0]) },
    ],
  };
}

export function SteamingMark({ height = 80 }: { height?: number }) {
  const width = (height * mark.crop.width) / mark.crop.height;
  const unit = height / mark.crop.height; // points per mark unit
  const still = useReducedMotion();

  return (
    <View style={{ width, height }} accessibilityRole="image" accessibilityLabel="Victual">
      <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
        <Path
          d={mark.bowl}
          fill="none"
          stroke={tokens.palette.sage}
          strokeWidth={mark.bowlWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {wisps.map((d, i) => (
        <Wisp key={i} d={d} index={i} width={width} height={height} unit={unit} still={still} />
      ))}
    </View>
  );
}
