// Font files loaded at startup, and the mapping from (family, weight) to the
// loaded font name. React Native can't pick a weight from one family name the
// way CSS can, so every weight is its own font.
import { Poppins_300Light } from '@expo-google-fonts/poppins/300Light';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';

export const fontFiles = {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  DMSans_600SemiBold,
  DMSans_700Bold,
};

type FontName = keyof typeof fontFiles;

const fontsByWeight: Record<'ui' | 'brand', Partial<Record<number, FontName>>> = {
  ui: {
    300: 'Poppins_300Light',
    400: 'Poppins_400Regular',
    500: 'Poppins_500Medium',
    600: 'Poppins_600SemiBold',
    700: 'Poppins_700Bold',
  },
  brand: {
    600: 'DMSans_600SemiBold',
    700: 'DMSans_700Bold',
  },
};

export function fontFamily(font: 'ui' | 'brand', weight: number): FontName {
  const name = fontsByWeight[font][weight];
  if (!name) {
    throw new Error(`No ${font} font loaded for weight ${weight}. Add it to src/theme/fonts.ts.`);
  }
  return name;
}
