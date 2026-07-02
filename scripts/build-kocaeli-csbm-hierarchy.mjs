/**
 * Kocaeli NVI CSBM verisinden ilçe/mahalle/sokak hiyerarşisi üretir.
 * Kaynak: https://github.com/melihozkara/il-ilce-mahalle-sokak-veritabani (NVI/adres.nvi.gov.tr)
 *
 * Kullanım: node scripts/build-kocaeli-csbm-hierarchy.mjs
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'kocaeli-csbm-hierarchy.json');

const NVI_BASE_URL =
  'https://raw.githubusercontent.com/melihozkara/il-ilce-mahalle-sokak-veritabani/master/data/il-41';

/** @type {Record<number, string>} */
const DISTRICT_ID_TO_NAME = {
  2058: 'Başiskele',
  2059: 'Çayırova',
  2060: 'Darıca',
  2030: 'Derince',
  2061: 'Dilovası',
  1338: 'Gebze',
  1355: 'Gölcük',
  2062: 'İzmit',
  1430: 'Kandıra',
  1440: 'Karamürsel',
  2063: 'Kartepe',
  1821: 'Körfez',
};

/**
 * Metni okunabilir başlık biçimine çevirir.
 * @param {string} value
 * @returns {string}
 */
function toTitleCaseTr(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1))
    .join(' ');
}

/**
 * Sokak/cadde adını kullanıcı arayüzü için biçimlendirir.
 * @param {string} name
 * @param {string} [componentName]
 * @returns {string}
 */
function formatStreetName(name, componentName) {
  const raw = String(name || '').trim();
  if (!raw) return '';

  const suffixMatch = String(componentName || '').match(/\(([^)]+)\)/i);
  const suffix = suffixMatch?.[1]?.trim();

  if (/cadde|sokak|bulvar|meydan|yol|küme|site|blok/i.test(raw)) {
    return toTitleCaseTr(raw);
  }

  if (suffix) {
    return `${toTitleCaseTr(raw)} (${suffix})`;
  }

  return toTitleCaseTr(raw);
}

/**
 * JSONL dosyasını satır satır okur.
 * @param {string} url
 * @returns {Promise<object[]>}
 */
async function fetchJsonl(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'SafePoint-KBB/1.0 (Kocaeli CSBM builder)' },
  });

  if (!response.ok) {
    throw new Error(`Veri indirilemedi: ${url} (${response.status})`);
  }

  const text = await response.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

import { buildStreetKey } from './csbm-utils.mjs';

async function main() {
  console.log('[CSBM] NVI verisi indiriliyor...');

  const [districtRows, neighborhoodRows, streetRows] = await Promise.all([
    fetchJsonl(`${NVI_BASE_URL}/ilceler.jsonl`),
    fetchJsonl(`${NVI_BASE_URL}/mahalleler.jsonl`),
    fetchJsonl(`${NVI_BASE_URL}/sokaklar.jsonl`),
  ]);

  /** @type {Map<string, { district: string, districtId: number, neighborhoods: Map<string, { name: string, id: number, streets: Map<string, { name: string, id: number, key: string }> }> }>} */
  const districtMap = new Map();

  for (const [districtId, districtName] of Object.entries(DISTRICT_ID_TO_NAME)) {
    districtMap.set(districtName, {
      district: districtName,
      districtId: Number(districtId),
      neighborhoods: new Map(),
    });
  }

  for (const row of neighborhoodRows) {
    const districtName = DISTRICT_ID_TO_NAME[row.ilce_id];
    if (!districtName) continue;

    const neighborhoodName = toTitleCaseTr(row.adi);
    const districtEntry = districtMap.get(districtName);
    if (!districtEntry.neighborhoods.has(neighborhoodName)) {
      districtEntry.neighborhoods.set(neighborhoodName, {
        name: neighborhoodName,
        id: row.kimlikNo,
        streets: new Map(),
      });
    }
  }

  /** @type {Map<number, object>} */
  const neighborhoodById = new Map(neighborhoodRows.map((row) => [row.kimlikNo, row]));

  for (const row of streetRows) {
    const districtName = DISTRICT_ID_TO_NAME[row.ilce_id];
    if (!districtName) continue;

    const districtEntry = districtMap.get(districtName);
    const neighborhoodRow = neighborhoodById.get(row.mahalle_id);
    if (!neighborhoodRow) continue;

    const neighborhoodName = toTitleCaseTr(neighborhoodRow.adi);
    if (!districtEntry.neighborhoods.has(neighborhoodName)) {
      districtEntry.neighborhoods.set(neighborhoodName, {
        name: neighborhoodName,
        id: row.mahalle_id,
        streets: new Map(),
      });
    }

    const streetName = formatStreetName(row.adi, row.bilesenAdi);
    if (!streetName) continue;

    const neighborhoodEntry = districtEntry.neighborhoods.get(neighborhoodName);
    const key = buildStreetKey(districtName, neighborhoodName, streetName);

    if (!neighborhoodEntry.streets.has(key)) {
      neighborhoodEntry.streets.set(key, {
        name: streetName,
        id: row.kimlikNo,
        key,
      });
    }
  }

  const districts = [...districtMap.values()]
    .map((district) => ({
      district: district.district,
      districtId: district.districtId,
      neighborhoods: [...district.neighborhoods.values()]
        .map((neighborhood) => ({
          name: neighborhood.name,
          id: neighborhood.id,
          streets: [...neighborhood.streets.values()]
            .map((street) => street.name)
            .sort((left, right) => left.localeCompare(right, 'tr')),
          streetIndex: [...neighborhood.streets.values()].reduce((accumulator, street) => {
            accumulator[street.name] = { id: street.id, key: street.key };
            return accumulator;
          }, {}),
        }))
        .filter((neighborhood) => neighborhood.streets.length)
        .sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    }))
    .filter((district) => district.neighborhoods.length)
    .sort((left, right) => left.district.localeCompare(right.district, 'tr'));

  const stats = {
    districts: districts.length,
    neighborhoods: districts.reduce((sum, district) => sum + district.neighborhoods.length, 0),
    streets: districts.reduce(
      (sum, district) =>
        sum + district.neighborhoods.reduce((inner, neighborhood) => inner + neighborhood.streets.length, 0),
      0
    ),
    izmitStreets: districts
      .find((district) => district.district === 'İzmit')
      ?.neighborhoods.reduce((sum, neighborhood) => sum + neighborhood.streets.length, 0) ?? 0,
  };

  const hierarchy = {
    source: 'NVI CSBM — melihozkara/il-ilce-mahalle-sokak-veritabani (adres.nvi.gov.tr türevi)',
    province: 'Kocaeli',
    generatedAt: new Date().toISOString(),
    stats,
    districts,
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(hierarchy, null, 2)}\n`, 'utf8');

  console.log('[CSBM] Hiyerarşi oluşturuldu:', OUTPUT_FILE);
  console.log('[CSBM] İstatistikler:', stats);
}

main().catch((error) => {
  console.error('[CSBM] Hata:', error.message);
  process.exit(1);
});
