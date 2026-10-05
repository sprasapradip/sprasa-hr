// Renders a video frame by frame at 30 fps and encodes it with ffmpeg.
// Usage: node render.js <leave|attendance|payroll|tour> [--out <dir>]   -> full video
//        node render.js <video> 1.5 9.2 ...                            -> preview stills only
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { videos } = require('./videos');

const FPS = 30;
const ORIGIN = 'http://promo.local';
const FILES = { leave: 'sprasa-hr-ad-leave', attendance: 'sprasa-hr-ad-attendance', payroll: 'sprasa-hr-ad-payroll', tour: 'sprasa-hr-youtube-product-demo' };

(async () => {
  const args = process.argv.slice(2);
  const name = args.shift();
  const oi = args.indexOf('--out');
  const outDir = oi >= 0 ? args.splice(oi, 2)[1] : path.join(__dirname, 'out');
  const stills = args.map(Number);
  const V = videos[name]();
  const frameDir = path.join(__dirname, stills.length ? 'preview' : 'frames', name);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  console.log(`${name}: ${V.duration}s`);

  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.html': 'text/html' };
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = p === '/engine.html' ? path.join(__dirname, 'engine.html')
      : p.startsWith('/assets/') ? path.join(__dirname, p)
      : p.startsWith('/shots/') ? path.join(__dirname, p) : null;
    if (!file || !fs.existsSync(file) || !path.resolve(file).startsWith(__dirname)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(`${ORIGIN}/engine.html`, { waitUntil: 'load' });
  console.log('preloaded', await page.evaluate((v) => window.setup(v), V), 'screenshots');

  if (stills.length) {
    for (const t of stills) {
      await page.evaluate((x) => window.render(x), t);
      await page.screenshot({ path: path.join(frameDir, `t${t.toFixed(2)}.jpg`), type: 'jpeg', quality: 94 });
    }
    await browser.close();
    return;
  }

  // Full video: frames are piped straight into ffmpeg, so nothing is stored on disk but the MP4.
  fs.mkdirSync(outDir, { recursive: true });
  const mp4 = path.join(outDir, `${FILES[name]}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'animation',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-t', String(V.duration), mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));
  const total = Math.round(V.duration * FPS);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`  frame ${i}/${total} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log('wrote', mp4);
})().catch((e) => { console.error(e); process.exit(1); });
