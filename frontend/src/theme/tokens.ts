// AUTO-GENERATED from design/tokens.json - do not edit by hand.
// Run `node design/build-tokens.mjs` from the repo root to regenerate.

export const tokens = {
  "palette": {
    "backgroundLight": "#F7F2EE",
    "backgroundDark": "#3C3C3C",
    "mauve": "#C59DB0",
    "plum": "#3D2433",
    "sage": "#9BC59D",
    "forest": "#1F3326",
    "black": "#000000",
    "white": "#FFFFFF"
  },
  "colors": {
    "light": {
      "background": "#F7F2EE",
      "surface": "#FFFFFF",
      "text": "#000000",
      "textStrong": "#000000",
      "muted": "#8E8A87",
      "primary": "#9BC59D",
      "onPrimary": "#000000",
      "accent": "#9BC59D",
      "onAccent": "#1F3326",
      "secondary": "#C59DB0",
      "onSecondary": "#3D2433",
      "highlight": "#3D2433",
      "brandSurface": "#1F3326",
      "onBrandSurface": "#F7F2EE",
      "border": "#D9D2CC",
      "divider": "#A9A5A2",
      "danger": "#B3261E",
      "heading": "#444444",
      "subtle": "#5A5A59",
      "primaryDisabled": "#CDD4CD",
      "onPrimaryDisabled": "#F7F2EE",
      "selected": "#1F3326",
      "onSelected": "#F7F2EE",
      "progressLine": "#C59DB0"
    },
    "dark": {
      "background": "#3C3C3C",
      "surface": "#474747",
      "text": "#F7F2EE",
      "textStrong": "#FFFFFF",
      "muted": "#B3ADA8",
      "primary": "#9BC59D",
      "onPrimary": "#1F3326",
      "accent": "#C59DB0",
      "onAccent": "#3D2433",
      "secondary": "#C59DB0",
      "onSecondary": "#3D2433",
      "highlight": "#C59DB0",
      "brandSurface": "#1F3326",
      "onBrandSurface": "#F7F2EE",
      "border": "#5A5A5A",
      "divider": "#7A7672",
      "danger": "#F2B8B5",
      "heading": "#F7F2EE",
      "subtle": "#C9C3BE",
      "primaryDisabled": "#5E655E",
      "onPrimaryDisabled": "#A3AAA3",
      "selected": "#F7F2EE",
      "onSelected": "#1F3326",
      "progressLine": "#C59DB0"
    }
  },
  "fonts": {
    "brand": "DM Sans",
    "ui": "Poppins"
  },
  "typography": {
    "brand": {
      "font": "brand",
      "weight": 600,
      "size": 32,
      "lineHeight": 40
    },
    "h1": {
      "font": "ui",
      "weight": 700,
      "size": 32,
      "lineHeight": 40
    },
    "h2": {
      "font": "ui",
      "weight": 600,
      "size": 28,
      "lineHeight": 36
    },
    "h3": {
      "font": "ui",
      "weight": 500,
      "size": 20,
      "lineHeight": 28
    },
    "body": {
      "font": "ui",
      "weight": 400,
      "size": 16,
      "lineHeight": 24
    },
    "small": {
      "font": "ui",
      "weight": 300,
      "size": 12,
      "lineHeight": 18
    },
    "caption": {
      "font": "ui",
      "weight": 700,
      "size": 12,
      "lineHeight": 16
    },
    "button": {
      "font": "ui",
      "weight": 500,
      "size": 12,
      "lineHeight": 16,
      "letterSpacing": 1.5
    },
    "input": {
      "font": "ui",
      "weight": 400,
      "size": 12,
      "lineHeight": 18,
      "letterSpacing": 0.5
    },
    "bodySmall": {
      "font": "ui",
      "weight": 400,
      "size": 12,
      "lineHeight": 18
    },
    "social": {
      "font": "ui",
      "weight": 500,
      "size": 15,
      "lineHeight": 20
    },
    "fine": {
      "font": "ui",
      "weight": 400,
      "size": 11,
      "lineHeight": 14
    },
    "display": {
      "font": "ui",
      "weight": 600,
      "size": 140,
      "lineHeight": 150
    },
    "title": {
      "font": "ui",
      "weight": 400,
      "size": 32,
      "lineHeight": 38
    },
    "lead": {
      "font": "ui",
      "weight": 300,
      "size": 17,
      "lineHeight": 22
    },
    "option": {
      "font": "ui",
      "weight": 400,
      "size": 16,
      "lineHeight": 22
    },
    "label": {
      "font": "ui",
      "weight": 400,
      "size": 14,
      "lineHeight": 20
    },
    "field": {
      "font": "ui",
      "weight": 400,
      "size": 18,
      "lineHeight": 24,
      "letterSpacing": 0.5
    },
    "buttonLarge": {
      "font": "ui",
      "weight": 500,
      "size": 14,
      "lineHeight": 18,
      "letterSpacing": 2
    }
  },
  "spacing": {
    "xxs": 2,
    "xs": 4,
    "sm": 8,
    "md": 12,
    "lg": 16,
    "xl": 24,
    "xxl": 32,
    "xxxl": 48
  },
  "radius": {
    "sm": 6,
    "md": 10,
    "lg": 16,
    "xl": 24,
    "pill": 999
  }
} as const;

export type ColorMode = keyof typeof tokens.colors;
export type ColorRole = keyof typeof tokens.colors.light;
export type TypeVariant = keyof typeof tokens.typography;
export type Spacing = keyof typeof tokens.spacing;
export type Radius = keyof typeof tokens.radius;
