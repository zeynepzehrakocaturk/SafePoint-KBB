/**
 * Nominatim (OpenStreetMap) geocode istemcisi.
 * Hız sınırı, önbellek ve giriş doğrulaması ile güvenli proxy sağlar.
 */

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'SafePoint-KBB/1.0 (Kocaeli Afet Konum Uygulamasi; educational project)';
const MIN_REQUEST_INTERVAL_MS = 1100;

/** @type {Map<string, { expiresAt: number, data: unknown }>} */
const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

/** @type {Promise<void>} */
let rateLimitChain = Promise.resolve();
/** @type {number} */
let lastRequestAt = 0;

/**
 * Nominatim kullanım politikasına uygun istek aralığı bekler.
 * @returns {Promise<void>}
 */
async function waitForRateLimit() {
  rateLimitChain = rateLimitChain.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    lastRequestAt = Date.now();
  });

  await rateLimitChain;
}

/**
 * Önbellek anahtarı üretir.
 * @param {string} pathname
 * @param {Record<string, string | number | undefined | null>} params
 * @returns {string}
 */
function buildCacheKey(pathname, params) {
  const normalized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value).trim().toLowerCase()}`)
    .join('&');

  return `${pathname}?${normalized}`;
}

/**
 * Metin girişini güvenli uzunlukta tutar.
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string | undefined}
 */
function sanitizeText(value, maxLength = 120) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!text) return undefined;
  return text.slice(0, maxLength);
}

/**
 * Enlem/boylam değerini doğrular.
 * @param {unknown} value
 * @returns {number | null}
 */
function parseCoordinate(value) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * Nominatim API isteği gönderir.
 * @param {string} pathname
 * @param {Record<string, string | number | undefined | null>} params
 * @returns {Promise<unknown>}
 */
async function fetchNominatim(pathname, params) {
  const cacheKey = buildCacheKey(pathname, params);
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  await waitForRateLimit();

  const url = new URL(`${NOMINATIM_BASE_URL}${pathname}`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'tr');

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value).trim());
    }
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim ${response.status}`);
  }

  const data = await response.json();
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

/**
 * Adres araması yapar.
 * @param {Record<string, unknown>} query
 * @returns {Promise<unknown>}
 */
async function searchAddress(query) {
  const q = sanitizeText(query.q, 180);
  const street = sanitizeText(query.street);
  const suburb = sanitizeText(query.suburb);
  const county = sanitizeText(query.county);
  const city = sanitizeText(query.city) || 'Kocaeli';
  const state = sanitizeText(query.state) || 'Kocaeli';
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit || 5), 10) || 5, 1), 10);

  if (!q && !street && !suburb && !county) {
    throw new Error('Arama parametresi gerekli.');
  }

  return fetchNominatim('/search', {
    limit,
    countrycodes: 'tr',
    q,
    street,
    suburb,
    county,
    city,
    state,
  });
}

/**
 * Koordinattan adres çözümler.
 * @param {Record<string, unknown>} query
 * @returns {Promise<unknown>}
 */
async function reverseAddress(query) {
  const lat = parseCoordinate(query.lat);
  const lng = parseCoordinate(query.lon ?? query.lng);

  if (lat === null || lng === null) {
    throw new Error('Geçerli lat/lon değerleri gerekli.');
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Koordinat aralığı geçersiz.');
  }

  return fetchNominatim('/reverse', { lat, lon: lng });
}

module.exports = {
  searchAddress,
  reverseAddress,
};
