import fs from 'fs/promises';
import { chromium } from 'playwright';

const SOURCE_URL =
  'https://kocaeli.afad.gov.tr/kocaeli-ili-gecici-barinma-merkezleri-ve-toplanma-alanlari';
const HIERARCHY_FILE = new URL('../data/kocaeli-location-hierarchy.json', import.meta.url);
const ASSEMBLY_FILE = new URL('../data/acil-toplanma-alanlari.json', import.meta.url);

function clean(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(value) {
  return clean(value)
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1))
    .join(' ');
}

function normalizeDistrict(value) {
  return toTitleCase(
    clean(value)
      .replace(/\s+İLÇESİ\s+TOPLANMA\s+ALANLARI$/i, '')
      .replace(/\s+TOPLANMA\s+ALANLARI$/i, '')
  );
}

function normalizeNeighborhood(value) {
  return toTitleCase(
    clean(value)
      .replace(/\s+Mh\.?$/i, '')
      .replace(/\s+Mah\.?$/i, '')
      .replace(/\s+\.$/, '')
  );
}

function normalizeStreet(value) {
  return clean(value)
    .replace(/^[-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArea(value) {
  const normalized = clean(value).replace(/\./g, '').replace(',', '.');
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('table', { state: 'attached' });

const rows = await page.evaluate(() =>
  Array.from(document.querySelectorAll('table tr')).map((row) =>
    Array.from(row.querySelectorAll('th,td')).map((cell) =>
      cell.textContent.replace(/\s+/g, ' ').trim()
    )
  )
);

await browser.close();

const districtMap = new Map();
const features = [];
let currentDistrict = null;
let nextId = 1;

for (const row of rows) {
  const firstCell = clean(row[0]);

  if (
    /TOPLANMA\s+ALANLARI/i.test(firstCell) &&
    !/DAĞILIMLARI/i.test(firstCell) &&
    row.length === 1
  ) {
    currentDistrict = normalizeDistrict(firstCell);
    if (!districtMap.has(currentDistrict)) {
      districtMap.set(currentDistrict, new Map());
    }
    continue;
  }

  if (!currentDistrict || row.length < 5 || !/^\d+$/.test(firstCell)) {
    continue;
  }

  const name = clean(row[1]);
  const neighborhood = normalizeNeighborhood(row[2]);
  const street = normalizeStreet(row[3]);
  const areaM2 = parseArea(row[4]);

  if (!name || !neighborhood) {
    continue;
  }

  const neighborhoods = districtMap.get(currentDistrict);
  if (!neighborhoods.has(neighborhood)) {
    neighborhoods.set(neighborhood, new Set());
  }
  if (street) {
    neighborhoods.get(neighborhood).add(street);
  }

  features.push({
    type: 'Feature',
    properties: {
      id: nextId,
      afadNo: Number.parseInt(firstCell, 10),
      ad: name,
      il: 'Kocaeli',
      ilce: currentDistrict,
      mahalle: neighborhood,
      adres: street,
      alanM2: areaM2,
      koordinatDurumu: 'AFAD sayfasinda koordinat yok; uygulama adresi canli geocode eder.',
    },
    geometry: null,
  });

  nextId += 1;
}

const districts = [...districtMap.entries()]
  .map(([district, neighborhoods]) => ({
    district,
    neighborhoods: [...neighborhoods.entries()]
      .map(([name, streets]) => ({
        name,
        streets: [...streets].sort((left, right) => left.localeCompare(right, 'tr')),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'tr')),
  }))
  .sort((left, right) => left.district.localeCompare(right.district, 'tr'));

const generatedAt = new Date().toISOString();

await fs.writeFile(
  HIERARCHY_FILE,
  `${JSON.stringify({ source: SOURCE_URL, generatedAt, districts }, null, 2)}\n`,
  'utf8'
);

await fs.writeFile(
  ASSEMBLY_FILE,
  `${JSON.stringify(
    {
      type: 'FeatureCollection',
      source: SOURCE_URL,
      updated: generatedAt,
      note: 'AFAD resmi sayfasinda koordinat bulunmadigi icin geometry null tutulur; uygulama adresleri secim aninda geocode eder.',
      features,
    },
    null,
    2
  )}\n`,
  'utf8'
);

console.log(`Wrote ${features.length} official AFAD assembly areas.`);
console.log(`Wrote ${districts.length} districts to ${HIERARCHY_FILE.pathname}`);
