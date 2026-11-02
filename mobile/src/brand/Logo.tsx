import type { ReactNode } from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { brandGeometry as g } from './geometry';
import { tokens } from '@/theme/tokens';
import { useTheme } from '@/theme/themeContext';

const { palette } = tokens;

export type LogoVariant = 'lockup' | 'mark' | 'wordmark';
/** color: standard brand colors. accent: sage bowl + mauve steam on any surface (auth screens, splash). mono: one color. */
export type LogoTone = 'color' | 'accent' | 'mono';

type LogoProps = {
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Background the logo sits on. Defaults to the current theme. */
  surface?: 'light' | 'dark';
  /** Rendered height. Width follows the logo's proportions. */
  height?: number;
};

function colorsFor(tone: LogoTone, surface: 'light' | 'dark') {
  if (tone === 'mono') {
    const ink = surface === 'light' ? palette.black : palette.backgroundLight;
    return { steam: ink, bowl: ink, text: ink };
  }
  if (tone === 'accent') {
    return { steam: palette.mauve, bowl: palette.sage, text: surface === 'light' ? palette.forest : palette.backgroundLight };
  }
  return surface === 'light'
    ? { steam: palette.mauve, bowl: palette.forest, text: palette.forest }
    : { steam: palette.mauve, bowl: palette.sage, text: palette.backgroundLight };
}

function Mark({ steam, bowl }: { steam: string; bowl: string }) {
  return (
    <G fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d={g.mark.steam} stroke={steam} strokeWidth={g.mark.steamWidth} />
      <Path d={g.mark.bowl} stroke={bowl} strokeWidth={g.mark.bowlWidth} />
    </G>
  );
}

export function Logo({ variant = 'lockup', tone = 'color', surface, height = 40 }: LogoProps) {
  const { mode } = useTheme();
  const c = colorsFor(tone, surface ?? mode);
  const { mark, wordmark: w, lockup } = g;
  const word = <Path d={w.path} fill={c.text} transform={`translate(${-w.minX} ${-w.minY})`} />;

  let box: { x: number; y: number; width: number; height: number };
  let body: ReactNode;

  if (variant === 'mark') {
    box = mark.crop;
    body = <Mark steam={c.steam} bowl={c.bowl} />;
  } else if (variant === 'wordmark') {
    box = { x: 0, y: 0, width: w.width, height: w.height };
    body = word;
  } else {
    // Lockup, in wordmark font units: wordmark spans 0..w.height vertically.
    const s = lockup.markScale;
    const markW = mark.crop.width * s;
    const markH = mark.crop.height * s;
    const top = Math.min(0, lockup.markTop);
    const bottom = Math.max(w.height, lockup.markTop + markH);
    box = { x: 0, y: top, width: markW + lockup.gap + w.width, height: bottom - top };
    body = (
      <>
        <G transform={`translate(0 ${lockup.markTop}) scale(${s}) translate(${-mark.crop.x} ${-mark.crop.y})`}>
          <Mark steam={c.steam} bowl={c.bowl} />
        </G>
        <G transform={`translate(${markW + lockup.gap} 0)`}>{word}</G>
      </>
    );
  }

  return (
    <Svg
      width={(height * box.width) / box.height}
      height={height}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      accessibilityRole="image"
      accessibilityLabel="Victual"
    >
      {body}
    </Svg>
  );
}
