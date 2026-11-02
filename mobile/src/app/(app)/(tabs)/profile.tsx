import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/auth/AuthProvider';
import { ConfirmSheet } from '@/components/app/Sheet';
import { PageTitle, Row, Screen, SectionTitle } from '@/components/app/ui';
import { Text } from '@/components/Text';
import { features } from '@/config/features';
import { useAppData } from '@/data/AppData';
import { ALLERGIES, DAYS, DIETS, MACROS, MEALS, fromPreferences } from '@/onboarding/model';
import { Chip } from '@/onboarding/components';
import { money } from '@/lib/format';
import { Icon } from '@/theme/icons';
import { fontFamily } from '@/theme/fonts';
import { useTheme, type ThemePreference } from '@/theme/themeContext';

// TODO: point these at the website's real pages once it's deployed.
const SITE = 'https://victual.app';
const SUPPORT_EMAIL = 'evan@foolsflagon.com';

export default function Profile() {
  const { colors, preference, setPreference } = useTheme();
  const { user, signOut } = useAuth();
  const { prefs } = useAppData();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const a = prefs ? fromPreferences(prefs) : null;
  const go = (href: Href) => () => router.push(href);

  const day = (d?: string) => DAYS.find((x) => x.day === d)?.long;
  const meals = a ? MEALS.filter((m) => a.meals.includes(m.slot)).map((m) => `${a.perWeek[m.slot]} ${a.perWeek[m.slot] === 1 ? m.label.toLowerCase() : m.plural.toLowerCase()}`).join(', ') : '';
  const diets = a ? DIETS.filter((d) => a.diets.includes(d.key)).map((d) => d.label).join(', ') : '';
  const allergies = a ? ALLERGIES.filter((x) => a.allergies.includes(x.key)).map((x) => x.label.replace(/ (Allergy|Intolerance)$/, '')).join(', ') : '';
  const macros = a ? MACROS.filter((m) => a.macros[m.key]).map((m) => `${a.macros[m.key]}${m.key === 'calories' ? ' cal' : `g ${m.label.toLowerCase()}`}`).join(', ') : '';
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <Screen>
      <PageTitle title="Profile" />
      <View style={styles.who}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={{ fontFamily: fontFamily('ui', 600), fontSize: 20, color: colors.onAccent }}>{initials || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="option" color="heading" style={{ fontFamily: fontFamily('ui', 600) }}>
            {user?.firstName} {user?.lastName}
          </Text>
          <Text variant="label" color="subtle">
            {user?.email}
          </Text>
        </View>
      </View>

      <SectionTitle>Your plan</SectionTitle>
      {a && prefs ? (
        <>
          <Row Glyph={Icon.budget} label="Weekly budget" value={money(Number(prefs.weeklyBudget), true)} onPress={go('/settings/budget')} />
          <Row Glyph={Icon.servings} label="Household" value={`${a.household} ${a.household === 1 ? 'person' : 'people'}`} onPress={go('/settings/household')} />
          <Row Glyph={Icon.dinner} label="Meals and recipes" value={meals} onPress={go('/settings/meals')} />
          <Row
            Glyph={Icon.autoGenerateTime}
            label="Week and auto-planning"
            value={`Starts ${day(a.weekStart)} · ${a.autoPlan ? `auto-plans ${day(a.autoPlanDay)}` : 'auto-planning off'}`}
            onPress={go('/settings/schedule')}
          />
          <Row Glyph={Icon.vegan} label="Diet" value={diets || 'No specific diet'} onPress={go('/settings/diet')} />
          <Row Glyph={Icon.nutAllergy} label="Allergies" value={allergies || 'None'} onPress={go('/settings/allergies')} />
          <Row Glyph={Icon.protein} label="Macro targets" value={macros ? `${macros} per meal` : 'None set'} onPress={go('/settings/macros')} />
        </>
      ) : (
        <Text variant="bodySmall" color="subtle">
          Loading your plan settings...
        </Text>
      )}

      <SectionTitle>Appearance</SectionTitle>
      <View style={styles.theme} accessibilityRole="radiogroup">
        {(
          [
            ['light', 'Light'],
            ['dark', 'Dark'],
            ['system', 'System'],
          ] as [ThemePreference, string][]
        ).map(([v, label]) => (
          <Chip key={v} label={label} selected={preference === v} onPress={() => setPreference(v)} />
        ))}
      </View>

      <SectionTitle>Account</SectionTitle>
      <Row Glyph={Icon.profile} label="Name" value={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()} onPress={go('/account/name')} />
      <Row Glyph={Icon.email} label="Email" value={user?.email} onPress={go('/account/email')} />
      <Row Glyph={Icon.password} label="Password" value="Change your password" onPress={go('/account/password')} />

      <SectionTitle>Support</SectionTitle>
      <Row Glyph={Icon.help} label="Help and FAQ" onPress={() => Linking.openURL(`${SITE}/support`)} />
      <Row Glyph={Icon.sendFeedback} label="Send feedback" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Victual%20feedback`)} />
      <Row Glyph={Icon.privacyPolicy} label="Privacy Policy" onPress={() => Linking.openURL(`${SITE}/privacy`)} />
      <Row Glyph={Icon.terms} label="Terms of Service" onPress={() => Linking.openURL(`${SITE}/terms`)} />

      <View style={{ marginTop: 20 }}>
        <Row Glyph={Icon.logout} label="Log out" onPress={() => setConfirmLogout(true)} />
        <Row Glyph={Icon.remove} label="Delete account" danger onPress={go('/account/delete')} />
      </View>
      <Text variant="fine" color="muted" style={{ textAlign: 'center', marginTop: 24 }}>
        Victual {Constants.expoConfig?.version ?? ''}
        {features.demoMode ? ' · demo mode' : ''}
      </Text>

      <ConfirmSheet
        visible={confirmLogout}
        title="Log out?"
        body="You'll need your email and password to log back in."
        confirm="Log out"
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  theme: { flexDirection: 'row', gap: 14 },
});
