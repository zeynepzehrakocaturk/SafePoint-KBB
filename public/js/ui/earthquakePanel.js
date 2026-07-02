/**
 * Deprem paneli UI bileşeni.
 * Tablo, özet kartı ve tıklama etkileşimlerini yönetir.
 */
import { escapeHtml } from '../utils/dom.js';
import { formatDistance } from '../utils/geo.js';
import { getMagnitudeClass } from '../utils/date.js';

/**
 * Deprem tablosu HTML'ini oluşturur.
 * @param {object[]} earthquakes
 * @param {string | undefined} nearestId
 * @returns {string}
 */
function buildEarthquakeTable(earthquakes, nearestId) {
  if (!earthquakes.length) {
    return '<div class="alert alert--error">Bugün 500 km yarıçapında deprem kaydı bulunamadı.</div>';
  }

  const rows = earthquakes
    .map((eq) => {
      const location =
        eq.location.length > 30 ? `${eq.location.slice(0, 30)}…` : eq.location;
      const time = eq.dateTime?.split(' ')[1] || '-';

      return `
        <tr class="${eq.id === nearestId ? 'nearest-row' : ''}"
            data-eq-id="${escapeHtml(eq.id)}"
            tabindex="0"
            role="button"
            aria-label="Deprem detayı: ${escapeHtml(eq.location)}">
          <td>${escapeHtml(time)}</td>
          <td>${escapeHtml(location)}</td>
          <td><span class="mag-badge ${getMagnitudeClass(eq.mag)}">${eq.mag}</span></td>
          <td>${eq.depth} km</td>
          <td>${escapeHtml(formatDistance(eq.distance))}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="deprem-table-wrap">
      <table class="deprem-table" aria-label="Bugünkü depremler">
        <thead>
          <tr>
            <th scope="col">Saat</th>
            <th scope="col">Yer</th>
            <th scope="col">Büy.</th>
            <th scope="col">Derinlik</th>
            <th scope="col">Uzaklık</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/**
 * En yakın deprem özet kartını günceller.
 * @param {object | null} nearest
 */
export function renderNearestEarthquakeSummary(nearest) {
  const element = document.getElementById('nearest-earthquake');
  if (!element) return;

  if (!nearest) {
    element.classList.remove('visible');
    element.innerHTML = '';
    return;
  }

  element.classList.add('visible');
  element.innerHTML = `
    <strong>Size en yakın deprem:</strong>
    ${escapeHtml(nearest.location)} —
    Büyüklük: ${nearest.mag} —
    ${escapeHtml(formatDistance(nearest.distance))} uzaklıkta`;
}

/**
 * Deprem tablosunu render eder ve tıklama olaylarını bağlar.
 * @param {object[]} earthquakes
 * @param {string | undefined} nearestId
 * @param {(earthquake: object) => void} onSelect
 */
export function renderEarthquakePanel(earthquakes, nearestId, onSelect) {
  const container = document.getElementById('deprem-listesi');
  if (!container) return;

  container.innerHTML = buildEarthquakeTable(earthquakes, nearestId);

  container.querySelectorAll('.deprem-table tbody tr').forEach((row) => {
    const handleSelect = () => {
      const id = row.dataset.eqId;
      const earthquake = earthquakes.find((eq) => String(eq.id) === String(id));
      if (earthquake) onSelect(earthquake);
    };

    row.addEventListener('click', handleSelect);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSelect();
      }
    });
  });
}
