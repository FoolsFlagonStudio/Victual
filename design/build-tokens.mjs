// Generates tokens.ts for the website and the app from design/tokens.json,
// plus a CSS variables file for the website.
// Usage (from the repo root): node design/build-tokens.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = JSON.parse(readFileSync(join(here, 'tokens.json'), 'utf8'));

// Drop "$"-prefixed comment keys.
const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('$')));

const palette = clean(src.palette);
const resolve = (value) => palette[value] ?? value; // palette name or raw hex

const colors = Object.fromEntries(
  Object.entries(src.colors).map(([mode, roles]) => [
    mode,
    Object.fromEntries(Object.entries(roles).map(([role, v]) => [role, resolve(v)])),
  ]),
);

const tokens = {
  palette,
  colors,
  fonts: src.fonts,
  typography: src.typography,
  spacing: src.spacing,
  radius: src.radius,
};

const header = `// AUTO-GENERATED from design/tokens.json - do not edit by hand.
// Run \`node design/build-tokens.mjs\` from the repo root to regenerate.
`;

const ts = `${header}
export const tokens = ${JSON.stringify(tokens, null, 2)} as const;

export type ColorMode = keyof typeof tokens.colors;
export type ColorRole = keyof typeof tokens.colors.light;
export type TypeVariant = keyof typeof tokens.typography;
export type Spacing = keyof typeof tokens.spacing;
export type Radius = keyof typeof tokens.radius;
`;

const cssVars = (vars) =>
  Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const fontStack = (f) =>
  `'${src.fonts[f]}', system-ui, -apple-system, 'Segoe UI', sans-serif`;

const base = {};
for (const [k, v] of Object.entries(palette)) base[`--palette-${kebab(k)}`] = v;
for (const [k, v] of Object.entries(src.spacing)) base[`--space-${k}`] = `${v}px`;
for (const [k, v] of Object.entries(src.radius)) base[`--radius-${k}`] = `${v}px`;
base['--font-brand'] = fontStack('brand');
base['--font-ui'] = fontStack('ui');
for (const [name, t] of Object.entries(src.typography)) {
  base[`--type-${name}`] = `${t.weight} ${t.size}px/${t.lineHeight}px var(--font-${t.font})`;
  base[`--tracking-${kebab(name)}`] = `${t.letterSpacing ?? 0}px`;
}
const modeVars = (mode) =>
  Object.fromEntries(Object.entries(colors[mode]).map(([k, v]) => [`--color-${kebab(k)}`, v]));

const css = `/* AUTO-GENERATED from design/tokens.json - do not edit by hand. */
:root {
${cssVars(base)}
${cssVars(modeVars('light'))}
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${cssVars(modeVars('dark')).replace(/^/gm, '  ')}
    color-scheme: dark;
  }
}

:root[data-theme='dark'] {
${cssVars(modeVars('dark'))}
  color-scheme: dark;
}
`;

const write = (rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log('wrote', rel);
};

// ---------- Icons ----------
const iconGroups = clean(JSON.parse(readFileSync(join(here, 'icons.json'), 'utf8')));
const iconNames = [...new Set(Object.values(iconGroups).flatMap((g) => Object.values(g)))].sort();
const iconsTs = (pkg) => `${header}
// Icon names come from the Figma icon sheet (design/icons.json).
// Usage: <Icon.groceries size={24} color={...} />  or  icons.tabBar.groceries
import {
${iconNames.map((n) => `  ${n},`).join('\n')}
} from '${pkg}';

export const icons = {
${Object.entries(iconGroups)
  .map(
    ([group, map]) =>
      `  ${group}: {\n${Object.entries(map)
        .map(([k, v]) => `    ${k}: ${v},`)
        .join('\n')}\n  },`,
  )
  .join('\n')}
} as const;

/** Flat lookup across every group, e.g. Icon.groceries, Icon.back. */
export const Icon = {
${Object.values(iconGroups)
  .flatMap((map) => Object.entries(map).map(([k, v]) => `  ${k}: ${v},`))
  .join('\n')}
} as const;

export type IconName = keyof typeof Icon;
`;

// Flat names must be unique across groups.
const flat = Object.values(iconGroups).flatMap((m) => Object.keys(m));
const dupes = flat.filter((k, i) => flat.indexOf(k) !== i);
if (dupes.length) throw new Error(`Duplicate icon names across groups: ${dupes.join(', ')}`);

write('frontend/src/theme/tokens.ts', ts);
write('frontend/src/theme/tokens.css', css);
write('frontend/src/theme/icons.ts', iconsTs('lucide-react'));
write('mobile/src/theme/tokens.ts', ts);
write('mobile/src/theme/icons.ts', iconsTs('lucide-react-native'));
