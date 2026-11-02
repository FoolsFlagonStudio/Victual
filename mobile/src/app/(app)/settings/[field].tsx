import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { ConfirmSheet } from '@/components/app/Sheet';
import { BackHeader, ErrorNote, Loading, Screen } from '@/components/app/ui';
import { Button } from '@/components/Button';
import { useAppData } from '@/data/AppData';
import { canContinue, fromPreferences, toPreferencesRequest, type Answers, type Step } from '@/onboarding/model';
import { Allergies, Budget, Diet, Household, Macros, Meals, PerWeek, WeekStart, type StepProps } from '@/onboarding/steps';
import { useTheme } from '@/theme/themeContext';

// Edit one preference group with the same screens as onboarding.
const FIELDS: Record<string, { title: string; steps: Step[]; render: (p: StepProps) => React.ReactNode; affectsPlan: boolean }> = {
  budget: { title: 'Weekly budget', steps: ['budget'], render: (p) => <Budget {...p} />, affectsPlan: true },
  household: { title: 'Household', steps: ['household'], render: (p) => <Household {...p} />, affectsPlan: true },
  meals: {
    title: 'Meals and recipes',
    steps: ['meals'],
    render: (p) => (
      <View style={{ gap: 40 }}>
        <Meals {...p} />
        {p.answers.meals.length ? <PerWeek {...p} /> : null}
      </View>
    ),
    affectsPlan: true,
  },
  schedule: { title: 'Week and auto-planning', steps: ['weekStart'], render: (p) => <WeekStart {...p} />, affectsPlan: false },
  diet: { title: 'Diet', steps: ['diet'], render: (p) => <Diet {...p} />, affectsPlan: true },
  allergies: { title: 'Allergies', steps: ['allergies'], render: (p) => <Allergies {...p} />, affectsPlan: true },
  macros: { title: 'Macro targets', steps: ['macros'], render: (p) => <Macros {...p} />, affectsPlan: true },
};

export default function EditSetting() {
  const { field } = useLocalSearchParams<{ field: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, labels, plan, savePreferences, regenerate } = useAppData();
  const config = FIELDS[field];
  const initial = useMemo(() => (prefs ? fromPreferences(prefs) : null), [prefs]);
  const [answers, setAnswers] = useState<Answers | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askRegen, setAskRegen] = useState(false);
  useEffect(() => {
    if (initial) setAnswers((a) => a ?? initial);
  }, [initial]);

  if (!config) return <Screen header={<BackHeader />}><ErrorNote message="Unknown setting." /></Screen>;
  if (!answers || !initial) return <Screen header={<BackHeader title={config.title} />}><Loading /></Screen>;

  const update: StepProps['update'] = (patch) => setAnswers((a) => (a ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) } : a));
  const changed = JSON.stringify(answers) !== JSON.stringify(initial);
  const valid = config.steps.every((s) => canContinue(s, answers));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await savePreferences(toPreferencesRequest(answers!, labels, prefs));
      if (config.affectsPlan && plan) setAskRegen(true);
      else router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<BackHeader title={config.title} />} contentStyle={{ paddingHorizontal: 36, paddingTop: 24 }}>
        {config.render({ answers, update })}
        {error ? <ErrorNote message={error} /> : null}
      </Screen>
      <View style={{ paddingBottom: Math.max(insets.bottom, 16) + 8, paddingTop: 12, alignItems: 'center', backgroundColor: colors.background }}>
        <Button label="Save" size="lg" disabled={!changed || !valid} loading={saving} onPress={save} />
      </View>
      <ConfirmSheet
        visible={askRegen}
        title="Update this week's plan?"
        body="Your new settings apply from the next plan. Regenerate this week now to use them right away (locked meals stay)."
        confirm="Regenerate"
        onClose={() => {
          setAskRegen(false);
          router.back();
        }}
        onConfirm={() => {
          setAskRegen(false);
          regenerate().catch(() => {});
          router.back();
        }}
      />
    </KeyboardAvoidingView>
  );
}
