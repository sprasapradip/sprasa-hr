// Drives the real Sprasa HR app and screenshots every state the videos need.
// Usage: node capture.js leave attendance payroll tour   (any subset)
// Output: shots/<flow>/<name>.png and shots/<flow>/targets.json (element centres in app coordinates)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const VIEW = { width: 1640, height: 796 }; // the browser viewport inside the video frame
const PASSWORD = 'Sprasa@2026';

async function session(browser, flow) {
  const dir = path.join(__dirname, 'shots', flow);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'Asia/Kathmandu', colorScheme: 'light' });
  const page = await ctx.newPage();
  const targets = {};
  const s = {
    page, ctx,
    async snap(name, settle = 350) {
      await page.mouse.move(1, 1);
      // never capture loading skeletons
      await page.waitForFunction(() => !document.querySelector('.animate-pulse'), null, { timeout: 60000 }).catch(() => console.log(`  ! ${name}: skeleton still visible`));
      await page.waitForTimeout(settle);
      await page.screenshot({ path: path.join(dir, `${name}.png`) });
      (targets._urls ??= {})[name] = new URL(page.url()).pathname;
      console.log(`  ${flow}/${name}`);
    },
    async target(name, loc) {
      targets[name] = await loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; });
    },
    idle: () => page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {}),
    async login(user) {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 180000 });
      await page.getByLabel('Email or username').fill(user);
      await page.locator('input[type=password]').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL(/\/app/, { timeout: 120000 });
      await s.idle();
    },
    async logout() { await ctx.clearCookies(); },
    async go(p, settle = 1500) { await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 180000 }).catch(() => {}); await page.waitForTimeout(settle); },
    // visit pages once so lazy chunks are compiled before we take real shots
    async warm(paths) { for (const p of paths) await s.go(p, 800); },
    save() { fs.writeFileSync(path.join(dir, 'targets.json'), JSON.stringify(targets, null, 1)); },
  };
  return s;
}

const flows = {
  // Employee applies for leave
  async leave(b) {
    const s = await session(b, 'leave'); const { page } = s;
    await s.login('employee'); await s.warm(['/app', '/app/me/leave']); await s.logout();
    await s.go('/login', 800);
    await page.evaluate(() => document.activeElement?.blur());
    await s.snap('login', 600);
    const user = page.getByLabel('Email or username'), pass = page.locator('input[type=password]');
    await s.target('user', user); await s.target('pass', pass); await s.target('signin', page.getByRole('button', { name: 'Sign in' }));
    await user.focus();
    for (const [i, ch] of [...'employee'].entries()) { await user.press(ch); await s.snap(`user${i + 1}`, 30); }
    await pass.focus();
    for (const [i, ch] of [...PASSWORD].entries()) { await pass.press(ch); await s.snap(`pass${i + 1}`, 30); }
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: 'My Leave' }).first().waitFor({ timeout: 120000 }); await s.idle();
    await s.snap('dash', 2000);
    await s.target('myleave', page.getByRole('link', { name: 'My Leave' }).first());
    await page.getByRole('link', { name: 'My Leave' }).first().click();
    await page.getByRole('button', { name: 'Apply for leave' }).first().waitFor(); await s.idle();
    await s.snap('leave', 1200);
    await s.target('apply', page.getByRole('button', { name: 'Apply for leave' }).first());
    await page.getByRole('button', { name: 'Apply for leave' }).first().click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await s.snap('dialog', 700);
    await s.target('dialog', dialog);
    await s.target('select', dialog.locator('select'));
    await dialog.locator('select').selectOption({ label: 'Annual Leave (18 days left)' });
    await s.snap('select', 600);
    const dates = dialog.locator('input[type=date]');
    await s.target('from', dates.nth(0)); await dates.nth(0).fill('2026-11-25'); await page.evaluate(() => document.activeElement?.blur()); await s.snap('from', 300);
    await s.target('to', dates.nth(1)); await dates.nth(1).fill('2026-11-27'); await page.evaluate(() => document.activeElement?.blur()); await s.snap('to', 300);
    const reason = dialog.locator('textarea'); await s.target('reason', reason); await reason.focus();
    const text = 'Family trip to Pokhara'; let k = 0;
    for (let i = 1; i <= text.length; i++) { await reason.press(text[i - 1]); if (i % 2 === 0 || i === text.length) await s.snap(`reason${++k}`, 30); }
    await s.target('submit', dialog.getByRole('button', { name: 'Submit request' }));
    await page.evaluate(() => document.activeElement?.blur());
    await dialog.getByRole('button', { name: 'Submit request' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 60000 });
    await page.getByText('Leave request submitted').first().waitFor({ timeout: 30000 }).catch(() => console.log('  ! toast not seen'));
    await s.idle(); await s.snap('result', 500);
    await s.target('newrow', page.locator('table tbody tr').filter({ hasText: '25 Nov 2026' }).first());
    s.save(); await s.ctx.close();
    return { reasonSteps: k };
  },

  // Employee checks in from the browser, HR approves it
  async attendance(b) {
    const e = await session(b, 'attendance'); const ep = e.page;
    await e.login('employee'); await e.warm(['/app/me/attendance', '/app']);
    await e.go('/app', 2500);
    await e.snap('emp_dash', 600);
    const btn = ep.getByRole('button', { name: 'Check in' }).first();
    await e.target('checkin', btn);
    await btn.click();
    await ep.getByText('Checked in').first().waitFor({ timeout: 60000 }).catch(() => console.log('  ! check-in toast not seen'));
    await e.idle(); await e.snap('emp_checked', 400);
    await e.go('/app/me/attendance', 2500);
    await e.snap('emp_attendance', 300);
    // HR side, same shot folder
    await e.logout();
    await e.login('hradmin'); await e.warm(['/app/attendance/approvals', '/app/attendance', '/app']);
    await e.go('/app', 4000);
    await e.snap('hr_dash', 500);
    await e.target('nav_approvals', ep.getByRole('link', { name: /Check-in Approvals/i }).first());
    await e.go('/app/attendance/approvals', 2500);
    await e.snap('hr_approvals', 400);
    const row = ep.locator('tr').filter({ hasText: 'Anish' }).first();
    await e.target('row', row);
    const approve = ep.getByRole('button', { name: /^Approve Anish/ }).first();
    await e.target('approve', approve);
    await approve.click();
    await ep.getByText('Check-in approved').first().waitFor({ timeout: 60000 }).catch(() => console.log('  ! approve toast not seen'));
    await e.idle(); await e.snap('hr_approved', 400);
    await e.target('nav_attendance', ep.getByRole('link', { name: /^Attendance$/ }).first());
    await e.go('/app/attendance', 2500);
    await e.snap('hr_attendance', 400);
    e.save(); await e.ctx.close();
    return {};
  },

  // Payroll: runs -> run -> payslip
  async payroll(b) {
    const s = await session(b, 'payroll'); const { page } = s;
    await s.login('accountant'); await s.warm(['/app/payroll/runs', '/app/payroll/payslips']);
    await s.go('/app/payroll/runs', 2500);
    await s.snap('runs', 400);
    const runRow = page.locator('table tbody tr').filter({ hasText: 'September 2026' }).first();
    await s.target('run_sep', runRow);
    await runRow.click();
    await page.waitForURL(/payroll\/runs\/.+/, { timeout: 60000 }); await s.idle();
    await s.snap('run', 2500);
    await page.mouse.wheel(0, 500); await s.snap('run_scrolled', 900);
    await s.go('/app/payroll/payslips', 2500);
    await s.snap('payslips', 400);
    const ps = page.locator('table tbody tr').first();
    await s.target('payslip_row', ps);
    await ps.click();
    await page.waitForURL(/payslips\/.+/, { timeout: 60000 }).catch(() => console.log('  ! payslip page not opened'));
    await s.idle();
    await s.snap('payslip', 2500);
    s.save(); await s.ctx.close();
    return {};
  },

  // Product tour for YouTube (HR admin)
  async tour(b) {
    const s = await session(b, 'tour'); const { page } = s;
    await s.go('/', 3000);
    await s.snap('home', 600);
    await s.login('hradmin');
    await s.warm(['/app', '/app/employees', '/app/org-chart', '/app/attendance', '/app/leave/requests', '/app/leave/calendar', '/app/payroll/runs', '/app/reports']);
    await s.go('/app', 5000);
    await s.snap('dash', 800);
    await page.mouse.wheel(0, 600); await s.snap('dash_scrolled', 1200);
    await s.go('/app/employees', 2500); await s.snap('employees', 400);
    const search = page.getByPlaceholder(/Name, ID, email/i).first();
    await s.target('emp_search', search);
    await search.focus();
    for (let i = 1; i <= 6; i++) { await search.fill('Sunita'.slice(0, i)); await page.waitForTimeout(150); await s.snap(`emp_q${i}`, 60); }
    await page.locator('table tbody tr').filter({ hasText: 'Sunita' }).first().waitFor({ timeout: 60000 }); await s.snap('emp_q_result', 600);
    const first = page.locator('table tbody tr').first();
    await s.target('emp_row', first);
    await first.click();
    await page.waitForURL(/employees\/[^/]+$/, { timeout: 60000 }).catch(() => {});
    await s.idle(); await s.snap('emp_profile', 2000);
    await s.go('/app/org-chart', 2500); await s.snap('orgchart', 400);
    await s.go('/app/attendance', 2500); await s.snap('attendance', 400);
    await s.go('/app/leave/requests', 2500); await s.snap('leave_requests', 400);
    await s.go('/app/leave/calendar', 2500); await s.snap('leave_calendar', 400);
    await s.go('/app/payroll/runs', 2500); await s.snap('payroll_runs', 400);
    await s.go('/app/reports', 2500); await s.snap('reports', 400);
    s.save(); await s.ctx.close();
    return {};
  },
};

(async () => {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(flows);
  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars', '--lang=en-GB', '--force-color-profile=srgb'] });
  const metaFile = path.join(__dirname, 'shots', 'meta.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  for (const f of wanted) { console.log('flow', f); meta[f] = await flows[f](browser); }
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
