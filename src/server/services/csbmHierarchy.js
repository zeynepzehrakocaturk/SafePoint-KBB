/**
 * Kocaeli CSBM (NVI) adres hiyerarşisi servisi.
 * İlçe → mahalle → sokak/cadde tam listesini sunar.
 */
const fs = require('fs/promises');
const path = require('path');
const { CSBM_HIERARCHY_FILE, STREET_COORDINATES_FILE } = require('../config');

/** @type {object | null} */
let cachedHierarchy = null;

/** @type {Record<string, { lat: number, lng: number, source?: string, displayName?: string }> | null} */
let cachedCoordinates = null;

/** @type {Set<string> | null} */
let knownStreetKeys = null;

/** Kocaeli il sınırları (yaklaşık) — geocode sonuç doğrulaması için */
const KOCAELI_BOUNDS = {
  minLat: 40.55,
  maxLat: 41.15,
  minLng: 29.55,
  maxLng: 30.35,
};

/**
 * Sokak anahtarı üretir.
 * @param {string} district
 * @param {string} neighborhood
 * @param {string} street
 * @returns {string}
 */
function buildStreetKey(district, neighborhood, street) {
  return [district, neighborhood, street]
    .map((part) => String(part || '').trim().toLocaleLowerCase('tr-TR'))
    .join('|');
}

/**
 * CSBM hiyerarşisini yükler.
 * @returns {Promise<object>}
 */
async function getCsbmHierarchy() {
  if (cachedHierarchy) return cachedHierarchy;

  const raw = await fs.readFile(CSBM_HIERARCHY_FILE, 'utf8');
  cachedHierarchy = JSON.parse(raw);
  return cachedHierarchy;
}

/**
 * Sokak koordinat önbelleğini yükler.
 * @returns {Promise<Record<string, { lat: number, lng: number, source?: string, displayName?: string }>>}
 */
async function getStreetCoordinates() {
  if (cachedCoordinates) return cachedCoordinates;

  try {
    const raw = await fs.readFile(STREET_COORDINATES_FILE, 'utf8');
    cachedCoordinates = JSON.parse(raw);
  } catch {
    cachedCoordinates = {};
  }

  return cachedCoordinates;
}

/**
 * Önbelleğe yeni koordinat yazar.
 * @param {string} key
 * @param {{ lat: number, lng: number, source?: string, displayName?: string }} value
 */
/**
 * Koordinatın Kocaeli sınırları içinde olup olmadığını kontrol eder.
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean}
 */
function isWithinKocaeliBounds(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KOCAELI_BOUNDS.minLat &&
    lat <= KOCAELI_BOUNDS.maxLat &&
    lng >= KOCAELI_BOUNDS.minLng &&
    lng <= KOCAELI_BOUNDS.maxLng
  );
}

/**
 * CSBM listesinde kayıtlı sokak olup olmadığını doğrular.
 * @param {string} ilce
 * @param {string} mahalle
 * @param {string} cadde
 * @returns {Promise<boolean>}
 */
async function isKnownStreet(ilce, mahalle, cadde) {
  if (!knownStreetKeys) {
    const hierarchy = await getCsbmHierarchy();
    knownStreetKeys = new Set();

    for (const district of hierarchy.districts || []) {
      for (const neighborhood of district.neighborhoods || []) {
        for (const street of neighborhood.streets || []) {
          knownStreetKeys.add(buildStreetKey(district.district, neighborhood.name, street));
        }
      }
    }
  }

  return knownStreetKeys.has(buildStreetKey(ilce, mahalle, cadde));
}

async function persistStreetCoordinate(key, value) {
  if (!isWithinKocaeliBounds(value.lat, value.lng)) {
    throw new Error('Koordinat Kocaeli sınırları dışında.');
  }

  const coordinates = await getStreetCoordinates();
  coordinates[key] = {
    ...value,
    updatedAt: new Date().toISOString(),
  };
  cachedCoordinates = coordinates;

  await fs.writeFile(STREET_COORDINATES_FILE, `${JSON.stringify(coordinates, null, 2)}\n`, 'utf8');
}

/**
 * UI için sadeleştirilmiş hiyerarşi döner (koordinatsız).
 * @returns {Promise<object>}
 */
async function getLocationHierarchy() {
  const hierarchy = await getCsbmHierarchy();

  return {
    source: hierarchy.source,
    province: hierarchy.province,
    generatedAt: hierarchy.generatedAt,
    stats: hierarchy.stats,
    districts: hierarchy.districts.map((district) => ({
      district: district.district,
      neighborhoods: district.neighborhoods.map((neighborhood) => ({
        name: neighborhood.name,
        streets: neighborhood.streets,
      })),
    })),
  };
}

/**
 * Seçilen sokak için kayıtlı koordinatı döner.
 * @param {{ ilce: string, mahalle: string, cadde: string }} address
 * @returns {Promise<{ lat: number, lng: number, source: string, displayName: string } | null>}
 */
async function getStreetCoordinate(address) {
  const key = buildStreetKey(address.ilce, address.mahalle, address.cadde);
  const coordinates = await getStreetCoordinates();
  const hit = coordinates[key];

  if (!hit?.lat || !hit?.lng) return null;

  return {
    lat: hit.lat,
    lng: hit.lng,
    source: hit.source || 'cache',
    displayName: hit.displayName || `${address.cadde}, ${address.mahalle}, ${address.ilce}, Kocaeli`,
  };
}

module.exports = {
  buildStreetKey,
  getCsbmHierarchy,
  getLocationHierarchy,
  getStreetCoordinate,
  persistStreetCoordinate,
  isKnownStreet,
  isWithinKocaeliBounds,
};
