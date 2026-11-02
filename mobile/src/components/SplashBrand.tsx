import { StyleSheet, View } from 'react-native';
import { Logo } from '@/brand/Logo';
import { tokens } from '@/theme/tokens';

// From the Splash frame (402x874): mark 76pt tall above the wordmark (58pt,
// ascender to baseline) with a 27pt gap, the group sitting ~74pt above center.
// The native splash image (assets/images/splash-icon.png) is built to the same
// numbers so the hand-off from native splash to this screen doesn't jump.
export const SPLASH = { markHeight: 76, wordHeight: 58, gap: 27, liftAboveCenter: 74 };

export function SplashBrand() {
  return (
    <View style={styles.screen}>
      <View style={{ alignItems: 'center', gap: SPLASH.gap, marginBottom: SPLASH.liftAboveCenter * 2 }}>
        <Logo variant="mark" tone="accent" surface="dark" height={SPLASH.markHeight} />
        <Logo variant="wordmark" surface="dark" height={SPLASH.wordHeight} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.palette.forest,
  },
});
