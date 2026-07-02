/**
 * Kocaeli CSBM sokakları için koordinat çözümleme.
 * 1) OpenStreetMap Overpass toplu sokak merkezleri
 * 2) Nominatim yapılandırılmış arama (önbellekli, hız sınırlı)
 *
 * Kullanım:
 *   node scripts/geocode-kocaeli-streets.mjs
 *   node scripts/geocode-kocaeli-streets.mjs --district=İzmit
 *   node scripts/geocode-kocaeli-streets.mjs --limit=500
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStreetKey } from './csbm-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HIERARCHY_FILE = path.join(ROOT, 'data', 'kocaeli-csbm-hierarchy.json');
const COORDINATES_FILE = path.join(ROOT, 'data', 'kocaeli-street-coordinates.json');
const OSM_INDEX_FILE = path.join(ROOT, 'data', 'kocaeli-osm-street-index.json');

const USER_AGENT = 'SafePoint-KBB/1.0 (Kocaeli CSBM geocoder; educational project)';
const MIN_REQUEST_INTERVAL_MS = 1100;
const KOCAELI_BBOX = '40.67,29.35,41.12,30.35';

/** @type {number} */
let lastNominatimAt = 0;

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const options = {
    district: null,
    limit: Number.POSITIVE_INFINITY,
    skipNominatim: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--district=')) options.district = arg.slice('--district='.length);
    if (arg.startsWith('--limit=')) options.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    if (arg === '--skip-nominatim') options.skipNominatim = true;
  }

  return options;
}

/**
 * Metni karşılaştırma için normalize eder.
 * @param {string} value
 */
function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {Promise<void>}
 */
async function waitForNominatim() {
  const elapsed = Date.now() - lastNominatimAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastNominatimAt = Date.now();
}

/**
 * Overpass ile Kocaeli sokak merkezlerini indirir.
 * @returns {Promise<Array<{ name: string, normalized: string, lat: number, lng: number }>>}
 */
async function fetchOsmStreetIndex() {
  try {
    const cached = JSON.parse(await fs.readFile(OSM_INDEX_FILE, 'utf8'));
    if (Array.isArray(cached) && cached.length) {
      console.log(`[Geocode] OSM önbellek yüklendi: ${cached.length} sokak`);
      return cached;
    }
  } catch {
    // önbellek yok
  }

  console.log('[Geocode] OpenStreetMap Overpass sorgusu başlatılıyor...');

  const query = `
[out:json][timeout:180];
(
  way["highway"]["name"](${KOCAELI_BBOX});
);
out center tags;`;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  const text = await response.text();
  if (!response.ok || text.startsWith('<!')) {
    throw new Error(`Overpass hatası: ${text.slice(0, 180)}`);
  }

  const payload = JSON.parse(text);
  const index = (payload.elements || [])
    .filter((element) => element.center && element.tags?.name)
    .map((element) => ({
      name: element.tags.name,
      normalized: normalize(element.tags.name),
      lat: element.center.lat,
      lng: element.center.lon,
    }));

  await fs.writeFile(OSM_INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`[Geocode] OSM sokak indeksi kaydedildi: ${index.length}`);
  return index;
}

/**
 * OSM indeksinden sokak koordinatı eşleştirir.
 * @param {Array<{ name: string, normalized: string, lat: number, lng: number }>} osmIndex
 * @param {string} street
 * @param {string} neighborhood
 */
function matchFromOsm(osmIndex, street, neighborhood) {
  const streetNorm = normalize(street);
  const neighborhoodNorm = normalize(neighborhood);

  const exact = osmIndex.filter((item) => item.normalized === streetNorm);
  if (exact.length === 1) return exact[0];

  const partial = osmIndex.filter(
    (item) =>
      item.normalized.includes(streetNorm) ||
      streetNorm.includes(item.normalized) ||
      (neighborhoodNorm && item.normalized.includes(neighborhoodNorm.split(' ')[0]))
  );

  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    const scored = partial
      .map((item) => {
        let score = 0;
        if (item.normalized === streetNorm) score += 100;
        if (item.normalized.includes(streetNorm)) score += 40;
        if (streetNorm.includes(item.normalized)) score += 20;
        return { item, score };
      })
      .sort((left, right) => right.score - left.score);

    if (scored[0].score >= 40) return scored[0].item;
  }

  return null;
}

/**
 * Nominatim ile adres çözümler.
 * @param {{ ilce: string, mahalle: string, cadde: string }} address
 */
async function geocodeWithNominatim(address) {
  await waitForNominatim();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'tr');
  url.searchParams.set('accept-language', 'tr');
  url.searchParams.set('street', address.cadde);
  url.searchParams.set('suburb', address.mahalle);
  url.searchParams.set('county', address.ilce);
  url.searchParams.set('city', 'Kocaeli');
  url.searchParams.set('state', 'Kocaeli');

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const best = Array.isArray(data) ? data[0] : null;
  if (!best) return null;

  const lat = Number.parseFloat(best.lat);
  const lng = Number.parseFloat(best.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    displayName: best.display_name,
    source: 'nominatim',
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const hierarchy = JSON.parse(await fs.readFile(HIERARCHY_FILE, 'utf8'));

  /** @type {Record<string, { lat: number, lng: number, source: string, displayName?: string, updatedAt: string }>} */
  let coordinates = {};
  try {
    coordinates = JSON.parse(await fs.readFile(COORDINATES_FILE, 'utf8'));
  } catch {
    coordinates = {};
  }

  const osmIndex = await fetchOsmStreetIndex();
  let processed = 0;
  let matchedOsm = 0;
  let matchedNominatim = 0;
  let skipped = 0;

  for (const district of hierarchy.districts) {
    if (options.district && district.district !== options.district) continue;

    for (const neighborhood of district.neighborhoods) {
      for (const street of neighborhood.streets) {
        if (processed >= options.limit) break;

        const key = buildStreetKey(district.district, neighborhood.name, street);
        if (coordinates[key]?.lat && coordinates[key]?.lng) {
          skipped += 1;
          continue;
        }

        const osmMatch = matchFromOsm(osmIndex, street, neighborhood.name);
        if (osmMatch) {
          coordinates[key] = {
            lat: osmMatch.lat,
            lng: osmMatch.lng,
            source: 'openstreetmap',
            displayName: `${street}, ${neighborhood.name}, ${district.district}, Kocaeli`,
            updatedAt: new Date().toISOString(),
          };
          matchedOsm += 1;
          processed += 1;
          continue;
        }

        if (options.skipNominatim) continue;

        const nominatimMatch = await geocodeWithNominatim({
          ilce: district.district,
          mahalle: neighborhood.name,
          cadde: street,
        });

        if (nominatimMatch) {
          coordinates[key] = {
            lat: nominatimMatch.lat,
            lng: nominatimMatch.lng,
            source: nominatimMatch.source,
            displayName: nominatimMatch.displayName,
            updatedAt: new Date().toISOString(),
          };
          matchedNominatim += 1;
        }

        processed += 1;

        if (processed % 25 === 0) {
          await fs.writeFile(COORDINATES_FILE, `${JSON.stringify(coordinates, null, 2)}\n`, 'utf8');
          console.log(
            `[Geocode] İlerleme: ${processed} işlendi | OSM: ${matchedOsm} | Nominatim: ${matchedNominatim} | Önbellek: ${skipped}`
          );
        }
      }
    }
  }

  await fs.writeFile(COORDINATES_FILE, `${JSON.stringify(coordinates, null, 2)}\n`, 'utf8');

  const totalResolved = Object.keys(coordinates).length;
  console.log('[Geocode] Tamamlandı.');
  console.log({
    processed,
    matchedOsm,
    matchedNominatim,
    skipped,
    totalResolved,
    output: COORDINATES_FILE,
  });
}

main().catch((error) => {
  console.error('[Geocode] Hata:', error.message);
  process.exit(1);
});
