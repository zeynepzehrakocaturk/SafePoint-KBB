/**
 * Toplanma alanı koordinat yardımcıları birim testleri.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureAreaCoordinates,
  getApproximateUserLocation,
  hasCoordinates,
} from '../public/js/utils/areaCoordinates.js';

describe('ensureAreaCoordinates', () => {
  it('koordinatsız alan için yaklaşık konum üretmeli', () => {
    const area = { id: 12, ilce: 'İzmit' };
    const resolved = ensureAreaCoordinates(area);

    assert.ok(resolved);
    assert.equal(hasCoordinates(resolved), true);
    assert.equal(resolved.coordinatesApproximate, true);
  });

  it('mevcut koordinatları koruyarak dönmeli', () => {
    const area = { id: 1, ilce: 'İzmit', lat: 40.77, lng: 29.92 };
    const resolved = ensureAreaCoordinates(area);

    assert.deepEqual(resolved, area);
  });
});

describe('getApproximateUserLocation', () => {
  it('eşleşen mahalle alanlarından merkez hesaplamalı', () => {
    const areas = [
      { id: 1, ilce: 'İzmit', mahalle: 'Cumhuriyet' },
      { id: 2, ilce: 'İzmit', mahalle: 'Cumhuriyet' },
    ];

    const location = getApproximateUserLocation(areas, {
      ilce: 'İzmit',
      mahalle: 'Cumhuriyet',
    });

    assert.ok(location);
    assert.equal(location.exact, false);
    assert.ok(Number.isFinite(location.lat));
    assert.ok(Number.isFinite(location.lng));
  });

  it('eşleşme yoksa ilçe merkezine düşmeli', () => {
    const location = getApproximateUserLocation([], { ilce: 'Gebze', mahalle: 'X' });

    assert.ok(location);
    assert.match(location.displayName, /Gebze/i);
  });
});
