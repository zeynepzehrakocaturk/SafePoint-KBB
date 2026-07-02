/**
 * Uygulama ekran görüntülerini Playwright ile yakalar.
 * NVI CSBM konum seçimi ve uygulama panellerini gösterir.
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectSampleLocation } from './screenshot-helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'screenshots');
const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

/**
 * Uygulamanın hazır olmasını bekler.
 * @param {import('playwright').Page} page
 */
async function waitForApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector('.leaflet-tile', { timeout: 30_000 });
  await page.waitForTimeout(2000);
}

/**
 * Sokak listesini göstermek için mahalle seçer (konum uygulamaz).
 * @param {import('playwright').Page} page
 */
async function prepareLocationPanel(page) {
  await page.selectOption('#manual-ilce', { label: 'İzmit' });
  await page.waitForTimeout(400);
  await page.selectOption('#manual-mahalle', { label: '28 Haziran' });
  await page.waitForTimeout(800);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'tr-TR',
  });

  const page = await context.newPage();
  await waitForApp(page);
  await prepareLocationPanel(page);

  const locationPanel = page.locator('#panel-location-title').locator('xpath=ancestor::section[1]');
  await locationPanel.screenshot({ path: path.join(OUT_DIR, 'location-panel.png') });

  await selectSampleLocation(page);

  await page.screenshot({
    path: path.join(OUT_DIR, 'dashboard.png'),
    fullPage: false,
  });

  await page.locator('.map-section').screenshot({ path: path.join(OUT_DIR, 'map-view.png') });

  const areasPanel = page.locator('#panel-areas-title').locator('xpath=ancestor::section[1]');
  await areasPanel.screenshot({ path: path.join(OUT_DIR, 'assembly-panel.png') });

  const earthquakePanel = page.locator('#panel-earthquake-title').locator('xpath=ancestor::section[1]');
  await earthquakePanel.screenshot({ path: path.join(OUT_DIR, 'earthquake-panel.png') });

  const eqRow = page.locator('.deprem-table tbody tr').first();
  if (await eqRow.count()) {
    await eqRow.click();
    await page.waitForSelector('#deprem-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(1500);
    await page.locator('.modal__content').screenshot({
      path: path.join(OUT_DIR, 'earthquake-modal.png'),
    });
    await page.locator('#modal-close').click();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.leaflet-tile', { timeout: 30_000 });
  await selectSampleLocation(page);
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT_DIR, 'mobile-view.png'),
    fullPage: true,
  });

  await browser.close();
  console.log('Ekran görüntüleri kaydedildi:', OUT_DIR);
}

main().catch((err) => {
  console.error('Screenshot hatası:', err.message);
  process.exit(1);
});
