// Generates truthful screenshots of the running app for public case studies.
// Run in CI with the Playwright package and Chromium available.
import { chromium } from 'playwright';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/images', { recursive: true });
await mkdir('docs', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.locator('.hero').first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: 'public/images/dashboard.png', fullPage: true });
  await copyFile('public/images/dashboard.png','docs/desktop-overview.png');
  for (const [pageId, imgName, docName] of [
    ['leads', 'leads.png', 'desktop-leads.png'],
    ['automations', 'automations.png', 'desktop-automations.png'],
    ['projects', null, 'desktop-projects.png']
  ]) {
    await page.locator(`.nav-item[data-nav="${pageId}"]`).click();
    await page.locator('#main-content .page-heading').first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(250);
    if (imgName) await page.screenshot({ path: `public/images/${imgName}`, fullPage: true });
    await page.screenshot({ path: `docs/${docName}`, fullPage: true });
  }
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await mobile.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await mobile.locator('.hero').first().waitFor({ timeout: 15000 });
  await mobile.screenshot({ path: 'public/images/mobile.png', fullPage: true });
  await copyFile('public/images/mobile.png','docs/mobile-overview.png');
  await mobile.close();
  const thumb = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await thumb.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await thumb.locator('.hero').first().waitFor({ timeout: 15000 });
  await thumb.screenshot({ path: 'public/images/upwork-thumbnail.png' });
  await copyFile('public/images/upwork-thumbnail.png', 'docs/upwork-thumbnail.png');
  await thumb.close();
} finally { await browser.close(); }