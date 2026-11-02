// Feature flags for things that are designed but not ready yet.
// Env flags are read at bundle time: restart `npx expo start` after changing .env.local.

// Expo only inlines EXPO_PUBLIC_* vars written out literally (process.env.EXPO_PUBLIC_X),
// so each flag reads its own variable and passes the value in.
const flag = (v: string | undefined, fallback: boolean) => (v === undefined || v === '' ? fallback : v === '1' || v === 'true');

export const features = {
  /**
   * "Sign in with Google / Apple" buttons on Log In and Sign Up.
   * Off until the backend supports social sign-in (roadmap stretch goal).
   * The buttons, layout and divider are already built - flip this to show them.
   */
  socialSignIn: false,

  /**
   * Simulate meal plans and grocery lists on the device (built from your real
   * recipes) instead of using the backend's generator. Off by default now that the
   * backend plans; EXPO_PUBLIC_MOCK_PLANS=1 turns it back on for UI work.
   * Sides, pantry staples and auto-planning only exist on the backend.
   */
  mockMealPlans: flag(process.env.EXPO_PUBLIC_MOCK_PLANS, false),

  /**
   * Run the whole app on sample data with no backend (portfolio demos, UI work).
   * EXPO_PUBLIC_DEMO=1. Any email/password logs in.
   */
  demoMode: flag(process.env.EXPO_PUBLIC_DEMO, false),
};
