import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Form, Input } from 'antd';
import { SitePage } from '../components/site/Chrome';
import { LEGAL_UPDATED, SUPPORT_EMAIL } from '../content/site';
import s from './Legal.module.css';

// Privacy, terms, support and account deletion on one page (from victual-privacy-support.html).
// /privacy, /terms, /support and /delete-account all land here, scrolled to their section.
// The app links to these URLs, and the App Store needs the privacy and support ones.
// Written from what the app actually stores. Update it when that changes (new data, new providers).

const SECTIONS = [
  { id: 'privacy', label: 'Privacy policy' },
  { id: 'terms', label: 'Terms of use' },
  { id: 'support', label: 'Support' },
  { id: 'delete', label: 'Delete your account' },
];
const ROUTE_TO_SECTION: Record<string, string> = { '/privacy': 'privacy', '/terms': 'terms', '/support': 'support', '/delete-account': 'delete' };

export default function Legal() {
  const { pathname, hash } = useLocation();
  const active = useActiveSection();

  useEffect(() => {
    const id = hash.slice(1) || ROUTE_TO_SECTION[pathname];
    const el = id ? document.getElementById(id) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    document.title = `Victual - ${SECTIONS.find((x) => x.id === id)?.label ?? 'Privacy and support'}`;
  }, [pathname, hash]);

  return (
    <SitePage>
      <div className={s.layout}>
        <aside className={s.aside}>
          <nav aria-label="On this page" className={s.toc}>
            <span className={s.tocTitle}>ON THIS PAGE</span>
            {SECTIONS.map((x) => (
              <a key={x.id} href={`#${x.id}`} className={active === x.id ? s.current : undefined} aria-current={active === x.id ? 'location' : undefined}>
                {x.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className={s.content}>
          <section id="privacy" className={s.section}>
            <h1 className={s.h1}>Privacy policy</h1>
            <p className={s.updated}>Last updated {LEGAL_UPDATED}</p>
            <p className={s.p}>
              Victual plans weekly meals and grocery lists around your budget. This policy explains what we store to do that, and what we don't. We never sell your data or show you ads.
            </p>

            <H2>What we collect</H2>
            <ul className={s.list}>
              <li>
                <strong>Account:</strong> your first and last name, email address, and password (stored only as a secure hash, never in plain text).
              </li>
              <li>
                <strong>Plan settings:</strong> weekly budget, household size, which meals to plan and how many recipes for each, the day your week starts and when to plan it automatically, whether to use leftovers for lunch, your time zone (so automatic plans arrive on your day), diets, allergies, and any calorie or macro targets.
              </li>
              <li>
                <strong>What you do in the app:</strong> your meal plans, swaps and locked meals, sides you pick, grocery list check marks, favorite recipes, and the meals you've cooked (so plans don't repeat them too often).
              </li>
              <li>
                <strong>On your phone only:</strong> your light or dark mode choice, onboarding progress if you leave partway, and recipe ratings. These stay on your device.
              </li>
            </ul>
            <p className={s.p}>
              We don't collect your location or ZIP code, contacts, photos, payment details, or advertising identifiers. Grocery prices are national averages, so we never need to know where you shop.
            </p>

            <H2>How we use it</H2>
            <ul className={s.list}>
              <li>To build your weekly meal plans and grocery lists and show what they cost.</li>
              <li>To send account emails you need: sign-up verification codes, password reset codes, and email change confirmations.</li>
              <li>To keep your account secure and fix problems.</li>
            </ul>

            <H2>Who else is involved</H2>
            <ul className={s.list}>
              <li>
                <strong>Supabase</strong> hosts our database, which stores the account and plan data above.
              </li>
              <li>
                <strong>Render</strong> runs the server the app talks to.
              </li>
              <li>
                <strong>Resend</strong> receives your email address and name to deliver account emails.
              </li>
              <li>
                <strong>Grocery price sources</strong> (store and government price data) are looked up per ingredient. No information about you is sent to them.
              </li>
            </ul>

            <H2>Your choices</H2>
            <p className={s.p}>
              Change any plan setting or your name, email and password under Profile in the app. Clear your diet, allergy and nutrition settings there too, and remove favorites from any recipe. To delete other data without closing your account (for example your past meal plans and cooking history), or to ask for a copy of your data, email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the address on your account and we'll handle it within 7 days. You can also delete your whole account at any time (see <a href="#delete">Delete your account</a>).
            </p>

            <H2>Children</H2>
            <p className={s.p}>Victual isn't directed at children under 13, and we don't knowingly collect their information.</p>

            <H2>Changes</H2>
            <p className={s.p}>If this policy changes in a meaningful way, we'll update the date above and let you know in the app.</p>
          </section>

          <section id="terms" className={`${s.section} ${s.divided}`}>
            <h2 className={s.h1Small}>Terms of use</h2>
            <p className={s.p}>By using Victual you agree to these terms.</p>
            <H2>Prices are estimates</H2>
            <p className={s.p}>
              Costs in Victual are estimates based on average grocery prices. Your store's prices, sales, and package sizes will differ, so the total at the register may be higher or lower.
            </p>
            <H2>Not medical or allergy advice</H2>
            <p className={s.p}>
              Diet and allergy labels are assigned automatically from each recipe's ingredients and can be wrong. Victual isn't medical, nutritional or allergy advice. If you have a food allergy or a medical diet, always check ingredient labels and talk to your doctor or a dietitian.
            </p>
            <H2>Recipes</H2>
            <p className={s.p}>Recipes are adapted from published sources and credited with a link on each recipe. Nutrition is calculated from the ingredients and is approximate.</p>
            <H2>Your account</H2>
            <p className={s.p}>
              Keep your password private and don't use Victual to break the law or disrupt the service. We may suspend accounts that do. You can stop using Victual and delete your account at any time.
            </p>
            <H2>No warranty</H2>
            <p className={s.p}>
              Victual is provided as is. To the extent the law allows, we aren't liable for losses from using it, including grocery costs that differ from estimates.
            </p>
          </section>

          <section id="support" className={`${s.section} ${s.divided}`}>
            <h2 className={s.h1Small}>Support</h2>
            <p className={s.p}>Questions, bugs or feature ideas? We'd love to hear from you.</p>
            <SupportForm />
          </section>

          <section id="delete" className={`${s.section} ${s.divided}`}>
            <h2 className={s.h1Small}>Delete your account</h2>
            <p className={s.p}>
              In the app, go to the <strong>Profile</strong> tab, then <strong>Delete account</strong>, and confirm with your password. This permanently removes your account, plan settings, meal plans, grocery lists and favorites. It can't be undone.
            </p>
            <p className={s.p}>
              Can't get into the app? Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20account`}>{SUPPORT_EMAIL}</a> from the address on your account and we'll delete it within 7 days and reply to confirm. Deleting from the app takes effect right away.
            </p>
          </section>
        </div>
      </div>
    </SitePage>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h3 className={s.h2}>{children}</h3>;
}

/** No support backend yet: the form writes the email for you in your mail app. */
function SupportForm() {
  const [form] = Form.useForm<{ email: string; message: string }>();
  return (
    <div className={s.card}>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={({ email, message }) => {
          const body = `${message}\n\nReply to: ${email}`;
          window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Victual support')}&body=${encodeURIComponent(body)}`;
        }}
      >
        <Form.Item label="Your email" name="email" rules={[{ required: true, message: 'Enter your email.' }, { type: 'email', message: 'Enter a valid email address.' }]}>
          <Input size="large" placeholder="you@example.com" autoComplete="email" />
        </Form.Item>
        <Form.Item label="Message" name="message" rules={[{ required: true, message: 'Tell us how we can help.' }]}>
          <Input.TextArea rows={5} placeholder="How can we help?" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" shape="round" className={s.send}>
          Send message
        </Button>
        <p className={s.note}>
          Opens your email app with your message filled in. Or email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </Form>
    </div>
  );
}

/** Which section is on screen, for the "On this page" highlight. */
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0].id);
  useEffect(() => {
    const els = SECTIONS.map((x) => document.getElementById(x.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return active;
}
