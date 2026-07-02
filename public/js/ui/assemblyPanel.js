/**
 * Toplanma alani paneli UI bileseni.
 * En yakin alanlari kart olarak listeler.
 */
import { escapeHtml } from '../utils/dom.js';
import { formatDistance, googleMapsDirectionsUrl } from '../utils/geo.js';

/**
 * En yakin toplanma alanlarini panelde gosterir.
 * @param {Array<{ id: number, ad: string, ilce: string, mahalle: string, adres?: string, alanM2?: number, distance: number, lat: number | null, lng: number | null }>} areas
 */
export function renderNearestAreas(areas) {
  const container = document.getElementById('nearest-areas');
  if (!container) return;

  if (!areas.length) {
    container.innerHTML = '<div class="alert alert--error">Yakın toplanma alanı bulunamadı.</div>';
    return;
  }

  container.innerHTML = areas
    .map((area, index) => {
      const hasCoordinates = Number.isFinite(area.lat) && Number.isFinite(area.lng);
      const directions = hasCoordinates
        ? `<a href="${googleMapsDirectionsUrl(area.lat, area.lng)}"
             target="_blank"
             rel="noopener noreferrer"
             class="btn btn--primary">
            Yol Tarifi Al
          </a>`
        : '<span class="area-card__note">Koordinat çözümlenemedi</span>';

      return `
      <article class="area-card ${index === 0 ? 'area-card--highlight' : ''}" aria-label="${escapeHtml(area.ad)}">
        <span class="area-rank">${index + 1}. En Yakın</span>
        <h3 class="area-name">${escapeHtml(area.ad)}</h3>
        <p class="area-meta">${escapeHtml(area.ilce)} - ${escapeHtml(area.mahalle)}${area.adres ? ` / ${escapeHtml(area.adres)}` : ''}</p>
        ${area.alanM2 ? `<p class="area-meta">${escapeHtml(String(area.alanM2))} m2 AFAD kayıt alanı</p>` : ''}
        ${area.coordinatesApproximate ? '<p class="area-meta area-meta--approx">Yaklaşık konum (AFAD koordinatsız kayıt)</p>' : ''}
        <p class="area-distance">${escapeHtml(formatDistance(area.distance))} uzaklıkta</p>
        ${directions}
      </article>`;
    })
    .join('');
}
