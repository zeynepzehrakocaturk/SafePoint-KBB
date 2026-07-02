/**
 * Örnek bir İzmit mahallesi seçerek konum uygular.
 * @param {import('playwright').Page} page
 */
async function selectSampleLocation(page) {
  await page.selectOption('#manual-ilce', { label: 'İzmit' });
  await page.waitForTimeout(400);
  await page.selectOption('#manual-mahalle', { label: '28 Haziran' });
  await page.waitForTimeout(400);
  await page.selectOption('#manual-cadde', { label: 'Alkan (Sokak)' });
  await page.click('#manual-location-btn');
  await page.waitForSelector('.area-card', { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

export { selectSampleLocation };
