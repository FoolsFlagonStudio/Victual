import { Check, ChefHat, Leaf, Lock, ShoppingBasket, Sparkles, Wallet } from 'lucide-react';
import { Logo } from '../brand/Logo';
import { Phone, SitePage, StoreButtons } from '../components/site/Chrome';
import s from './Landing.module.css';

const NAV = [
  { label: 'How it works', to: '#how' },
  { label: 'Features', to: '#features' },
  { label: 'FAQ', to: '#faq' },
];

const STEPS = [
  { title: 'Tell us your budget and tastes', body: 'Set a weekly grocery budget, household size, which meals to plan, and any diets, allergens or macro targets.' },
  { title: 'Get a plan that fits', body: 'Every week Victual builds a fresh meal plan from hundreds of recipes, priced with average grocery prices before you shop.' },
  { title: 'Shop one list, cook all week', body: "One grocery list grouped by aisle, then step-by-step cook mode when it's time to make dinner." },
];

const FEATURES = [
  { Icon: Wallet, title: 'Budget-first planning', body: 'Your weekly budget is the starting point. Every plan shows its total before you shop.' },
  { Icon: ShoppingBasket, title: 'One list, sorted by aisle', body: 'Ingredients merge across recipes into a single list you can check off as you shop.' },
  { Icon: Lock, title: 'Swap and lock meals', body: 'Keep the meals you love, swap the rest. Locked meals stay put when you regenerate.' },
  { Icon: Leaf, title: 'Built around how you eat', body: 'Vegetarian, vegan, high protein, allergen-free or calorie targets - every recipe respects them.' },
  { Icon: ChefHat, title: 'Cook mode', body: 'One step at a time in big type, with built-in timers and the screen kept awake.' },
  { Icon: Sparkles, title: 'New recipes every month', body: "A big, growing catalog means your week doesn't cycle through the same 15 dinners." },
];

const FAQ = [
  {
    q: 'How does Victual know grocery prices?',
    a: "Ingredients are priced with average grocery prices from national store and government price data, refreshed weekly. Totals are estimates: your store's prices and package sizes will differ a little.",
  },
  {
    q: 'Do I need to share my location?',
    a: "No. Victual uses average prices instead of tracking which store you shop at, so it never asks for your ZIP code or location.",
  },
  {
    q: 'Can it handle allergies and diets?',
    a: 'Yes. Set allergens, diet types, and calorie or macro targets, and every plan respects them. Recipes are labeled from their ingredients, so for a serious allergy always check the labels on what you buy.',
  },
  {
    q: "What if I don't like a meal in my plan?",
    a: 'Swap it for a suggestion that fits the same budget and preferences, or lock the ones you like and regenerate the rest.',
  },
  { q: 'Is it free?', a: 'Yes. Victual is free on iOS and Android, with no ads.' },
];

const SCREENS = [
  { src: '/screens/plan.webp', alt: 'Plan screen showing one day of meals with lock and favorite buttons', caption: 'Your week, planned', tint: 'mauve' },
  { src: '/screens/groceries.webp', alt: 'Grocery list grouped by aisle with checkboxes', caption: 'One list by aisle', tint: 'sage' },
  { src: '/screens/recipe.webp', alt: 'Recipe detail with macros, servings and ingredients', caption: 'Recipes with real costs', tint: 'mauve' },
];

export default function Landing() {
  return (
    <SitePage nav={NAV}>
      {/* Hero */}
      <section id="top" className={`${s.wrap} ${s.hero}`}>
        <div className={s.heroText}>
          <span className={s.pill}>Weekly meal planning + grocery budgeting</span>
          <h1 className={s.h1}>Meals planned to your budget.</h1>
          <p className={s.lead}>
            Tell Victual what you can spend and how you eat. Every week you get a full meal plan and one grocery list that fits - priced before you ever leave the house.
          </p>
          <div id="download" className={s.anchor}>
            <StoreButtons />
          </div>
          <p className={s.small}>Free on iOS and Android.</p>
        </div>
        <div className={s.heroPhone}>
          <div className={s.blob} aria-hidden="true" />
          <Phone src="/screens/home.webp" alt="Victual home screen showing this week's grocery budget and today's meals" width={300} height={620} className={s.heroFrame} />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className={`${s.white} ${s.section} ${s.anchor}`}>
        <div className={s.wrap}>
          <div className={s.heading}>
            <span className={s.eyebrow}>HOW IT WORKS</span>
            <h2 className={s.h2}>Set it up once. Eat well every week.</h2>
          </div>
          <ol className={s.steps}>
            {STEPS.map((step, i) => (
              <li key={step.title} className={s.step}>
                <span className={s.num} aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className={s.h3}>{step.title}</h3>
                <p className={s.body}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="features" className={`${s.section} ${s.anchor}`}>
        <div className={s.wrap}>
          <div className={s.heading}>
            <span className={s.eyebrow}>FEATURES</span>
            <h2 className={s.h2}>Everything between "what's for dinner" and checkout.</h2>
          </div>
          <div className={s.features}>
            {FEATURES.map(({ Icon, title, body }) => (
              <div key={title} className={s.feature}>
                <span className={s.featureIcon} aria-hidden="true">
                  <Icon size={24} />
                </span>
                <div className={s.featureText}>
                  <h3 className={s.h3}>{title}</h3>
                  <p className={s.body}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Budget spotlight */}
      <section className={`${s.dark} ${s.section}`}>
        <div className={`${s.wrap} ${s.split}`}>
          <div className={s.splitText}>
            <span className={`${s.eyebrow} ${s.eyebrowSage}`}>THE BUDGET PART</span>
            <h2 className={s.h2}>Know what the week costs before you shop.</h2>
            <p className={s.darkBody}>
              Victual prices every ingredient with average grocery prices, refreshed weekly. Go over budget and it suggests cheaper swaps instead of leaving you to figure it out at the register.
            </p>
            <ul className={s.checks}>
              {['Cost per serving on every recipe', 'Leftovers planned in, so nothing goes to waste', 'See how each swap changes the week'].map((t) => (
                <li key={t}>
                  <Check size={20} color="var(--palette-sage)" strokeWidth={2.5} aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className={s.splitCard}>
            <BudgetExample />
          </div>
        </div>
      </section>

      {/* Screens */}
      <section className={s.section}>
        <div className={s.wrap}>
          <div className={`${s.heading} ${s.center}`}>
            <span className={s.eyebrow}>INSIDE THE APP</span>
            <h2 className={s.h2}>Plan, shop, cook.</h2>
          </div>
        </div>
        <div className={s.screens}>
          {SCREENS.map((sc) => (
            <figure key={sc.src} className={s.screen}>
              <Phone src={sc.src} alt={sc.alt} width={260} height={540} className={s.screenFrame} />
              <figcaption className={s.caption}>{sc.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={`${s.white} ${s.section} ${s.anchor}`}>
        <div className={s.faqWrap}>
          <h2 className={`${s.h2} ${s.center}`}>Questions</h2>
          <div className={s.faq}>
            {FAQ.map((item, i) => (
              <details key={item.q} open={i === 0} className={s.qa}>
                <summary>{item.q}</summary>
                <p className={s.body}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={s.section}>
        <div className={s.wrap}>
          <div className={s.cta}>
            <Logo variant="mark" tone="accent" surface="dark" height={64} />
            <h2 className={s.ctaTitle}>Your first week is two minutes away.</h2>
            <p className={s.darkBody}>Download Victual and plan to your budget.</p>
            <StoreButtons light />
          </div>
        </div>
      </section>
    </SitePage>
  );
}

/** Example budget card, mirroring the app's Budget screen. */
function BudgetExample() {
  const rows = [
    { label: 'Breakfast', amount: '$18.40', color: 'var(--palette-mauve)', pct: 18 },
    { label: 'Lunch', amount: '$26.60', color: 'var(--palette-sage)', pct: 27 },
    { label: 'Dinner', amount: '$39.20', color: 'var(--palette-forest)', pct: 39 },
  ];
  return (
    <figure className={s.budget} aria-label="Example week: $84.20 of a $100 budget. Breakfast $18.40, lunch $26.60, dinner $39.20. $15.80 under budget.">
      <div className={s.budgetHead}>
        <span className={s.budgetLabel}>Example week</span>
        <span className={s.budgetMuted}>Budget $100</span>
      </div>
      <span className={s.budgetTotal}>$84.20</span>
      <div className={s.budgetBar} aria-hidden="true">
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${r.pct}%`, background: r.color }} />
        ))}
      </div>
      <div className={s.budgetRows} aria-hidden="true">
        {rows.map((r) => (
          <div key={r.label} className={s.budgetRow}>
            <span className={s.budgetKey}>
              <span className={s.swatch} style={{ background: r.color }} />
              {r.label}
            </span>
            <span className={s.budgetAmount}>{r.amount}</span>
          </div>
        ))}
      </div>
      <span className={s.under}>$15.80 under budget this week</span>
    </figure>
  );
}
