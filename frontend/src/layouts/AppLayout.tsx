import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, CalendarDays, Check, ChevronDown, Home, KeyRound, Languages, LayoutDashboard, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Plane, Receipt, Search, Sun, User, X } from 'lucide-react';
import { useCallback, useState } from 'react';
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
import { CommandPalette, useCommandPaletteShortcut } from './CommandPalette';
import { visibleNav, type NavItem } from './nav';

function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/app" className="flex items-center gap-2.5" aria-label="Sprasa HR home">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 ring-1 ring-inset ring-brand-200 dark:bg-brand-900/60 dark:ring-brand-800">
        <img src="/favicon.svg" alt="" className="size-5" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-fg">Sprasa HR</span>
          <span className="block text-[10.5px] font-medium uppercase tracking-wider text-subtle">HR Management</span>
        </span>
      )}
    </Link>
  );
}

const linkClass = (isActive: boolean, rail?: boolean) =>
  cn(
    'group/link relative flex items-center gap-2.5 rounded-lg text-[13.5px] font-medium transition-colors',
    rail ? 'mx-auto size-10 justify-center' : 'px-2.5 py-[7px]',
    isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200' : 'text-muted hover:bg-surface-2 hover:text-fg',
  );

/** Pending check-ins for HR; shared by the sidebar and the dashboard. */
export function usePendingCheckIns(enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['checkin-approvals-count'],
    queryFn: () => api.get<{ pending: number }>('/attendance/approvals/count'),
    enabled: enabled && can('attendance.approve'),
    refetchInterval: 60_000,
    select: (d) => d.pending,
  });
}

function NavEntry({ item, rail, onNavigate }: { item: NavItem; rail?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { data: pending } = usePendingCheckIns(item.badge === 'checkinApprovals');
  const count = item.badge === 'checkinApprovals' ? (pending ?? 0) : 0;
  const label = t(item.labelKey);
  const link = (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} aria-label={rail || count ? `${label}${count ? `, ${count} pending` : ''}` : undefined} className={({ isActive }) => linkClass(isActive, rail)}>
      {({ isActive }) => (
        <>
          {isActive && !rail && <span className="absolute inset-y-1.5 -left-3 w-[3px] rounded-r-full bg-primary" aria-hidden />}
          {item.icon && <item.icon className={cn('size-[17px] shrink-0', isActive ? 'text-primary' : 'text-subtle group-hover/link:text-fg')} aria-hidden />}
          {!rail && <span className="truncate">{label}</span>}
          {count > 0 &&
            (rail ? (
              <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500 ring-2 ring-sidebar" aria-hidden />
            ) : (
              <span className="num ml-auto rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold leading-5 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200" aria-hidden>
                {count > 99 ? '99+' : count}
              </span>
            ))}
        </>
      )}
    </NavLink>
  );
  if (!rail) return link;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{link}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side="right" sideOffset={10} className="z-50 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-pop dark:bg-slate-100 dark:text-slate-900">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function SidebarNav({ onNavigate, rail }: { onNavigate?: () => void; rail?: boolean }) {
  const { t } = useTranslation();
  const { can, user } = useAuth();
  const location = useLocation();
  const groups = visibleNav(can, Boolean(user?.employee));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(readPref('sprasa-nav-collapsed', '').split(',').filter(Boolean)));
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writePref('sprasa-nav-collapsed', [...next].join(','));
      return next;
    });

  return (
    <nav aria-label="Main" className={cn('py-4', rail ? 'space-y-3 px-2' : 'space-y-4 px-3')}>
      {groups.map((g, gi) => {
        const key = g.labelKey ?? `group-${gi}`;
        const hasActive = g.items.some((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));
        const isOpen = rail || !g.labelKey || hasActive || !collapsed.has(key);
        return (
          <div key={key} className={cn(rail && gi > 0 && 'border-t border-border pt-3')}>
            {g.labelKey && !rail && (
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={isOpen}
                className="mb-1 flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-subtle hover:text-fg"
              >
                {t(g.labelKey)}
                <ChevronDown className={cn('size-3.5 transition-transform', !isOpen && '-rotate-90')} aria-hidden />
              </button>
            )}
            {isOpen && (
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.to}>
                    <NavEntry item={item} rail={rail} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="hidden h-9 w-full max-w-sm cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 text-sm text-subtle transition-colors hover:border-slate-300 hover:bg-surface dark:hover:border-slate-600 md:flex"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-border bg-surface px-1.5 text-[10px] font-medium">Ctrl K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpen} aria-label="Search">
        <Search />
      </Button>
    </>
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [rail, setRail] = useState(() => readPref('sprasa-sidebar', 'full') === 'rail');
  const { user } = useAuth();
  const location = useLocation();
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useCommandPaletteShortcut(openSearch);
  const toggleRail = () =>
    setRail((r) => {
      writePref('sprasa-sidebar', r ? 'full' : 'rail');
      return !r;
    });

  return (
    <TooltipPrimitive.Provider delayDuration={150}>
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>

      {/* Desktop sidebar: full width or icon rail */}
      <aside className={cn('no-print fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-sidebar transition-[width] duration-200 lg:flex', rail ? 'w-[72px]' : 'w-64')}>
        <div className={cn('flex h-16 items-center border-b border-border', rail ? 'justify-center px-2' : 'px-5')}>
          <Logo compact={rail} />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto">
          <SidebarNav rail={rail} />
        </div>
        <div className={cn('flex items-center border-t border-border py-3', rail ? 'justify-center px-2' : 'justify-between px-4')}>
          {!rail && (
            <a href="https://sprasatechnicalsolution.com.np/" target="_blank" rel="noreferrer" className="text-[11px] text-subtle hover:text-fg">
              by Sprasa Technical Solution
            </a>
          )}
          <Button variant="ghost" size="icon-sm" onClick={toggleRail} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand sidebar' : 'Collapse sidebar'}>
            {rail ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
      </aside>

      {/* Mobile / tablet drawer */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-fade-in bg-slate-950/45 backdrop-blur-[2px] lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-pop lg:hidden">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Main navigation</DialogPrimitive.Description>
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <Logo />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close menu">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

      <div className={cn('transition-[padding] duration-200', rail ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon" className="hidden md:inline-flex lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="md:hidden">
            <Logo compact />
          </div>
          <OrgBadge />
          <div className="hidden flex-1 justify-center px-2 md:flex">
            <SearchTrigger onOpen={openSearch} />
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <div className="md:hidden">
              <SearchTrigger onOpen={openSearch} />
            </div>
            {user && (
              <span className="hidden items-center gap-2 text-xs text-subtle xl:flex">
                <span className="num">{formatDate(todayISO(user.organisation.timezone), 'long')}</span>
                <span className="num rounded-full border border-border bg-surface px-2 py-0.5 font-medium text-muted" title="Current fiscal year">
                  FY {user.organisation.fiscalYear}
                </span>
              </span>
            )}
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" key={location.pathname} className="mx-auto w-full max-w-[1400px] animate-fade-in px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:px-8">
          <Outlet />
        </main>
      </div>

      <MobileTabBar onMenu={() => setMobileOpen(true)} />
    </div>
    </TooltipPrimitive.Provider>
  );
}
