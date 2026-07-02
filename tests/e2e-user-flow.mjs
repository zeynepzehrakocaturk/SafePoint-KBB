/**
 * Uçtan uca kullanıcı akışı testi — Playwright ile gerçek tarayıcı simülasyonu.
 * Çalıştırmadan önce: npm start
 */
import { chromium } from 'playwright';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

/** @type {import('playwright').Browser | null} */
let browser = null;

/** @type {import('playwright').Page | null} */
let page = null;

before(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'tr-TR', viewport: { width: 1400, height: 900 } });
  page = await context.newPage();
});

after(async () => {
  await browser?.close();
});

describe('SafePoint KBB kullanıcı akışı', () => {
  it('ana sayfa yüklenmeli ve harita görünmeli', async () => {
    const response = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    assert.equal(response?.status(), 200);

    await page.waitForSelector('.leaflet-tile', { timeout: 30_000 });
    await page.waitForFunction(() => document.getElementById('map-loading')?.classList.contains('hidden'));

    const title = await page.title();
    assert.match(title, /SafePoint KBB/i);
  });

  it('ilçe listesi doldurulmalı', async () => {
    const options = await page.locator('#manual-ilce option').allTextContents();
    assert.ok(options.length > 1, 'İlçe seçenekleri boş olmamalı');
    assert.ok(options.some((text) => text.includes('İzmit') || text.includes('Gebze')));
  });

  it('manuel konum seçimi sonrası yakın alanlar listelenmeli', async () => {
    await page.selectOption('#manual-ilce', { label: 'İzmit' });
    await page.waitForTimeout(300);
    await page.selectOption('#manual-mahalle', { label: '28 Haziran' });
    await page.waitForTimeout(300);
    await page.selectOption('#manual-cadde', { label: 'Alkan (Sokak)' });
    await page.click('#manual-location-btn');

    await page.waitForSelector('.area-card', { timeout: 45_000 });
    const count = await page.locator('.area-card').count();
    assert.ok(count >= 1 && count <= 3, `Yakın alan sayısı 1-3 olmalı, bulunan: ${count}`);
  });

  it('deprem tablosu görüntülenmeli ve modal açılmalı', async () => {
    const tableOrAlert = page.locator('.deprem-table, .alert');
    await tableOrAlert.first().waitFor({ timeout: 30_000 });

    const row = page.locator('.deprem-table tbody tr').first();
    if (await row.count()) {
      await row.click();
      await page.waitForSelector('#deprem-modal:not(.hidden)', { timeout: 5000 });
      const modalTitle = await page.locator('#modal-title').textContent();
      assert.ok(modalTitle && modalTitle.length > 0);
      await page.click('#modal-close');
      await page.waitForFunction(() => document.getElementById('deprem-modal')?.classList.contains('hidden'));
    }
  });

  it('veriyi yenile butonu çalışmalı', async () => {
    await page.click('#refresh-data-btn');
    await page.waitForTimeout(2000);
    const text = await page.locator('#infobar-text').textContent();
    assert.ok(
      text.includes('güncellendi') || text.includes('çözüldü'),
      `Beklenmeyen infobar: ${text}`
    );
  });
});
