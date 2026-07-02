/**
 * DOM manipülasyonu ve güvenli HTML oluşturma yardımcıları.
 */

/**
 * XSS saldırılarını önlemek için metin içeriğini escape eder.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

/**
 * Üst bilgi çubuğunu (infobar) günceller.
 * @param {string} message - Gösterilecek mesaj
 * @param {'info'|'success'|'warning'|'error'} type - Durum tipi
 */
export function updateInfoBar(message, type = 'info') {
  const bar = document.getElementById('infobar');
  const text = document.getElementById('infobar-text');
  const time = document.getElementById('infobar-time');

  if (!bar || !text) return;

  bar.className = `infobar infobar--${type}`;
  text.textContent = message;

  if (time) {
    time.textContent = new Date().toLocaleTimeString('tr-TR');
  }
}

/**
 * Belirtilen konteynere yükleme animasyonu yerleştirir.
 * @param {string} containerId - Hedef element ID
 * @param {string} message - Yükleme mesajı
 */
export function showLoading(containerId, message = 'Yükleniyor...') {
  const element = document.getElementById(containerId);
  if (!element) return;

  element.innerHTML = `
    <div class="loading-box" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <span>${escapeHtml(message)}</span>
    </div>`;
}

/**
 * Element seçicisi kısayolu.
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
export function $(selector) {
  return document.querySelector(selector);
}
