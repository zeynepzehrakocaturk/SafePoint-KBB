/**
 * Uygulama ana giriş noktası.
 * Veri yükleme, konum seçimi ve bileşenler arası koordinasyonu sağlar.
 */
import { CONFIG } from './config/constants.js';
import { fetchAssemblyAreas, fetchLocationHierarchy, fetchStreetLocation } from './services/api.js';
import {
  loadEarthquakeData,
  getNearestEarthquake,
  startEarthquakeRefresh,
} from './services/earthquakeService.js';
import { sortByDistance } from './utils/geo.js';
import {
  ensureAreaCoordinates,
  hasCoordinates,
} from './utils/areaCoordinates.js';
import { updateInfoBar, showLoading } from './utils/dom.js';
import { renderNearestAreas } from './ui/assemblyPanel.js';
import {
  renderEarthquakePanel,
  renderNearestEarthquakeSummary,
} from './ui/earthquakePanel.js';
import {
  initMap,
  setUserLocation,
  renderAssemblyMarkers,
  renderEarthquakeMarkers,
  focusEarthquake,
  openEarthquakeModal,
} from './map/mapController.js';

/** @type {{ lat: number, lng: number } | null} */
let userPosition = null;

/** @type {object[]} */
let assemblyAreas = [];

/** @type {{ source: string, generatedAt: string, districts: Array<{ district: string, neighborhoods: Array<{ name: string, streets: string[] }> }> }} */
let locationHierarchy = { source: '', generatedAt: '', districts: [] };

/** @type {{ nearestAreaName: string, nearestAreaDistance: string, areaCount: number, earthquakeCount: number } | null} */
let dashboardState = null;

/** @type {number} */
let locationRequestToken = 0;

/** @type {boolean} */
let locationSelectorsBound = false;

/**
 * Metin karşılaştırması için normalize eder.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeSearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Alanın adres/metin eşleşmesini kontrol eder.
 * @param {unknown} value
 * @param {string} needle
 * @returns {boolean}
 */
function areaMatchesNeedle(value, needle) {
  if (!needle) return false;
  return normalizeSearchText(value).includes(normalizeSearchText(needle));
}

/**
 * Kocaeli seçme alanlarını besleyen ilçe verisini döndürür.
 * @returns {Array<{ district: string, neighborhoods: Array<{ name: string, streets: string[] }> }>}
 */
function getDistrictOptions() {
  return locationHierarchy.districts || [];
}

/**
 * Seçili ilçenin mahalle listesini döndürür.
 * @param {string} districtName
 */
function getNeighborhoodOptions(districtName) {
  return getDistrictOptions().find((district) => district.district === districtName)?.neighborhoods || [];
}

/**
 * Seçili mahalle için cadde/sokak listesini döndürür.
 * @param {string} districtName
 * @param {string} neighborhoodName
 */
function getStreetOptions(districtName, neighborhoodName) {
  return getNeighborhoodOptions(districtName).find((neighborhood) => neighborhood.name === neighborhoodName)?.streets || [];
}

/**
 * Toplanma alanlarından temel bir yerleşim hiyerarşisi üretir.
 * Sunucu hiyerarşisi alınamazsa yedek olarak kullanılır.
 * @param {object[]} areas
 */
function buildFallbackLocationHierarchy(areas) {
  const districtMap = new Map();

  areas.forEach((area) => {
    const districtName = area.ilce || 'Bilinmeyen İlçe';
    const neighborhoodName = area.mahalle || 'Bilinmeyen Mahalle';
    const streetName = area.adres || area.ad || 'Bilinmeyen Cadde / Sokak';

    if (!districtMap.has(districtName)) {
      districtMap.set(districtName, new Map());
    }

    const neighborhoods = districtMap.get(districtName);
    if (!neighborhoods.has(neighborhoodName)) {
      neighborhoods.set(neighborhoodName, new Set());
    }

    neighborhoods.get(neighborhoodName).add(streetName);
  });

  return {
    source: 'Yerel toplanma alanı verisi',
    generatedAt: new Date().toISOString(),
    districts: [...districtMap.entries()]
      .map(([district, neighborhoods]) => ({
        district,
        neighborhoods: [...neighborhoods.entries()]
          .map(([name, streets]) => ({
            name,
            streets: [...streets].sort((left, right) => left.localeCompare(right, 'tr')),
          }))
          .sort((left, right) => left.name.localeCompare(right.name, 'tr')),
      }))
      .sort((left, right) => left.district.localeCompare(right.district, 'tr')),
  };
}

/**
 * Bir select elemanını verilen seçeneklerle doldurur.
 * @param {HTMLSelectElement | null} element
 * @param {string} placeholder
 * @param {string[]} options
 * @param {string} [selectedValue]
 */
function populateSelect(element, placeholder, options, selectedValue = '') {
  if (!element) return;

  element.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  placeholderOption.disabled = true;
  placeholderOption.selected = !selectedValue;
  element.appendChild(placeholderOption);

  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option;
    item.textContent = option;
    if (option === selectedValue) item.selected = true;
    element.appendChild(item);
  });
}

/**
 * Bir datalist elemanını verilen seçeneklerle doldurur.
 * @param {HTMLDataListElement | null} element
 * @param {string[]} options
 */
function populateDatalist(element, options) {
  if (!element) return;

  element.innerHTML = '';
  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option;
    element.appendChild(item);
  });
}

/**
 * Sokak seçim sayacını günceller.
 * @param {number} count
 */
function updateStreetCount(count) {
  const counter = document.getElementById('manual-cadde-count');
  if (!counter) return;

  if (!count) {
    counter.textContent = '';
    return;
  }

  counter.textContent = `${count} cadde/sokak listelendi (NVI CSBM)`;
}

/**
 * Konum seçim alanlarını bağlı şekilde yeniler.
 */
function renderLocationSelectors() {
  const manualIlInput = document.getElementById('manual-il');
  const manualIlceSelect = document.getElementById('manual-ilce');
  const manualMahalleSelect = document.getElementById('manual-mahalle');
  const manualCaddeSelect = document.getElementById('manual-cadde');

  if (manualIlInput) {
    manualIlInput.value = 'Kocaeli';
  }

  const districts = getDistrictOptions().map((district) => district.district);
  populateSelect(manualIlceSelect, 'İlçe seçin', districts);
  populateSelect(manualMahalleSelect, 'Mahalle seçin', []);
  populateSelect(manualCaddeSelect, 'Cadde / sokak seçin', []);
  updateStreetCount(0);

  const updateNeighborhoods = () => {
    const districtName = manualIlceSelect?.value || '';
    const neighborhoods = getNeighborhoodOptions(districtName).map((neighborhood) => neighborhood.name);
    populateSelect(manualMahalleSelect, 'Mahalle seçin', neighborhoods);
    populateSelect(manualCaddeSelect, 'Cadde / sokak seçin', []);
    updateStreetCount(0);
  };

  const updateStreets = () => {
    const districtName = manualIlceSelect?.value || '';
    const neighborhoodName = manualMahalleSelect?.value || '';
    const streets = getStreetOptions(districtName, neighborhoodName);
    populateSelect(manualCaddeSelect, 'Cadde / sokak seçin', streets);
    updateStreetCount(streets.length);
  };

  if (!locationSelectorsBound) {
    manualIlceSelect?.addEventListener('change', updateNeighborhoods);
    manualMahalleSelect?.addEventListener('change', updateStreets);
    locationSelectorsBound = true;
  }

  updateNeighborhoods();
}

/**
 * Adres eşleşme skorunu hesaplar — daha yüksek skor daha alakalı alanı temsil eder.
 * @param {object} area
 * @param {object} address
 * @returns {number}
 */
function scoreAreaForAddress(area, address = {}) {
  let score = 0;

  if (address.ilce && normalizeSearchText(area.ilce) === normalizeSearchText(address.ilce)) score += 60;
  if (address.mahalle && normalizeSearchText(area.mahalle) === normalizeSearchText(address.mahalle)) score += 90;
  if (address.caddeSokak && areaMatchesNeedle(area.adres, address.caddeSokak)) score += 120;
  if (address.caddeSokak && areaMatchesNeedle(address.caddeSokak, area.adres)) score += 60;
  if (address.caddeSokak && areaMatchesNeedle(area.ad, address.caddeSokak)) score += 20;

  return score;
}

/**
 * Kullanıcı konumuna göre en yakın toplanma alanlarını hesaplar.
 * Koordinatsız alanlar için yaklaşık konum anında üretilir; canlı geocode zorunlu değildir.
 * @param {number} lat
 * @param {number} lng
 * @param {{ ilce?: string, mahalle?: string, caddeSokak?: string }} [address]
 * @returns {object[]}
 */
function getNearestAreas(lat, lng, address = {}) {
  const rankedCandidates = assemblyAreas
    .map((area) => ({ area, score: scoreAreaForAddress(area, address) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 40)
    .map(({ area }) => area);

  const resolvedCandidates = rankedCandidates
    .map((area) => ensureAreaCoordinates(area))
    .filter(Boolean)
    .filter(hasCoordinates);

  return sortByDistance(resolvedCandidates, lat, lng, (area) => ({
    lat: area.lat,
    lng: area.lng,
  })).slice(0, CONFIG.NEAREST_AREA_COUNT);
}

/**
 * Üstteki özet kartlarını günceller.
 * @param {{ nearestArea?: object | null, nearestEarthquake?: object | null, earthquakeCount?: number, areaCount?: number, locationStatus?: string, locationCoords?: string, locationSource?: string }} state
 */
function updateDashboardState(state = {}) {
  const previousNearestAreaName = dashboardState?.nearestAreaName || 'Hazırlanıyor';
  const previousNearestAreaDistance = dashboardState?.nearestAreaDistance || 'Konum bilgisi bekleniyor';

  dashboardState = {
    nearestAreaName: state.nearestArea
      ? state.nearestArea.ad
      : previousNearestAreaName,
    nearestAreaDistance: state.nearestArea
      ? `${state.nearestArea.distance.toFixed(1)} km uzaklıkta`
      : previousNearestAreaDistance,
    areaCount: state.areaCount ?? dashboardState?.areaCount ?? assemblyAreas.length,
    earthquakeCount: state.earthquakeCount ?? dashboardState?.earthquakeCount ?? 0,
  };

  const nearestAreaName = document.getElementById('stat-nearest-area');
  const nearestAreaSub = document.getElementById('stat-nearest-area-sub');
  const areaCount = document.getElementById('stat-area-count');
  const earthquakeCount = document.getElementById('stat-earthquake-count');
  const userLocationStatus = document.getElementById('user-location-status');
  const userLocationCoords = document.getElementById('user-location-coords');
  const userLocationSource = document.getElementById('user-location-source');

  if (nearestAreaName) nearestAreaName.textContent = dashboardState.nearestAreaName;
  if (nearestAreaSub) nearestAreaSub.textContent = dashboardState.nearestAreaDistance;
  if (areaCount) areaCount.textContent = String(dashboardState.areaCount);
  if (earthquakeCount) earthquakeCount.textContent = String(dashboardState.earthquakeCount);
  if (userLocationStatus) userLocationStatus.textContent = state.locationStatus || 'Konum seçimi bekleniyor';
  if (userLocationCoords) userLocationCoords.textContent = state.locationCoords || '-';
  if (userLocationSource) userLocationSource.textContent = state.locationSource || 'Kocaeli seçimi bekleniyor';
}

/**
 * Adres bilgisini kullanıcıya okunabilir hale getirir.
 * @param {string | null | undefined} addressText
 * @returns {string}
 */
function formatLocationLabel(addressText) {
  return addressText && addressText.trim().length ? addressText : 'Adres bulunamadı';
}

/**
 * Deprem verisini UI ve haritaya yansıtır.
 * @param {object[]} earthquakes
 */
function displayEarthquakeData(earthquakes) {
  const nearest = userPosition
    ? getNearestEarthquake(earthquakes, userPosition.lat, userPosition.lng)
    : null;

  renderEarthquakeMarkers(earthquakes);
  renderNearestEarthquakeSummary(nearest);
  renderEarthquakePanel(earthquakes, nearest?.id, (eq) => {
    focusEarthquake(eq);
    openEarthquakeModal(eq);
  });

  updateDashboardState({ earthquakeCount: earthquakes.length });
}

/**
 * Konum güncellemesini güvenli biçimde işler.
 * @param {number} lat
 * @param {number} lng
 * @param {{ sourceLabel?: string, statusLabel?: string, markerLabel?: string, address?: object }} options
 */
async function handleLocationChange(lat, lng, options = {}) {
  const token = ++locationRequestToken;
  await onLocationReady(lat, lng, options, token);
}

/**
 * Adres formunu koordinata çevirip konumu günceller.
 * NVI CSBM sokak koordinat önbelleği veya canlı geocode kullanır.
 * @param {{ il?: string, ilce?: string, mahalle?: string, caddeSokak?: string }} address
 */
async function handleAddressChange(address) {
  const resolved = await fetchStreetLocation(address);

  if (!resolved) {
    updateInfoBar('Seçilen sokak için koordinat bulunamadı. Lütfen listeden geçerli bir sokak seçin.', 'error');
    return;
  }

  await handleLocationChange(resolved.lat, resolved.lng, {
    sourceLabel: `${address.ilce} / ${address.mahalle} / ${address.caddeSokak}`,
    statusLabel: resolved.cached ? 'Adres doğrulandı (önbellek)' : 'Adres doğrulandı (canlı geocode)',
    markerLabel: 'Seçili konum',
    address,
  });

  updateInfoBar(
    resolved.cached
      ? 'Adres koordinatı CSBM önbelleğinden yüklendi.'
      : 'Adres koordinatı canlı olarak çözümlendi.',
    'success'
  );

  updateDashboardState({
    locationStatus: 'Adres doğrulandı',
    locationCoords: `${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)}`,
    locationSource: formatLocationLabel(resolved.displayName),
  });
}

/**
 * Kullanıcının mevcut konumuna göre verileri yeniler.
 */
async function refreshCurrentView() {
  if (!userPosition) {
    updateInfoBar('Önce ilçe, mahalle ve cadde/sokak seçin.', 'warning');
    return;
  }

  updateInfoBar('Veriler yenileniyor...', 'info');
  await handleLocationChange(userPosition.lat, userPosition.lng, {
    sourceLabel: 'Mevcut konum',
    statusLabel: 'Konum yenilendi',
  });
}

/**
 * Konum hazır olduğunda tüm modülleri günceller.
 * @param {number} lat
 * @param {number} lng
 * @param {{ sourceLabel?: string, statusLabel?: string, markerLabel?: string, address?: object }} [options]
 * @param {number} [token]
 */
async function onLocationReady(lat, lng, options = {}, token = locationRequestToken) {
  userPosition = { lat, lng };
  setUserLocation(lat, lng, options.markerLabel || 'Konumum');
  const locationCoords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  const nearestAreas = getNearestAreas(lat, lng, options.address || {});
  const areasWithCoordinates = assemblyAreas
    .map((area) => ensureAreaCoordinates(area))
    .filter(Boolean)
    .filter(hasCoordinates);
  const areasWithDistance = sortByDistance(areasWithCoordinates, lat, lng, (area) => ({
    lat: area.lat,
    lng: area.lng,
  })).slice(0, CONFIG.MAX_MAP_AREA_MARKERS);

  renderNearestAreas(nearestAreas);
  renderAssemblyMarkers(areasWithDistance, nearestAreas.map((area) => area.id));
  updateDashboardState({
    nearestArea: nearestAreas[0] || null,
    areaCount: assemblyAreas.length,
    locationStatus: options.statusLabel || 'Konum alındı',
    locationCoords,
    locationSource: options.sourceLabel || 'Kocaeli seçimi',
  });

  try {
    const earthquakes = await loadEarthquakeData(lat, lng);

    if (token !== locationRequestToken) return;

    displayEarthquakeData(earthquakes);
    updateInfoBar('Veriler başarıyla güncellendi.', 'success');

    startEarthquakeRefresh(lat, lng, (data) => {
      displayEarthquakeData(data);
      updateInfoBar('Deprem verileri otomatik güncellendi.', 'success');
    });
  } catch {
    if (token !== locationRequestToken) return;

    showLoading('deprem-listesi', 'Deprem verisi yüklenemedi');
    updateInfoBar('Deprem verisi alınamadı.', 'error');
  }
}

/**
 * Uygulamayı başlatır — harita, veri ve konum akışı.
 */
async function bootstrap() {
  initMap();
  updateInfoBar('Toplanma alanı ve konum seçenekleri yükleniyor...', 'info');

  const refreshButton = document.getElementById('refresh-data-btn');
  const manualIlInput = document.getElementById('manual-il');
  const manualIlceInput = document.getElementById('manual-ilce');
  const manualMahalleInput = document.getElementById('manual-mahalle');
  const manualCaddeInput = document.getElementById('manual-cadde');
  const manualLocationButton = document.getElementById('manual-location-btn');

  refreshButton?.addEventListener('click', () => {
    void refreshCurrentView();
  });

  manualLocationButton?.addEventListener('click', async () => {
    const il = manualIlInput?.value?.trim() || 'Kocaeli';
    const ilce = manualIlceInput?.value?.trim() || '';
    const mahalle = manualMahalleInput?.value?.trim() || '';
    const caddeSokak = manualCaddeInput?.value?.trim() || '';

    if (!il || !ilce || !mahalle || !caddeSokak) {
      updateInfoBar('Lütfen ilçe, mahalle ve cadde/sokak seçin.', 'warning');
      return;
    }

    updateInfoBar('Adres çözülüyor...', 'info');
    await handleAddressChange({ il, ilce, mahalle, caddeSokak });
  });

  try {
    const [areas, hierarchyResult] = await Promise.all([
      fetchAssemblyAreas(),
      fetchLocationHierarchy().catch(() => null),
    ]);

    assemblyAreas = areas;
    locationHierarchy = hierarchyResult || buildFallbackLocationHierarchy(assemblyAreas);
    renderLocationSelectors();
    updateDashboardState({ areaCount: assemblyAreas.length });

    showLoading('nearest-areas', 'Konum seçimi bekleniyor');
    updateDashboardState({
      areaCount: assemblyAreas.length,
      locationStatus: 'Konum seçimi bekleniyor',
      locationCoords: '-',
      locationSource: 'Kocaeli seçimi bekleniyor',
    });
    updateInfoBar('NVI CSBM adres listesi yüklendi. İlçe, mahalle ve sokak seçin.', 'info');

    const earthquakes = await loadEarthquakeData(CONFIG.KOCAELI_CENTER[0], CONFIG.KOCAELI_CENTER[1]);
    displayEarthquakeData(earthquakes);
  } catch {
    updateInfoBar(
      'Uygulama başlatılamadı. Sunucunun çalıştığından emin olun.',
      'error'
    );
    showLoading('nearest-areas', 'Veri yüklenemedi');
    showLoading('deprem-listesi', 'Veri yüklenemedi');
    updateDashboardState({ areaCount: 0, earthquakeCount: 0 });
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
