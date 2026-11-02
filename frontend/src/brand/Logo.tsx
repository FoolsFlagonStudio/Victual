import type { CSSProperties, ReactNode } from 'react';
import { brandGeometry as g } from './geometry';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/themeContext';

const { palette } = tokens;

export type LogoVariant = 'lockup' | 'mark' | 'wordmark';
/** color: standard brand colors. accent: sage bowl + mauve steam on any surface (auth screens, splash). mono: one color. */
export type LogoTone = 'color' | 'accent' | 'mono';

type LogoProps = {
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Background the logo sits on. Defaults to the current theme. */
  surface?: 'light' | 'dark';
  /** Rendered height in px. Width follows the logo's proportions. */
  height?: number;
  className?: string;
  style?: CSSProperties;
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
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={g.mark.steam} stroke={steam} strokeWidth={g.mark.steamWidth} />
      <path d={g.mark.bowl} stroke={bowl} strokeWidth={g.mark.bowlWidth} />
    </g>
  );
}

export function Logo({ variant = 'lockup', tone = 'color', surface, height = 40, className, style }: LogoProps) {
  const { mode } = useTheme();
  const c = colorsFor(tone, surface ?? mode);
  const { mark, wordmark: w, lockup } = g;
  const word = <path d={w.path} fill={c.text} transform={`translate(${-w.minX} ${-w.minY})`} />;

  let viewBox: string;
  let body: ReactNode;

  if (variant === 'mark') {
    const { x, y, width, height: h } = mark.crop;
    viewBox = `${x} ${y} ${width} ${h}`;
    body = <Mark steam={c.steam} bowl={c.bowl} />;
  } else if (variant === 'wordmark') {
    viewBox = `0 0 ${w.width} ${w.height}`;
    body = word;
  } else {
    // Lockup, in wordmark font units: wordmark spans 0..w.height vertically.
    const s = lockup.markScale;
    const markW = mark.crop.width * s;
    const markH = mark.crop.height * s;
    const top = Math.min(0, lockup.markTop);
    const bottom = Math.max(w.height, lockup.markTop + markH);
    viewBox = `0 ${top} ${markW + lockup.gap + w.width} ${bottom - top}`;
    body = (
      <>
        <g transform={`translate(0 ${lockup.markTop}) scale(${s}) translate(${-mark.crop.x} ${-mark.crop.y})`}>
          <Mark steam={c.steam} bowl={c.bowl} />
        </g>
        <g transform={`translate(${markW + lockup.gap} 0)`}>{word}</g>
      </>
    );
  }

  return (
    <svg
      viewBox={viewBox}
      height={height}
      role="img"
      aria-label="Victual"
      className={className}
      style={{ width: 'auto', ...style }}
    >
      {body}
    </svg>
  );
}
