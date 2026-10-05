// Step 2: render the promo frame by frame (deterministic 30 fps), independent of machine speed.
// Usage: node render.js            -> all frames into frames/
//        node render.js 1.2 9.8 …  -> preview stills into preview/
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const FPS = 30, DURATION = 20;
const ORIGIN = 'http://promo.local';

(async () => {
  const stills = process.argv.slice(2).map(Number);
  const outDir = path.join(__dirname, stills.length ? 'preview' : 'frames');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir);
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'shots.json'), 'utf8'));

  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/__promo/render.html') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, 'render.html')) });
    const m = u.pathname.match(/^\/__promo\/shots\/([\w-]+\.png)$/);
    if (m) return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.join(__dirname, 'shots', m[1])) });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${ORIGIN}/__promo/render.html`, { waitUntil: 'networkidle' });
  console.log('preloaded', await page.evaluate((d) => window.setup(d), data), 'shots');

  const times = stills.length ? stills : Array.from({ length: FPS * DURATION }, (_, i) => i / FPS);
  const started = Date.now();
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((t) => window.render(t), times[i]);
    const name = stills.length ? `t${times[i].toFixed(2)}.jpg` : `f${String(i).padStart(4, '0')}.jpg`;
    await page.screenshot({ path: path.join(outDir, name), type: 'jpeg', quality: 95 });
    if (i % 60 === 0) console.log(`frame ${i}/${times.length} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
