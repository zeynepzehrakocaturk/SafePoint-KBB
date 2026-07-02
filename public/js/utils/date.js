/**
 * Tarih ve saat işleme yardımcıları.
 */

/**
 * Kandilli API tarih formatını Date nesnesine çevirir.
 * Örnek format: "2026.06.26 16:33:22"
 * @param {string} dateStr
 * @returns {Date | null}
 */
export function parseKandilliDate(dateStr) {
  if (!dateStr) return null;

  const normalized = dateStr.replace(/\./g, '-').replace(' ', 'T');
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Verilen tarihin bugüne ait olup olmadığını kontrol eder.
 * @param {Date | null} date
 * @returns {boolean}
 */
export function isToday(date) {
  if (!date) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Deprem büyüklüğüne göre CSS sınıfı döner.
 * @param {number} magnitude
 * @returns {string}
 */
export function getMagnitudeClass(magnitude) {
  if (magnitude >= 4) return 'mag-high';
  if (magnitude >= 2.5) return 'mag-mid';
  return 'mag-low';
}
