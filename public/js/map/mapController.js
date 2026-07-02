/**
 * Leaflet harita kontrolcüsü.
 * Kullanıcı, toplanma alanı ve deprem marker'larını yönetir.
 */
import { CONFIG } from '../config/constants.js';
import { formatDistance } from '../utils/geo.js';
import { escapeHtml } from '../utils/dom.js';
import { getMagnitudeClass } from '../utils/date.js';

/** @type {L.Map | null} */
let map = null;

/** @type {L.Marker | null} */
let userMarker = null;

/** @type {L.Circle | null} */
let userAccuracyCircle = null;

/** @type {L.LayerGroup | null} */
let areaLayerGroup = null;

/** @type {L.LayerGroup | null} */
let earthquakeLayerGroup = null;

/** @type {L.Map | null} */
let modalMap = null;

/** @type {Map<string, L.Marker>} */
const earthquakeMarkerIndex = new Map();

/**
 * Toplanma alanı marker ikonu oluşturur.
 * @param {boolean} isNearest
 * @returns {L.DivIcon}
 */
function createAreaIcon(isNearest = false) {
  return L.divIcon({
    className: 'area-marker-icon',
    html: `<div class="marker-pin marker-pin--area${isNearest ? '-nearest' : ''}"></div>`,
    iconSize: [isNearest ? 26 : 22, isNearest ? 26 : 22],
    iconAnchor: [isNearest ? 13 : 11, isNearest ? 26 : 22],
  });
}

/** Kullanıcı konumu ikonu */
const userIcon = L.divIcon({
  className: 'user-marker-icon',
  html: '<div class="marker-pin marker-pin--user"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

/**
 * Deprem büyüklüğüne göre dinamik ikon oluşturur.
 * @param {number} magnitude
 * @returns {L.DivIcon}
 */
function createEarthquakeIcon(magnitude) {
  const size = Math.min(28, 14 + magnitude * 3);
  const colorClass = getMagnitudeClass(magnitude);
  const colors = { 'mag-low': '#27ae60', 'mag-mid': '#f39c12', 'mag-high': '#e74c3c' };

  return L.divIcon({
    className: 'eq-marker-icon',
    html: `<div class="marker-pin marker-pin--eq" style="width:${size}px;height:${size}px;background:${colors[colorClass]}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Haritayı başlatır ve OpenStreetMap katmanını ekler.
 * @returns {L.Map}
 */
export function initMap() {
  map = L.map('map', { zoomControl: true }).setView(
    CONFIG.KOCAELI_CENTER,
    CONFIG.DEFAULT_ZOOM
  );

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  areaLayerGroup = L.layerGroup().addTo(map);
  earthquakeLayerGroup = L.layerGroup().addTo(map);

  hideMapLoading();
  bindModalEvents();

  return map;
}

/** Harita yükleme ekranını gizler */
export function hideMapLoading() {
  document.getElementById('map-loading')?.classList.add('hidden');
}

/**
 * Kullanıcı konumunu haritada gösterir.
 * @param {number} lat
 * @param {number} lng
 * @param {string} label
 */
export function setUserLocation(lat, lng, label = 'Konumum') {
  if (!map) return;

  if (userMarker) {
    map.removeLayer(userMarker);
  }

  if (userAccuracyCircle) {
    map.removeLayer(userAccuracyCircle);
  }

  userMarker = L.marker([lat, lng], { icon: userIcon })
    .addTo(map)
    .bindPopup(`<strong>${escapeHtml(label)}</strong><br>Güncel kullanıcı konumu`);

  userAccuracyCircle = L.circle([lat, lng], {
    radius: 250,
    color: '#0e5aa7',
    weight: 2,
    fillColor: '#0e5aa7',
    fillOpacity: 0.12,
  }).addTo(map);

  map.setView([lat, lng], CONFIG.USER_ZOOM);
}

/**
 * Toplanma alanı marker'larını haritaya yerleştirir.
 * @param {object[]} areas
 * @param {number[]} nearestIds - Vurgulanacak alan ID'leri
 */
export function renderAssemblyMarkers(areas, nearestIds = []) {
  if (!map || !areaLayerGroup) return;

  areaLayerGroup.clearLayers();

  areas.forEach((area) => {
    if (!Number.isFinite(area.lat) || !Number.isFinite(area.lng)) return;

    const isNearest = nearestIds.some((id) => String(id) === String(area.id));
    const distanceText =
      area.distance !== undefined ? `<em>${formatDistance(area.distance)}</em>` : '';

    L.marker([area.lat, area.lng], { icon: createAreaIcon(isNearest) })
      .bindPopup(`
        <strong>${escapeHtml(area.ad)}</strong><br>
        ${escapeHtml(area.ilce)} / ${escapeHtml(area.mahalle)}<br>
        ${area.adres ? `${escapeHtml(area.adres)}<br>` : ''}
        ${distanceText}`)
      .addTo(areaLayerGroup);
  });
}

/**
 * Deprem marker'larını haritaya yerleştirir.
 * @param {object[]} earthquakes
 */
export function renderEarthquakeMarkers(earthquakes) {
  if (!map || !earthquakeLayerGroup) return;

  earthquakeLayerGroup.clearLayers();
  earthquakeMarkerIndex.clear();

  earthquakes.forEach((eq) => {
    const marker = L.marker([eq.lat, eq.lng], { icon: createEarthquakeIcon(eq.mag) })
      .bindPopup(`
        <strong>${escapeHtml(eq.location)}</strong><br>
        Büyüklük: ${eq.mag}<br>
        Derinlik: ${eq.depth} km<br>
        ${escapeHtml(eq.dateTime)}`)
      .addTo(earthquakeLayerGroup);

    earthquakeMarkerIndex.set(String(eq.id), marker);
  });
}

/**
 * Haritada belirli bir depreme odaklanır.
 * @param {object} earthquake
 */
export function focusEarthquake(earthquake) {
  if (!map || !earthquake) return;

  const marker = earthquakeMarkerIndex.get(String(earthquake.id));
  if (marker) {
    map.setView([earthquake.lat, earthquake.lng], 8);
    marker.openPopup();
  }
}

/**
 * Deprem detay modal penceresini açar.
 * @param {object} earthquake
 */
export function openEarthquakeModal(earthquake) {
  const modal = document.getElementById('deprem-modal');
  const title = document.getElementById('modal-title');
  const info = document.getElementById('modal-info');

  if (!modal || !title || !info) return;

  title.textContent = earthquake.location;
  info.innerHTML = `
    <p><strong>Tarih:</strong> ${escapeHtml(earthquake.dateTime)}</p>
    <p><strong>Büyüklük:</strong> ${earthquake.mag}</p>
    <p><strong>Derinlik:</strong> ${earthquake.depth} km</p>
    ${
      earthquake.distance !== undefined
        ? `<p><strong>Uzaklık:</strong> ${escapeHtml(formatDistance(earthquake.distance))}</p>`
        : ''
    }`;

  modal.classList.remove('hidden');

  // Modal içi harita — DOM render sonrası başlatılır
  requestAnimationFrame(() => {
    if (modalMap) modalMap.remove();

    modalMap = L.map('deprem-map').setView([earthquake.lat, earthquake.lng], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(modalMap);

    L.marker([earthquake.lat, earthquake.lng], {
      icon: createEarthquakeIcon(earthquake.mag),
    }).addTo(modalMap);
  });
}

/** Deprem detay modalını kapatır */
export function closeEarthquakeModal() {
  document.getElementById('deprem-modal')?.classList.add('hidden');

  if (modalMap) {
    modalMap.remove();
    modalMap = null;
  }
}

/** Modal kapatma olaylarını bağlar */
function bindModalEvents() {
  document.getElementById('modal-close')?.addEventListener('click', closeEarthquakeModal);

  document.getElementById('deprem-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'deprem-modal') closeEarthquakeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeEarthquakeModal();
  });
}
