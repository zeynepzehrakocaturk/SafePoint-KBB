/**
 * Toplanma alanı koordinat çözümleme yardımcıları.
 * AFAD verisinde koordinat olmadığında ilçe merkezi + deterministik dağılım kullanılır.
 */

/** Kocaeli ilçe merkez koordinatları */
export const DISTRICT_CENTERS = {
  Başiskele: { lat: 40.645, lng: 29.914 },
  Çayırova: { lat: 40.827, lng: 29.374 },
  Darıca: { lat: 40.779, lng: 29.394 },
  Derince: { lat: 40.756, lng: 29.814 },
  Dilovası: { lat: 40.779, lng: 29.535 },
  Gebze: { lat: 40.802, lng: 29.430 },
  Gölcük: { lat: 40.717, lng: 29.818 },
  İzmit: { lat: 40.765, lng: 29.940 },
  Kandıra: { lat: 41.070, lng: 30.152 },
  Karamürsel: { lat: 40.692, lng: 29.616 },
  Kartepe: { lat: 40.753, lng: 30.023 },
  Körfez: { lat: 40.767, lng: 29.783 },
};

/**
 * Alanın geçerli koordinata sahip olup olmadığını kontrol eder.
 * @param {{ lat?: number | null, lng?: number | null }} area
 * @returns {boolean}
 */
export function hasCoordinates(area) {
  return Number.isFinite(area.lat) && Number.isFinite(area.lng);
}

/**
 * Alan kimliğine göre deterministik küçük konum sapması üretir.
 * Aynı alan her zaman aynı noktaya yerleşir; haritada üst üste binmeyi azaltır.
 * @param {number} id
 * @returns {{ latOffset: number, lngOffset: number }}
 */
function getDeterministicOffset(id) {
  const seed = Number(id) * 9973;
  return {
    latOffset: ((seed % 100) - 50) * 0.00035,
    lngOffset: (((Math.floor(seed / 100)) % 100) - 50) * 0.00045,
  };
}

/**
 * Tek bir toplanma alanı için yaklaşık koordinat üretir.
 * @param {{ id: number, ilce?: string }} area
 * @returns {{ lat: number, lng: number, approximate: true } | null}
 */
export function getApproximateAreaCoordinates(area) {
  const center = DISTRICT_CENTERS[area.ilce];
  if (!center) return null;

  const { latOffset, lngOffset } = getDeterministicOffset(area.id);

  return {
    lat: center.lat + latOffset,
    lng: center.lng + lngOffset,
    approximate: true,
  };
}

/**
 * Koordinatı olmayan alana yaklaşık konum atar (yerinde günceller).
 * @param {object} area
 * @returns {object | null}
 */
export function ensureAreaCoordinates(area) {
  if (hasCoordinates(area)) {
    return area;
  }

  const approximate = getApproximateAreaCoordinates(area);
  if (!approximate) return null;

  area.lat = approximate.lat;
  area.lng = approximate.lng;
  area.coordinatesApproximate = true;
  return area;
}

/**
 * Adres seçimine göre yaklaşık kullanıcı konumu üretir.
 * @param {object[]} areas - Toplanma alanı listesi
 * @param {{ ilce?: string, mahalle?: string }} address
 * @returns {{ lat: number, lng: number, displayName: string, exact: false } | null}
 */
export function getApproximateUserLocation(areas, address) {
  const matchingAreas = areas.filter((area) => {
    const districtMatches = !address.ilce || area.ilce === address.ilce;
    const neighborhoodMatches = !address.mahalle || area.mahalle === address.mahalle;
    return districtMatches && neighborhoodMatches;
  });

  const resolvedAreas = matchingAreas
    .map((area) => ensureAreaCoordinates({ ...area }))
    .filter(Boolean)
    .filter(hasCoordinates);

  if (resolvedAreas.length) {
    const totals = resolvedAreas.reduce(
      (accumulator, area) => {
        accumulator.lat += area.lat;
        accumulator.lng += area.lng;
        return accumulator;
      },
      { lat: 0, lng: 0 }
    );

    return {
      lat: totals.lat / resolvedAreas.length,
      lng: totals.lng / resolvedAreas.length,
      displayName: `${address.ilce || 'Kocaeli'} / ${address.mahalle || 'Konum'} yaklaşık merkezi`,
      exact: false,
    };
  }

  const districtCenter = DISTRICT_CENTERS[address.ilce];
  if (!districtCenter) return null;

  return {
    ...districtCenter,
    displayName: `${address.ilce || 'Kocaeli'} ilçe merkezi (yaklaşık)`,
    exact: false,
  };
}
