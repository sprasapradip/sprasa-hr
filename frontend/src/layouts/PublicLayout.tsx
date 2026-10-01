import { Menu, Phone, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const links = [
  { to: '/#features', label: 'Features' },
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

export const CONTACT_PHONE = '+977 9843944252 / 53';
export const CONTACT_TEL = '+9779843944252';

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Sprasa HR home">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="text-base font-semibold text-fg">Sprasa HR</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
            {links.map((l) => (
              <a key={l.to} href={l.to} className="text-sm text-muted hover:text-fg">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Button variant="ghost" asChild>
              <Link to={user ? '/app' : '/login'}>{user ? 'Open app' : 'Sign in'}</Link>
            </Button>
            <Button asChild>
              <Link to="/consultancy">Request a consultation</Link>
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            {open ? <X /> : <Menu />}
          </Button>
        </div>
        {open && (
          <nav className="border-t border-border px-4 py-3 md:hidden" aria-label="Mobile">
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.to}>
                  <a href={l.to} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2 text-sm text-fg hover:bg-surface-2">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" asChild>
                <Link to={user ? '/app' : '/login'}>{user ? 'Open app' : 'Sign in'}</Link>
              </Button>
              <Button asChild>
                <Link to="/consultancy">Consultation</Link>
              </Button>
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1" key={pathname}>
        <Outlet />
      </main>

      <footer className="border-t border-border bg-bg">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
          <div>
            <p className="flex items-center gap-2 font-semibold text-fg">
              <img src="/favicon.svg" alt="" className="size-6" /> Sprasa HR
            </p>
            <p className="mt-2 max-w-xs text-sm text-subtle">HR and payroll software for Nepali organisations, made by Sprasa Technical Solution.</p>
          </div>
          <div className="text-sm">
            <p className="font-medium text-fg">Talk to us</p>
            <a href={`tel:${CONTACT_TEL}`} className="mt-2 flex items-center gap-2 text-muted hover:text-fg">
              <Phone className="size-4" aria-hidden /> <span className="num">{CONTACT_PHONE}</span>
            </a>
            <a href="https://sprasatechnicalsolution.com.np/" target="_blank" rel="noreferrer" className="mt-1 block text-muted hover:text-fg">
              sprasatechnicalsolution.com.np
            </a>
          </div>
          <div className="text-sm">
            <p className="font-medium text-fg">Pages</p>
            <ul className="mt-2 space-y-1">
              {[
                ['/consultancy', 'Request a consultation'],
                ['/contact', 'Contact'],
                ['/login', 'Sign in'],
              ].map(([to, label]) => (
                <li key={to}>
                  <NavLink to={to} className={({ isActive }) => cn('text-muted hover:text-fg', isActive && 'text-fg')}>
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="border-t border-border py-4 text-center text-xs text-subtle">© {new Date().getFullYear()} Sprasa Technical Solution</p>
      </footer>
    </div>
  );
}
