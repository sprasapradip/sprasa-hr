// Step 1: drive the real app and screenshot every state the promo needs.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.join(__dirname, 'shots');
const VIEW = { width: 1640, height: 796 }; // must match .view in render.html

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT);
  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars', '--lang=en-GB', '--force-color-profile=srgb'] });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'Asia/Kathmandu', colorScheme: 'light' });
  const page = await ctx.newPage();
  const shots = {};
  const targets = {};
  const snap = async (name, settle = 350) => {
    await page.waitForTimeout(settle);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    shots[name] = `${name}.png`;
    console.log('shot', name);
  };
  const target = async (name, loc) => {
    targets[name] = await loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height }; });
  };
  const idle = () => page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});

  // Warm-up pass so lazy chunks are compiled before the real pass.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.getByLabel('Email or username').fill('employee');
  await page.locator('input[type=password]').fill('Sprasa@2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'My Leave' }).first().waitFor({ timeout: 120000 });
  await idle();
  await page.goto(`${BASE}/app/me/leave`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Apply for leave' }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(1000);
  await ctx.clearCookies();

  // ---- Real pass ----
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(1, 1);
  await snap('login', 800);
  const user = page.getByLabel('Email or username');
  const pass = page.locator('input[type=password]');
  await target('user', user);
  await target('pass', pass);
  await target('signin', page.getByRole('button', { name: 'Sign in' }));
  await user.focus();
  const u = 'employee';
  for (let i = 1; i <= u.length; i++) { await user.press(u[i - 1]); await snap(`user${i}`, 40); }
  await pass.focus();
  const pw = 'Sprasa@2026';
  for (let i = 1; i <= pw.length; i++) { await pass.press(pw[i - 1]); await snap(`pass${i}`, 40); }

  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'My Leave' }).first().waitFor({ timeout: 120000 });
  await idle();
  await page.mouse.move(1, 1);
  await snap('dash', 1500);
  const myLeave = page.getByRole('link', { name: 'My Leave' }).first();
  await target('myleave', myLeave);

  await myLeave.click();
  await page.getByRole('button', { name: 'Apply for leave' }).first().waitFor();
  await idle();
  await page.mouse.move(1, 1);
  await snap('leave', 1200);
  const apply = page.getByRole('button', { name: 'Apply for leave' }).first();
  await target('apply', apply);

  await apply.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await page.mouse.move(1, 1);
  await snap('dialog', 700);
  await target('dialog', dialog);
  const select = dialog.locator('select');
  await target('select', select);
  await select.selectOption({ label: 'Annual Leave (18 days left)' });
  await snap('select', 600);
  const dates = dialog.locator('input[type=date]');
  await target('from', dates.nth(0));
  await dates.nth(0).fill('2026-11-25');
  await page.evaluate(() => document.activeElement?.blur());
  await snap('from', 300);
  await target('to', dates.nth(1));
  await dates.nth(1).fill('2026-11-27');
  await page.evaluate(() => document.activeElement?.blur());
  await snap('to', 300);
  const reason = dialog.locator('textarea');
  await target('reason', reason);
  await reason.focus();
  const text = 'Family trip to Pokhara';
  let step = 0;
  for (let i = 1; i <= text.length; i++) {
    await reason.press(text[i - 1]);
    if (i % 2 === 0 || i === text.length) await snap(`reason${++step}`, 30);
  }
  const submit = dialog.getByRole('button', { name: 'Submit request' });
  await target('submit', submit);
  await page.evaluate(() => document.activeElement?.blur());

  await submit.click();
  await dialog.waitFor({ state: 'hidden', timeout: 60000 });
  await page.getByText('Leave request submitted').first().waitFor({ timeout: 30000 }).catch(() => console.log('toast not seen'));
  await idle();
  await snap('result', 500);
  const newRow = page.locator('table tbody tr').filter({ hasText: '25 Nov 2026' }).first();
  if (await newRow.count()) await target('newrow', newRow);
  else console.log('new row not found');

  fs.writeFileSync(path.join(__dirname, 'shots.json'), JSON.stringify({ shots, targets, reasonSteps: step }, null, 1));
  console.log(JSON.stringify(targets));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
