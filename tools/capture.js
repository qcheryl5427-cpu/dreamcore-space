/**
 * Auto-capture screenshots of key scenes.
 * Usage: node tools/capture.js
 * Requires: npm install (installs playwright)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const ROOT = path.resolve(__dirname, '..');

// Ensure screenshots dir exists
const now = new Date();
const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
const outDir = path.join(ROOT, 'screenshots', ts);
fs.mkdirSync(outDir, { recursive: true });

// Simple static server
const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
  }[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    }
  });
});

async function capture() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install');
    process.exit(1);
  }

  server.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    const shots = [];

    async function shot(name, delay = 0) {
      if (delay) await page.waitForTimeout(delay);
      const fp = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: fp, fullPage: false, timeout: 60000 });
      shots.push(fp);
      console.log(`  Captured: ${name}.png`);
    }

    // 1. Opening scene
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(2000);
    await shot('01-opening', 500);

    // 2. Click enter hint → transition → preparation room
    await page.click('#enterHint');
    await page.waitForTimeout(4500); // wait for transition + breath text
    await shot('02-prep-room', 1000);

    // 3. Hover headphones (guide icon appears)
    // Need to move mouse to headphones area (canvas coords ~ center-left)
    const bbox = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    if (bbox) {
      await page.mouse.move(bbox.x + bbox.width * 0.30, bbox.y + bbox.height * 0.80);
      await page.waitForTimeout(600);
      await shot('03-prep-hover-hp', 200);
    }

    // 4. Click headphones → equip animation (wait > total 2.1s)
    if (bbox) {
      await page.mouse.click(bbox.x + bbox.width * 0.30, bbox.y + bbox.height * 0.80);
      await page.waitForTimeout(900);
      await shot('04a-prep-hp-hand-mid', 100);
      await page.waitForTimeout(2500);
      await shot('04-prep-after-hp', 500);
    }

    // 5. Click VR glasses
    if (bbox) {
      await page.mouse.move(bbox.x + bbox.width * 0.68, bbox.y + bbox.height * 0.80);
      await page.waitForTimeout(300);
      await page.mouse.click(bbox.x + bbox.width * 0.68, bbox.y + bbox.height * 0.80);
      await page.waitForTimeout(900);
      await shot('04b-prep-vr-hand-mid', 100);
      // Wait for monitor boot, then explicitly unlock the archive wall via screen click.
      await page.waitForTimeout(4300);
      await shot('04c-prep-archive-ready', 400);
      await page.mouse.click(bbox.x + bbox.width * 0.50, bbox.y + bbox.height * 0.54);
      await page.waitForTimeout(700);
      await shot('04d-prep-papers-active', 300);
      await page.evaluate(() => { if (typeof enterZone === 'function') enterZone(1); });
      await page.waitForTimeout(3500);
      await shot('05-zone1', 800);
    }

    // 6-9. Zones 2-5 (navigate via evaluate)
    for (let zi = 2; zi <= 5; zi++) {
      await page.evaluate((z) => { if (typeof enterZone === 'function') enterZone(z); }, zi);
      await page.waitForTimeout(3500); // wait for blackout fade in + switch + fade out
      await shot(`0${zi+3}-zone${zi}`, 800);
    }

    // 10. Back to preparation from zone5
    await page.evaluate(() => { if (typeof enterPreparation === 'function') enterPreparation(); });
    await page.waitForTimeout(2000);
    await shot('10-prep-return', 800);

    await browser.close();
    server.close();
    console.log(`\nAll screenshots saved to: ${outDir}\n`);
    shots.forEach(s => console.log('  ' + path.basename(s)));
  });
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
