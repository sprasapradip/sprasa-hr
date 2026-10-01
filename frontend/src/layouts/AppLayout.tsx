import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, CalendarDays, Check, Home, KeyRound, Languages, LayoutDashboard, LogOut, Menu, Monitor, Moon, Plane, Receipt, Sun, User, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlay';
import { useObjectUrl } from '@/hooks';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { cn, formatDate, todayISO } from '@/lib/utils';
import { setLanguage } from '@/i18n';
import { visibleNav } from './nav';

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/app" className="flex items-center gap-2.5" aria-label="Sprasa HR home">
      <img src="/favicon.svg" alt="" className="size-7" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-fg">Sprasa HR</span>
        </span>
      )}
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { can, user } = useAuth();
  const groups = visibleNav(can, Boolean(user?.employee));
  return (
    <nav aria-label="Main" className="space-y-5 px-3 py-4">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.labelKey && <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t(g.labelKey)}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200' : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
                      {item.icon && <item.icon className="size-4 shrink-0" aria-hidden />}
                      {t(item.labelKey)}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function OrgBadge() {
  const { user, can, switchOrganisation } = useAuth();
  const { data: orgs } = useQuery({ queryKey: ['organisations'], queryFn: () => api.get<{ id: string; name: string }[]>('/organisations'), enabled: can('organisations.manage') });
  if (!user) return null;
  const inner = (
    <span className="flex min-w-0 items-center gap-2">
      <Building2 className="size-4 shrink-0 text-subtle" aria-hidden />
      <span className="truncate text-[13px] font-medium text-fg">{user.organisation.name}</span>
    </span>
  );
  if (!orgs || orgs.length < 2) return <div className="min-w-0 px-1">{inner}</div>;
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button type="button" className="min-w-0 cursor-pointer rounded-md px-1 py-1 hover:bg-surface-2" aria-label="Switch organisation">
          {inner}
        </button>
      </DropdownTrigger>
      <DropdownContent align="start">
        <DropdownLabel>Switch organisation</DropdownLabel>
        {orgs.map((o) => (
          <DropdownItem key={o.id} onSelect={() => switchOrganisation(o.id)}>
            <Check className={cn(o.id === user.organisation.id ? 'opacity-100' : 'opacity-0')} /> {o.name}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const { data } = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'), refetchInterval: 60_000 });
  const unread = data?.unread ?? 0;
  return (
    <Button variant="ghost" size="icon" asChild>
      <Link to="/app/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
        <Bell />
        {unread > 0 && <span className="num absolute right-1 top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
      </Link>
    </Button>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const photo = useObjectUrl(user?.employee ? `/employees/${user.employee.id}/photo` : null);
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button type="button" className="flex cursor-pointer items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-border" aria-label="Account menu">
          <Avatar name={user.name} src={photo} size="sm" />
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-60">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-fg">{user.name}</p>
          <p className="truncate text-xs text-subtle">{user.role.name}</p>
        </div>
        <DropdownSeparator />
        <DropdownItem onSelect={() => navigate('/app/profile')}>
          <User /> My account
        </DropdownItem>
        <DropdownItem onSelect={() => navigate('/app/profile?tab=security')}>
          <KeyRound /> Change password
        </DropdownItem>
        <DropdownSeparator />
        <DropdownLabel>Theme</DropdownLabel>
        {(
          [
            ['light', Sun, 'Light'],
            ['dark', Moon, 'Dark'],
            ['system', Monitor, 'System'],
          ] as const
        ).map(([value, Icon, label]) => (
          <DropdownItem key={value} onSelect={(e) => { e.preventDefault(); setTheme(value); }}>
            <Icon /> {label} {theme === value && <Check className="ml-auto" />}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownLabel>Language</DropdownLabel>
        {(
          [
            ['en', 'English'],
            ['ne', 'नेपाली (beta)'],
          ] as const
        ).map(([code, label]) => (
          <DropdownItem key={code} onSelect={(e) => { e.preventDefault(); setLanguage(code); }}>
            <Languages /> {label} {i18n.language === code && <Check className="ml-auto" />}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem
          danger
          onSelect={async () => {
            await logout();
            navigate('/login');
          }}
        >
          <LogOut /> Sign out
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

/** Bottom navigation on phones: the four places people go most. */
function MobileTabBar({ onMenu }: { onMenu: () => void }) {
  const { can, user } = useAuth();
  const isAdmin = can('employees.view', 'payroll.view', 'reports.view');
  const tabs = [
    isAdmin ? { to: '/app', label: 'Home', icon: LayoutDashboard, end: true } : { to: '/app/me', label: 'Home', icon: Home, end: true },
    user?.employee ? { to: '/app/me/attendance', label: 'Attendance', icon: CalendarDays } : { to: '/app/attendance', label: 'Attendance', icon: CalendarDays },
    user?.employee ? { to: '/app/me/leave', label: 'Leave', icon: Plane } : { to: '/app/leave/requests', label: 'Leave', icon: Plane },
    user?.employee ? { to: '/app/me/payslips', label: 'Payslips', icon: Receipt } : { to: '/app/payroll/runs', label: 'Payroll', icon: Receipt },
  ];
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden" aria-label="Quick navigation" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="grid grid-cols-5">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink to={t.to} end={t.end} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-primary' : 'text-subtle')}>
              <t.icon className="size-5" aria-hidden />
              {t.label}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={onMenu} className="flex w-full cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-subtle">
            <Menu className="size-5" aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-border px-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t border-border px-5 py-3 text-[11px] text-subtle">
          <a href="https://sprasatechnicalsolution.com.np/" target="_blank" rel="noreferrer" className="hover:text-fg">
            Sprasa Technical Solution
          </a>
        </div>
      </aside>

      {/* Mobile / tablet drawer */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl lg:hidden">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Main navigation</DialogPrimitive.Description>
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Logo />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close menu">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="hidden md:inline-flex lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="lg:hidden md:hidden">
            <Logo compact />
          </div>
          <OrgBadge />
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            {user && (
              <span className="hidden items-center gap-2 text-xs text-subtle sm:flex">
                <span className="num">{formatDate(todayISO(user.organisation.timezone), 'long')}</span>
                <span className="num rounded-full border border-border px-2 py-0.5 font-medium text-muted" title="Current fiscal year">
                  FY {user.organisation.fiscalYear}
                </span>
              </span>
            )}
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" key={location.pathname} className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>

      <MobileTabBar onMenu={() => setMobileOpen(true)} />
    </div>
  );
}
