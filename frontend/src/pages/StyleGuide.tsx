import { Button, Input, Segmented, Space } from 'antd';
import { Logo } from '../brand/Logo';
import { tokens, type TypeVariant } from '../theme/tokens';
import { icons } from '../theme/icons';
import { useTheme, type ThemePreference } from '../theme/themeContext';
import styles from './StyleGuide.module.css';

const typeLabels: Record<TypeVariant, string> = {
  brand: 'Branding - DM Sans 600',
  h1: 'H1 - Poppins 700, 32px',
  h2: 'H2 - Poppins 600, 28px',
  h3: 'H3 - Poppins 500, 20px',
  body: 'Body - Poppins 400, 16px',
  small: 'Small - Poppins 300, 12px',
  caption: 'Caption - Poppins 700, 12px',
  button: 'Button - Poppins 500, 12px, 1.5 tracking, caps',
  input: 'Input - Poppins 400, 12px',
  bodySmall: 'Body Small - Poppins 400, 12px',
  social: 'Social button - Poppins 500, 15px',
  fine: 'Fine print - Poppins 400, 11px',
  display: 'Display - Poppins 600, 140px',
  title: 'Onboarding title - Poppins 400, 32px',
  lead: 'Lead - Poppins 300, 17px',
  option: 'Option - Poppins 400, 16px',
  label: 'Label - Poppins 400, 14px',
  field: 'Field - Poppins 400, 18px',
  buttonLarge: 'Large button - Poppins 500, 14px, 2 tracking, caps',
};

const label = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export default function StyleGuide() {
  const { preference, setPreference, mode } = useTheme();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Logo height={40} />
        <Segmented<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { label: 'Light', value: 'light', icon: <icons.settings.lightMode size={14} /> },
            { label: 'Dark', value: 'dark', icon: <icons.settings.darkMode size={14} /> },
            { label: 'System', value: 'system', icon: <icons.settings.systemMode size={14} /> },
          ]}
        />
      </header>

      <section className={styles.section}>
        <h2>Palette</h2>
        <div className={styles.swatches}>
          {Object.entries(tokens.palette).map(([name, hex]) => (
            <div key={name} className={styles.swatch}>
              <div className={styles.chip} style={{ background: hex }} />
              <p className="type-small">{label(name)}</p>
              <p className="type-caption">{hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Theme roles ({mode})</h2>
        <p className="type-small">Provisional - set from logo usage until the screens confirm them.</p>
        <div className={styles.swatches}>
          {Object.entries(tokens.colors[mode]).map(([role, hex]) => (
            <div key={role} className={styles.swatch}>
              <div className={styles.chip} style={{ background: hex }} />
              <p className="type-small">{label(role)}</p>
              <p className="type-caption">{hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Type</h2>
        {(Object.keys(tokens.typography) as TypeVariant[]).map((v) => (
          <div key={v} className={styles.typeRow}>
            <p className="type-small">{typeLabels[v]}</p>
            <p className={`type-${kebab(v)}`}>Meals planned to your budget</p>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Logo</h2>
        <div className={styles.logoGrid}>
          {(['light', 'dark'] as const).map((surface) =>
            (['color', 'mono'] as const).map((tone) => (
              <div key={surface + tone} className={styles.logoTile} data-surface={surface}>
                <Logo surface={surface} tone={tone} height={36} />
                <Logo surface={surface} tone={tone} variant="mark" height={36} />
                <Logo surface={surface} tone={tone} variant="wordmark" height={28} />
              </div>
            )),
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Icons</h2>
        {Object.entries(icons).map(([group, set]) => (
          <div key={group} className={styles.iconGroup}>
            <h3>{label(group)}</h3>
            <div className={styles.icons}>
              {Object.entries(set).map(([name, IconCmp]) => (
                <div key={name} className={styles.iconCell}>
                  <IconCmp size={24} strokeWidth={1.75} />
                  <span className="type-small">{label(name)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Ant Design components</h2>
        <Space wrap>
          <Button type="primary">Primary</Button>
          <Button>Default</Button>
          <Button type="text">Text</Button>
        </Space>
        <Input prefix={<icons.account.email size={16} />} placeholder="Email" style={{ maxWidth: 320 }} />
      </section>
    </main>
  );
}
