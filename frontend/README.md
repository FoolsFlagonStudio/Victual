# Victual Website

The marketing website: general information about the app and links to download it from the app stores.

> **Status:** built. The landing page and the privacy / terms / support / delete-account page are done from the Figma HTML, responsive down to 390px, with real app screenshots in the phone frames.

## Scope

This is a static site. It does not call the backend or require login.

| Route | Page |
| --- | --- |
| `/` | Landing: hero, how it works, features, budget spotlight, app screens, FAQ, CTA |
| `/privacy`, `/terms`, `/support`, `/delete-account` | One page with all four sections, opened at the matching one. The app links here, and the stores need the privacy and support URLs |
| `/styleguide` | Dev builds only |

**Before launch**, fill in `src/content/site.ts` (store links, support email) and the bracketed bits in `src/pages/Legal.tsx` (email provider, backup retention). The privacy policy and terms are a draft written from what the app actually stores; have them reviewed. Store buttons say "Coming soon" until the links are set.

**App screenshots** in `public/screens/` come from the app's demo mode (`EXPO_PUBLIC_DEMO=1`) at 390x844. Re-capture them when the app's screens change.

**The support form** has no backend: it opens the visitor's email app with their message filled in.

## Tech Stack

| Area       | Technology                                       |
| ---------- | ------------------------------------------------ |
| Build tool | Vite                                             |
| Language   | TypeScript                                       |
| Framework  | React, React Router                              |
| UI         | Ant Design, themed from the shared design tokens |
| Icons      | Lucide (`lucide-react`)                          |
| Fonts      | Poppins (UI), DM Sans (brand) via Fontsource     |
| Hosting    | To be decided. Any static host works; client-side routes need a fallback to `index.html` (e.g. Netlify `_redirects`, Vercel rewrites). |

## Setup

Requires Node 20.19+ (22 recommended).

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
npm run lint
```

Open `/styleguide` to check colors, type, logo and icons against the Figma. It's a dev reference and should be removed before launch.

## How Styling Works

- **Design tokens** (colors, type, spacing, radii) live in `../design/tokens.json`. `src/theme/tokens.ts` and `src/theme/tokens.css` are generated from it, so don't edit them by hand. After changing the JSON, run `node design/build-tokens.mjs` from the repo root.
- **Ant Design** gets its theme from `src/theme/antdTheme.ts`, which maps the tokens onto AntD's token names. Buttons, inputs and other AntD components pick up the brand colors and Poppins automatically.
- **CSS variables** are available everywhere, e.g. `var(--color-primary)`, `var(--space-lg)`, `var(--radius-md)`. Type styles are classes: `type-h1`, `type-h2`, `type-h3`, `type-body`, `type-small`, `type-caption`, `type-brand`.
- **Light/dark**: follows the system by default. `useTheme()` from `src/theme/themeContext.ts` exposes `mode` and `setPreference('light' | 'dark' | 'system')`.

## Logo and Icons

```tsx
import { Logo } from './brand/Logo';
import { Icon, icons } from './theme/icons';

<Logo />                                  // lockup, colors follow the theme
<Logo variant="mark" height={32} />       // also 'wordmark'; tone="mono"; surface="dark"
<Icon.groceries size={24} />              // names from the Figma icon sheet
<icons.tabBar.groceries size={24} />      // same icon, grouped
```

Icon names come from `../design/icons.json`. To add or swap an icon, edit that file and rerun the token build.
