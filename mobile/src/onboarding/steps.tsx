// One component per onboarding step. Each gets the answers and a setter.
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import { dayBefore } from '@/lib/dates';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { Icon } from '@/theme/icons';
import { useTheme } from '@/theme/themeContext';
import { Chip, FieldRow, Lead, OptionCard, StepButton, StepTitle, Toggle } from './components';
import { suggestedCounts } from './planDefaults';
import {
  ALLERGIES,
  BUDGET_PRESETS,
  DAYS,
  DIETS,
  HOUSEHOLD,
  MACROS,
  MEALS,
  PER_WEEK,
  macroError,
  type Answers,
  type Step,
} from './model';

export type StepProps = {
  answers: Answers;
  update: (patch: Partial<Answers> | ((a: Answers) => Partial<Answers>)) => void;
};

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function Intro({ onStart }: { onStart: () => void }) {
  const bullets = ['Set your weekly budget', 'Tell us how you eat', 'Get your plan and grocery list'];
  return (
    <View style={{ paddingTop: 40 }}>
      <StepTitle bold>Let's build your{'\n'}first week</StepTitle>
      <View style={styles.bullets}>
        {bullets.map((b) => (
          <View key={b} style={styles.bulletRow}>
            <Text variant="buttonLarge" color="text" style={styles.bulletText}>
              {'\u2022'}
            </Text>
            <Text variant="buttonLarge" color="text" style={[styles.bulletText, { flex: 1 }]}>
              {b.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>
      <Button label="Let's start" size="lg" onPress={onStart} style={{ marginTop: 56, minWidth: 120 }} />
    </View>
  );
}

export function Budget({ answers, update }: StepProps) {
  const input = useRef<TextInputInstance>(null);
  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPress={() => input.current?.focus()}
        accessibilityRole="button"
        accessibilityLabel={`Weekly budget, ${answers.budget} dollars. Tap to type an amount.`}
        style={styles.bigNumberWrap}
      >
        <Text variant="display" color="heading" numberOfLines={1} style={[styles.bigNumber, bigNumberSize(`$${answers.budget}`)]}>
          ${answers.budget}
        </Text>
        <TextInput
          ref={input}
          value={answers.budget ? String(answers.budget) : ''}
          onChangeText={(t) => update({ budget: Math.min(Number(t.replace(/\D/g, '').slice(0, 4)) || 0, 9999) })}
          keyboardType="number-pad"
          maxLength={4}
          caretHidden
          style={styles.hiddenInput}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Pressable>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {BUDGET_PRESETS.map((p) => (
          <Chip
            key={p}
            label={String(p)}
            accessibilityLabel={`${p} dollars`}
            selected={answers.budget === p}
            onPress={() => {
              input.current?.blur();
              update({ budget: p });
            }}
          />
        ))}
      </View>
      <Lead style={{ marginTop: 28, maxWidth: 260 }}>Your weekly grocery budget. Covers groceries for planned meals only.</Lead>
      <Text variant="fine" color="muted" style={{ marginTop: 10 }}>
        Tap the amount to type your own
      </Text>
    </View>
  );
}

export function Household({ answers, update }: StepProps) {
  const n = answers.household;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.stepperRow}>
        <StepButton kind="minus" label="Fewer people" disabled={n <= HOUSEHOLD.min} onPress={() => update({ household: n - 1 })} />
        <Text variant="display" color="heading" style={[styles.bigNumber, bigNumberSize(String(n)), { minWidth: 120 }]} accessibilityLiveRegion="polite">
          {n}
        </Text>
        <StepButton kind="plus" label="More people" disabled={n >= HOUSEHOLD.max} onPress={() => update({ household: n + 1 })} />
      </View>
      <StepTitle>How big is your{'\n'}household?</StepTitle>
      <Lead style={{ marginTop: 18, maxWidth: 270 }}>This will determine servings and measurements</Lead>
    </View>
  );
}

export function Meals({ answers, update }: StepProps) {
  return (
    <View>
      <StepTitle>Which meals would{'\n'}you like to cover?</StepTitle>
      <View style={styles.cards}>
        {MEALS.map((m) => (
          <OptionCard
            key={m.slot}
            label={m.label}
            Icon={m.Icon}
            selected={answers.meals.includes(m.slot)}
            onPress={() => update((a) => ({ meals: MEALS.map((x) => x.slot).filter((s) => (s === m.slot ? !a.meals.includes(s) : a.meals.includes(s))) }))}
          />
        ))}
      </View>
      <Lead style={{ marginTop: 40 }}>
        {answers.meals.length ? "Next, we'll ask how many recipes you'd like for each" : 'Pick at least one meal'}
      </Lead>
    </View>
  );
}

export function PerWeek({ answers, update }: StepProps) {
  const { colors } = useTheme();
  // Until you change a count, suggest the most variety that fits your budget.
  const suggestion = answers.perWeekTouched ? null : suggestedCounts(answers.meals, answers.household, answers.budget);
  const suggestionKey = suggestion ? JSON.stringify(suggestion.counts) : '';
  useEffect(() => {
    if (!suggestion) return;
    update((a) => ({ perWeek: { ...a.perWeek, ...suggestion.counts } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionKey]);
  return (
    <View>
      <StepTitle>How many recipes{'\n'}would you like{'\n'}for each?</StepTitle>
      <Lead style={{ marginTop: 14 }}>Each meal is planned for all 7 days. Fewer recipes means more leftovers.</Lead>
      {suggestion ? (
        <Text variant="label" color="subtle" style={{ textAlign: 'center', marginTop: 8 }}>
          {suggestion.tight ? `Kept simple to stretch $${answers.budget}` : `Suggested to fit about $${answers.budget} a week`}
        </Text>
      ) : null}
      <View style={{ marginTop: 24, paddingHorizontal: 12 }}>
        {MEALS.filter((m) => answers.meals.includes(m.slot)).map((m) => {
          const n = answers.perWeek[m.slot];
          const set = (v: number) => update((a) => ({ perWeek: { ...a.perWeek, [m.slot]: v }, perWeekTouched: true }));
          return (
            <FieldRow
              key={m.slot}
              label={m.plural}
              Icon={m.Icon}
              editable={false}
              trailing={
                <View style={styles.inlineStepper}>
                  <Pressable onPress={() => set(n - 1)} disabled={n <= PER_WEEK.min} hitSlop={10} accessibilityLabel={`Fewer ${m.plural.toLowerCase()}`} style={{ opacity: n <= PER_WEEK.min ? 0.3 : 1 }}>
                    <Icon.decrease size={20} color={colors.heading} />
                  </Pressable>
                  <Text variant="field" color="heading" style={{ minWidth: 22, textAlign: 'center' }} accessibilityLabel={`${n} ${m.plural.toLowerCase()} per week`}>
                    {n}
                  </Text>
                  <Pressable onPress={() => set(n + 1)} disabled={n >= PER_WEEK.max} hitSlop={10} accessibilityLabel={`More ${m.plural.toLowerCase()}`} style={{ opacity: n >= PER_WEEK.max ? 0.3 : 1 }}>
                    <Icon.increase size={20} color={colors.heading} />
                  </Pressable>
                </View>
              }
            />
          );
        })}
      </View>
      {answers.meals.includes('LUNCH') && answers.meals.includes('DINNER') ? (
        <View style={[styles.autoRow, { borderTopColor: colors.divider, marginHorizontal: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text variant="option" color="heading">
              Leftovers for lunch
            </Text>
            <Text variant="label" color="subtle">
              Cook a little more at dinner and have it for lunch the next day.
            </Text>
          </View>
          <Toggle value={answers.leftoversForLunch} onValueChange={(v) => update({ leftoversForLunch: v })} label="Leftovers for lunch" />
        </View>
      ) : null}
    </View>
  );
}

export function WeekStart({ answers, update }: StepProps) {
  const { colors } = useTheme();
  return (
    <View>
      <StepTitle>When should your{'\n'}week start?</StepTitle>
      <Lead style={{ marginTop: 14 }}>Each plan runs for 7 days from this day.</Lead>
      <View style={[styles.chips, styles.dayChips]} accessibilityRole="radiogroup">
        {DAYS.map((d) => (
          <Chip
            key={d.day}
            label={d.short}
            accessibilityLabel={d.long}
            selected={answers.weekStart === d.day}
            onPress={() =>
              // The auto-plan day follows the start day (the day before) until the user picks one.
              update((a) => ({ weekStart: d.day, ...(!a.autoPlanDayTouched && { autoPlanDay: dayBefore(d.day) }) }))
            }
          />
        ))}
      </View>

      <View style={[styles.autoRow, { borderTopColor: colors.divider }]}>
        <View style={{ flex: 1 }}>
          <Text variant="option" color="heading">
            Plan my week automatically
          </Text>
          <Text variant="label" color="subtle">
            Gives you time to review and swap meals before you shop.
          </Text>
        </View>
        <Toggle value={answers.autoPlan} onValueChange={(v) => update({ autoPlan: v })} label="Plan my week automatically" />
      </View>
      {answers.autoPlan && (
        <>
          <Lead style={{ marginTop: 18 }}>Build next week's plan every</Lead>
          <View style={[styles.chips, styles.dayChips, { marginTop: 14 }]} accessibilityRole="radiogroup">
            {DAYS.map((d) => (
              <Chip
                key={d.day}
                label={d.short}
                accessibilityLabel={`Plan on ${d.long}`}
                selected={answers.autoPlanDay === d.day}
                onPress={() => update({ autoPlanDay: d.day, autoPlanDayTouched: true })}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

export function Diet({ answers, update }: StepProps) {
  return (
    <View>
      <StepTitle>Do you have any{'\n'}specific diet?</StepTitle>
      <Lead style={{ marginTop: 14 }}>Pick any that apply, or skip.</Lead>
      <View style={[styles.cards, { marginTop: 24 }]}>
        {DIETS.map((d) => (
          <OptionCard
            key={d.key}
            label={d.label}
            Icon={d.Icon}
            selected={answers.diets.includes(d.key)}
            onPress={() =>
              update((a) => {
                const on = !a.diets.includes(d.key);
                const macros = { ...a.macros };
                // Low Calorie / Low Carb pre-fill a macro target; undo it if untouched.
                for (const [k, v] of Object.entries(d.prefill ?? {}) as [keyof typeof macros, string][]) {
                  if (on && !macros[k]) macros[k] = v;
                  if (!on && macros[k] === v) macros[k] = '';
                }
                return { diets: toggle(a.diets, d.key), macros };
              })
            }
          />
        ))}
      </View>
      <Lead style={{ marginTop: 20 }}>We'll cover allergies next</Lead>
    </View>
  );
}

export function Allergies({ answers, update }: StepProps) {
  return (
    <View>
      <StepTitle>Do you have any{'\n'}allergies?</StepTitle>
      <Lead style={{ marginTop: 14 }}>Recipes with these are left out of your plan.</Lead>
      <View style={[styles.cards, { marginTop: 24 }]}>
        {ALLERGIES.map((x) => (
          <OptionCard
            key={x.key}
            label={x.label}
            Icon={x.Icon}
            selected={answers.allergies.includes(x.key)}
            onPress={() => update((a) => ({ allergies: toggle(a.allergies, x.key) }))}
          />
        ))}
      </View>
    </View>
  );
}

export function Macros({ answers, update }: StepProps) {
  const refs = useRef<(TextInputInstance | null)[]>([]);
  return (
    <View>
      <StepTitle>Do you have any{'\n'}macro targets?</StepTitle>
      <Lead style={{ marginTop: 14 }}>Optional, per meal. We'll favor recipes that fit.</Lead>
      <View style={{ marginTop: 28 }}>
        {MACROS.map((m, i) => (
          <FieldRow
            key={m.key}
            ref={(r) => {
              refs.current[i] = r;
            }}
            label={m.label}
            value={answers.macros[m.key]}
            onChangeText={(t) => update((a) => ({ macros: { ...a.macros, [m.key]: t.replace(/\D/g, '').slice(0, 4) } }))}
            keyboardType="number-pad"
            returnKeyType={i < MACROS.length - 1 ? 'next' : 'done'}
            error={macroError(m.key, answers.macros[m.key])}
            trailing={
              <Text variant="label" color="muted">
                {m.unit}
              </Text>
            }
            onSubmitEditing={() => refs.current[i + 1]?.focus()}
          />
        ))}
      </View>
    </View>
  );
}

export function Review({ answers, onEdit }: { answers: Answers; onEdit: (step: Step) => void }) {
  const { colors } = useTheme();
  const meals = MEALS.filter((m) => answers.meals.includes(m.slot))
    .map((m) => `${answers.perWeek[m.slot]} ${answers.perWeek[m.slot] === 1 ? m.label : m.plural}`)
    .join(', ');
  const diets = DIETS.filter((d) => answers.diets.includes(d.key)).map((d) => d.label);
  const allergies = ALLERGIES.filter((x) => answers.allergies.includes(x.key)).map((x) => x.label.replace(/ (Allergy|Intolerance)$/, ''));
  const macros = MACROS.filter((m) => answers.macros[m.key]).map((m) => `${answers.macros[m.key]}${m.key === 'calories' ? ' cal' : `g ${m.label.toLowerCase()}`}`);
  const day = DAYS.find((d) => d.day === answers.weekStart)!.long;

  const rows: { step: Step; Glyph: (typeof Icon)[keyof typeof Icon]; value: string; label: string }[] = [
    { step: 'budget', Glyph: Icon.costPerServing, value: `$${answers.budget} a week`, label: 'Your budget' },
    { step: 'household', Glyph: Icon.profile, value: `${answers.household} ${answers.household === 1 ? 'person' : 'people'}`, label: 'Servings' },
    { step: 'perWeek', Glyph: Icon.cookMode, value: meals, label: "Recipes we'll give you each week" },
    {
      step: 'weekStart',
      Glyph: Icon.plan,
      value: `Starts ${day}`,
      label: answers.autoPlan ? `Auto-plans every ${DAYS.find((d) => d.day === answers.autoPlanDay)!.long}` : 'You plan each week yourself',
    },
    { step: 'diet', Glyph: Icon.calories, value: diets.length ? diets.join(', ') : 'No specific diet', label: 'Your diet' },
    { step: 'allergies', Glyph: Icon.nutAllergy, value: allergies.length ? allergies.join(', ') : 'None', label: 'Allergies' },
    { step: 'macros', Glyph: Icon.vegetarian, value: macros.length ? macros.join(', ') : 'No macros provided', label: 'Macro targets, per meal' },
  ];

  return (
    <View>
      <StepTitle>Let's Review</StepTitle>
      <Lead style={{ marginTop: 10 }}>Tap anything to change it.</Lead>
      <View style={{ marginTop: 22, gap: 4 }}>
        {rows.map((r) => (
          <Pressable
            key={r.step}
            onPress={() => onEdit(r.step)}
            accessibilityRole="button"
            accessibilityLabel={`${r.label}: ${r.value}. Edit`}
            style={({ pressed }) => [styles.reviewRow, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.reviewIcon}>
              <r.Glyph size={30} color={colors.primary} strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="option" color="heading">
                {r.value}
              </Text>
              <Text variant="label" color="subtle">
                {r.label}
              </Text>
            </View>
            <Icon.next size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Big numbers (budget, household). Sized by character count instead of
// adjustsFontSizeToFit, which on iOS swapped in the system font. The display style's
// 140/150 clipped Poppins' tall digits and the "$" on iOS, so line height is 1.3x.
function bigNumberSize(text: string) {
  const fontSize = text.length <= 3 ? 112 : text.length === 4 ? 100 : 82;
  return { fontSize, lineHeight: Math.round(fontSize * 1.3) };
}

const styles = StyleSheet.create({
  bullets: { marginTop: 72, gap: 12, paddingHorizontal: 14 },
  // Measured from the Intro frame: slightly smaller than the 14pt button style so each line fits.
  bulletText: { fontSize: 13, letterSpacing: 1.6 },
  bulletRow: { flexDirection: 'row', gap: 10 },
  bigNumberWrap: { alignSelf: 'stretch', alignItems: 'center' },
  bigNumber: { textAlign: 'center', maxWidth: 320 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 30 },
  dayChips: { flexWrap: 'wrap', marginTop: 28, rowGap: 14, columnGap: 14 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 30, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 12 },
  cards: { gap: 17, marginTop: 30 },
  inlineStepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 8, paddingLeft: 12 },
  reviewIcon: { width: 36, alignItems: 'center' },
});
