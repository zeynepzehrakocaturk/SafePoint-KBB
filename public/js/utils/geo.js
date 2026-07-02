/**
 * Coğrafi hesaplama yardımcıları.
 * Haversine formülü ile iki nokta arası mesafe hesaplanır.
 */
import { CONFIG } from '../config/constants.js';

/**
 * Dereceyi radyana çevirir.
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * İki coğrafi koordinat arasındaki mesafeyi km cinsinden hesaplar.
 * @param {number} lat1 - Başlangıç enlemi
 * @param {number} lon1 - Başlangıç boylamı
 * @param {number} lat2 - Hedef enlemi
 * @param {number} lon2 - Hedef boylamı
 * @returns {number} Mesafe (km)
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return CONFIG.EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Mesafeyi kullanıcı dostu formata çevirir.
 * @param {number} km
 * @returns {string}
 */
export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Koordinatların geçerliliğini kontrol eder.
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean}
 */
export function validateCoordinates(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * API'den gelen ters koordinatları düzeltir.
 * Doğrulamadan önce enlem/boylam eksen karışıklığı giderilir.
 * @param {number} lat
 * @param {number} lng
 * @returns {{ lat: number, lng: number } | null}
 */
export function fixCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  // Boylam değeri yanlışlıkla enlem alanına yazılmışsa eksenleri değiştir
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    [lat, lng] = [lng, lat];
  }

  if (!validateCoordinates(lat, lng)) return null;
  return { lat, lng };
}

/**
 * Öğeleri kullanıcı konumuna göre mesafeye göre sıralar.
 * @template T
 * @param {T[]} items
 * @param {number} userLat
 * @param {number} userLng
 * @param {(item: T) => { lat: number, lng: number }} getCoords
 * @returns {Array<T & { distance: number }>}
 */
export function sortByDistance(items, userLat, userLng, getCoords) {
  return items
    .map((item) => {
      const { lat, lng } = getCoords(item);
      return {
        ...item,
        distance: haversineDistance(userLat, userLng, lat, lng),
      };
    })
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Google Maps yürüyüş yönlendirme URL'si oluşturur.
 * @param {number} destLat
 * @param {number} destLng
 * @returns {string}
 */
export function googleMapsDirectionsUrl(destLat, destLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=walking`;
}
