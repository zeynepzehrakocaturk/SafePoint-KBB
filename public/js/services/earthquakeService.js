/**
 * Deprem verisi işleme ve yenileme servisi.
 * Kandilli API verisini normalize eder, filtreler ve periyodik günceller.
 */
import { CONFIG } from '../config/constants.js';
import { fetchEarthquakes, reverseGeocode } from './api.js';
import { fixCoordinates, haversineDistance, sortByDistance } from '../utils/geo.js';
import { parseKandilliDate, isToday } from '../utils/date.js';

/** @type {ReturnType<typeof setInterval> | null} */
let refreshTimer = null;

/**
 * Ham API kaydını uygulama modeline dönüştürür.
 * @param {object} raw - Kandilli API ham kaydı
 * @returns {object | null}
 */
export function normalizeEarthquake(raw) {
  const coords = raw.geojson?.coordinates;
  if (!coords || coords.length < 2) return null;

  const fixed = fixCoordinates(coords[1], coords[0]);
  if (!fixed) return null;

  return {
    id: raw.earthquake_id,
    lat: fixed.lat,
    lng: fixed.lng,
    mag: raw.mag || 0,
    depth: raw.depth || 0,
    location: raw.title || 'Bilinmeyen',
    date: parseKandilliDate(raw.date_time),
    dateTime: raw.date_time,
  };
}

/**
 * Eksik lokasyon bilgisini Nominatim ile zenginleştirir.
 * @param {object} earthquake
 * @returns {Promise<object>}
 */
async function enrichLocation(earthquake) {
  const needsEnrichment =
    !earthquake.location ||
    earthquake.location.length < 5 ||
    earthquake.location.includes('DENIZI');

  if (!needsEnrichment) return earthquake;

  const name = await reverseGeocode(earthquake.lat, earthquake.lng);
  if (name) {
    earthquake.location = name.split(',').slice(0, 3).join(', ');
  }

  return earthquake;
}

/**
 * Deprem listesini kullanıcı konumuna göre işler ve filtreler.
 * @param {object[]} rawList
 * @param {number} userLat
 * @param {number} userLng
 * @returns {object[]}
 */
export function processEarthquakes(rawList, userLat, userLng) {
  const todayEarthquakes = rawList
    .map(normalizeEarthquake)
    .filter(Boolean)
    .filter((eq) => isToday(eq.date));

  const withDistance = todayEarthquakes
    .map((eq) => ({
      ...eq,
      distance: haversineDistance(userLat, userLng, eq.lat, eq.lng),
    }))
    .filter((eq) => eq.distance <= CONFIG.MAX_EARTHQUAKE_DISTANCE_KM)
    .sort((a, b) => b.date - a.date);

  return withDistance.slice(0, CONFIG.MAX_EARTHQUAKE_ROWS);
}

/**
 * En yakın depremi bulur.
 * @param {object[]} earthquakes
 * @param {number} userLat
 * @param {number} userLng
 * @returns {object | null}
 */
export function getNearestEarthquake(earthquakes, userLat, userLng) {
  if (!earthquakes.length) return null;

  return sortByDistance(earthquakes, userLat, userLng, (eq) => ({
    lat: eq.lat,
    lng: eq.lng,
  }))[0];
}

/**
 * Deprem verisini çeker, işler ve zenginleştirir.
 * @param {number} userLat
 * @param {number} userLng
 * @returns {Promise<object[]>}
 */
export async function loadEarthquakeData(userLat, userLng) {
  const raw = await fetchEarthquakes();
  const processed = processEarthquakes(raw, userLat, userLng);

  // İlk 3 kayıt için eksik lokasyon bilgisini tamamla
  const enrichmentTasks = processed.slice(0, 3).map(async (eq, index) => {
    processed[index] = await enrichLocation(eq);
  });

  await Promise.all(enrichmentTasks);
  return processed;
}

/**
 * Periyodik deprem verisi yenilemesini başlatır.
 * @param {number} userLat
 * @param {number} userLng
 * @param {(data: object[]) => void} onUpdate - Güncelleme callback'i
 */
export function startEarthquakeRefresh(userLat, userLng, onUpdate) {
  stopEarthquakeRefresh();

  refreshTimer = setInterval(async () => {
    try {
      const data = await loadEarthquakeData(userLat, userLng);
      onUpdate(data);
    } catch {
      // Sessiz yenileme hatası — ana yükleme zaten hata gösterir
    }
  }, CONFIG.REFRESH_INTERVAL_MS);
}

/**
 * Periyodik yenilemeyi durdurur.
 */
export function stopEarthquakeRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
