import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Play, Smartphone, X } from 'lucide-react';
import { Logo } from '../../brand/Logo';
import { STORE_LINKS } from '../../content/site';
import s from './Site.module.css';

type NavLink = { label: string; to: string };

const YEAR = new Date().getFullYear();

export function SitePage({ children, nav }: { children: ReactNode; nav?: NavLink[] }) {
  return (
    <div className={s.page}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <SiteHeader nav={nav ?? []} />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader({ nav }: { nav: NavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <header className={s.header}>
      <nav aria-label="Main" className={`${s.wrap} ${s.nav}`}>
        <Link to="/" className={s.brand} aria-label="Victual home">
          <Logo surface="light" height={34} />
        </Link>
        <div className={s.links}>
          {nav.map((l) => (
            <a key={l.to} href={l.to}>
              {l.label}
            </a>
          ))}
          <a href="/#download" className={s.cta}>
            Get the app
          </a>
        </div>
        <button type="button" className={s.menuButton} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>
      {open && (
        <div id="site-menu" className={s.menu}>
          {nav.map((l) => (
            <a key={l.to} href={l.to} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <a href="/#download" className={s.cta} onClick={() => setOpen(false)}>
            Get the app
          </a>
        </div>
      )}
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={`${s.wrap} ${s.footerRow}`}>
        <Link to="/" aria-label="Victual home" style={{ display: 'flex' }}>
          <Logo surface="light" height={24} />
        </Link>
        <div className={s.footerLinks}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/support">Support</Link>
        </div>
        <span className={s.muted}>© {YEAR} Victual</span>
      </div>
    </footer>
  );
}

/** App Store / Google Play buttons. Shows "Coming soon" until the links in content/site.ts are set. */
export function StoreButtons({ light }: { light?: boolean }) {
  const stores = [
    { key: 'appStore', small: 'Download on the', big: 'App Store', Icon: Smartphone, href: STORE_LINKS.appStore },
    { key: 'googlePlay', small: 'Get it on', big: 'Google Play', Icon: Play, href: STORE_LINKS.googlePlay },
  ];
  return (
    <div className={s.stores}>
      {stores.map(({ key, small, big, Icon, href }) => (
        <a
          key={key}
          href={href ?? undefined}
          aria-disabled={!href}
          aria-label={href ? `${small} ${big}` : `${big}: coming soon`}
          className={`${s.store} ${light ? s.light : ''}`}
          onClick={(e) => !href && e.preventDefault()}
        >
          <Icon size={24} aria-hidden="true" />
          <span className={s.storeText}>
            <span className={s.storeSmall}>{href ? small : 'Coming soon to'}</span>
            <span className={s.storeBig}>{big}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

/** Phone frame around a real app screenshot (public/screens/*.webp). */
export function Phone({ src, alt, width, height, className }: { src: string; alt: string; width: number; height: number; className?: string }) {
  return (
    <div className={`${s.phone} ${className ?? ''}`} style={{ width, height }}>
      <img src={src} alt={alt} loading="lazy" width={width - 24} height={height - 24} />
    </div>
  );
}
