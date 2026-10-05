// Renders thumb.html to a 1280x720 YouTube thumbnail.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const out = process.argv[2] || path.join(__dirname, 'out', 'youtube-thumbnail.jpg');
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route('http://promo.local/**', (r) => {
    const p = decodeURIComponent(new URL(r.request().url()).pathname);
    const f = p === '/thumb.html' ? path.join(__dirname, 'thumb.html') : path.join(__dirname, p);
    if (!path.resolve(f).startsWith(__dirname) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ body: fs.readFileSync(f), contentType: { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' }[path.extname(f)] });
  });
  const page = await ctx.newPage();
  await page.goto('http://promo.local/thumb.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: 'jpeg', quality: 92 });
  await b.close();
  console.log('wrote', out);
})();
