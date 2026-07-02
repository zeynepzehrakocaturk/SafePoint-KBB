/**
 * Harici API çağrıları.
 * Toplanma alanı, deprem ve coğrafi kodlama servisleri.
 */
import { CONFIG } from '../config/constants.js';

const GEOCODE_TIMEOUT_MS = 8_000;

/**
 * Zaman aşımı ile fetch sarmalayıcısı.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * KBB toplanma alanı GeoJSON verisini sunucudan çeker.
 * @returns {Promise<object[]>}
 */
export async function fetchAssemblyAreas() {
  const response = await fetch(CONFIG.API.ASSEMBLY_AREAS);

  if (!response.ok) {
    throw new Error('Toplanma alanı verisi alınamadı.');
  }

  const data = await response.json();

  return data.features.map((feature) => {
    const coordinates = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;

    return {
      id: feature.properties.id,
      afadNo: feature.properties.afadNo,
      ad: feature.properties.ad,
      il: feature.properties.il || 'Kocaeli',
      ilce: feature.properties.ilce,
      mahalle: feature.properties.mahalle,
      adres: feature.properties.adres,
      alanM2: feature.properties.alanM2,
      lat: Array.isArray(coordinates) ? coordinates[1] : null,
      lng: Array.isArray(coordinates) ? coordinates[0] : null,
      coordinatesResolved: Array.isArray(coordinates),
    };
  });
}

/**
 * Kandilli Rasathanesi canlı deprem verisini çeker.
 * @param {number} limit - Maksimum kayıt sayısı
 * @returns {Promise<object[]>}
 */
export async function fetchEarthquakes(limit = 100) {
  const response = await fetch(`${CONFIG.API.KANDILLI}?limit=${limit}`);

  if (!response.ok) {
    throw new Error('Deprem API yanıt vermedi.');
  }

  const data = await response.json();

  if (!data.status || !Array.isArray(data.result)) {
    throw new Error('Deprem verisi alınamadı.');
  }

  return data.result;
}

/**
 * AFAD tabanlı ilçe/mahalle/cadde seçim hiyerarşisini çeker.
 * @returns {Promise<{ source: string, generatedAt: string, districts: Array<{ district: string, neighborhoods: Array<{ name: string, streets: string[] }> }> }>}
 */
export async function fetchLocationHierarchy() {
  const response = await fetch('/api/location-hierarchy');

  if (!response.ok) {
    throw new Error('Konum hiyerarşisi alınamadı.');
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.districts)) {
    throw new Error('Konum hiyerarşisi geçersiz.');
  }

  return data;
}

/**
 * OpenStreetMap Nominatim ile ters coğrafi kodlama yapar.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string | null>}
 */
export async function reverseGeocode(lat, lng) {
  try {
    const url = `${CONFIG.API.NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=tr`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) return null;

    const data = await response.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

/**
 * NVI CSBM tabanlı sokak koordinatını sunucudan çözümler.
 * @param {{ ilce: string, mahalle: string, caddeSokak: string }} address
 * @returns {Promise<{ lat: number, lng: number, displayName: string, source: string, exact: true, cached?: boolean } | null>}
 */
export async function fetchStreetLocation(address) {
  const url = new URL(CONFIG.API.STREET_LOCATION, window.location.origin);
  url.searchParams.set('ilce', address.ilce || '');
  url.searchParams.set('mahalle', address.mahalle || '');
  url.searchParams.set('cadde', address.caddeSokak || '');

  try {
    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return null;

    return {
      lat: data.lat,
      lng: data.lng,
      displayName: data.displayName,
      source: data.source,
      exact: true,
      cached: Boolean(data.cached),
    };
  } catch {
    return null;
  }
}

/**
 * Adres bileşenlerini koordinata dönüştürür.
 * @param {{ il?: string, ilce?: string, mahalle?: string, caddeSokak?: string }} address
 * @returns {Promise<{ lat: number, lng: number, displayName: string } | null>}
 */
export async function forwardGeocode(address) {
  const parts = [address.caddeSokak, address.mahalle, address.ilce, address.il || 'Kocaeli', 'Türkiye']
    .filter(Boolean)
    .map((value) => String(value).trim());

  if (!parts.length) return null;

  try {
    const structuredUrl = new URL(CONFIG.API.NOMINATIM_SEARCH);
    structuredUrl.searchParams.set('format', 'jsonv2');
    structuredUrl.searchParams.set('limit', '5');
    structuredUrl.searchParams.set('addressdetails', '1');
    structuredUrl.searchParams.set('countrycodes', 'tr');
    structuredUrl.searchParams.set('accept-language', 'tr');
    structuredUrl.searchParams.set('street', address.caddeSokak || '');
    structuredUrl.searchParams.set('suburb', address.mahalle || '');
    structuredUrl.searchParams.set('county', address.ilce || '');
    structuredUrl.searchParams.set('city', address.il || 'Kocaeli');
    structuredUrl.searchParams.set('state', address.il || 'Kocaeli');

    let response = await fetchWithTimeout(structuredUrl.toString());

    if (!response.ok) {
      return null;
    }

    let data = await response.json();

    if (!Array.isArray(data) || !data.length) {
      const query = encodeURIComponent(parts.join(', '));
      const fallbackUrl = `${CONFIG.API.NOMINATIM_SEARCH}?format=jsonv2&limit=5&addressdetails=1&countrycodes=tr&accept-language=tr&q=${query}`;
      response = await fetchWithTimeout(fallbackUrl);

      if (!response.ok) return null;

      data = await response.json();
    }

    if (!Array.isArray(data) || !data.length) return null;

    const normalizedParts = parts.map((value) => value.toLocaleLowerCase('tr-TR'));
    const scored = data
      .map((item) => {
        const displayName = item.display_name || '';
        const haystack = `${displayName} ${JSON.stringify(item.address || {})}`.toLocaleLowerCase('tr-TR');
        const score = normalizedParts.reduce((sum, part) => sum + (haystack.includes(part) ? 1 : 0), 0);
        return { item, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.item;
    if (!best) return null;

    const lat = Number.parseFloat(best.lat);
    const lng = Number.parseFloat(best.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      displayName: best.display_name || parts.join(', '),
    };
  } catch {
    return null;
  }
}
