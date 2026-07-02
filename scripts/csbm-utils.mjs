/**
 * CSBM veri işleme yardımcıları.
 */

/**
 * Sokak kaydı için benzersiz anahtar üretir.
 * @param {string} district
 * @param {string} neighborhood
 * @param {string} street
 * @returns {string}
 */
export function buildStreetKey(district, neighborhood, street) {
  return [district, neighborhood, street]
    .map((part) => String(part || '').trim().toLocaleLowerCase('tr-TR'))
    .join('|');
}
