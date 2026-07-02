/**
 * Uygulama genelinde kullanılan sabit değerler.
 * API adresleri, harita ayarları ve filtre eşikleri burada tanımlanır.
 */
export const CONFIG = {
  /** Kocaeli merkez koordinatları [enlem, boylam] */
  KOCAELI_CENTER: [40.7654, 29.9185],

  /** Dünya yarıçapı (km) — Haversine hesabı için */
  EARTH_RADIUS_KM: 6371,

  /** Kullanıcıya gösterilecek maksimum deprem mesafesi (km) */
  MAX_EARTHQUAKE_DISTANCE_KM: 500,

  /** Deprem verisi yenileme aralığı (ms) */
  REFRESH_INTERVAL_MS: 60_000,

  /** Listelenecek en yakın toplanma alanı sayısı */
  NEAREST_AREA_COUNT: 3,

  /** Tabloda gösterilecek maksimum deprem sayısı */
  MAX_EARTHQUAKE_ROWS: 8,

  /** Haritada gösterilecek maksimum toplanma alanı marker sayısı */
  MAX_MAP_AREA_MARKERS: 25,

  /** Harita başlangıç zoom seviyesi */
  DEFAULT_ZOOM: 11,
  USER_ZOOM: 12,

  /** Dış API adresleri */
  API: {
    KANDILLI: 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live',
    NOMINATIM: '/api/geocode/reverse',
    NOMINATIM_SEARCH: '/api/geocode/search',
    ASSEMBLY_AREAS: '/api/toplanma-alanlari',
    STREET_LOCATION: '/api/street-location',
  },
};
