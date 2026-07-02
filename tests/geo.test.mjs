/**
 * Coğrafi hesaplama birim testleri.
 * Haversine formülü ve koordinat doğrulama fonksiyonlarını test eder.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistance,
  formatDistance,
  validateCoordinates,
  fixCoordinates,
} from '../public/js/utils/geo.js';

describe('haversineDistance', () => {
  it('aynı nokta arası mesafe sıfıra yakın olmalı', () => {
    const distance = haversineDistance(40.7654, 29.9185, 40.7654, 29.9185);
    assert.ok(distance < 0.01);
  });

  it('İzmit-Gebze arası mesafe makul aralıkta olmalı', () => {
    // İzmit merkez ~ Gebze merkez
    const distance = haversineDistance(40.7654, 29.9185, 40.8026, 29.4307);
    assert.ok(distance > 30 && distance < 60);
  });
});

describe('formatDistance', () => {
  it('1 km altını metre olarak göstermeli', () => {
    assert.equal(formatDistance(0.5), '500 m');
  });

  it('1 km üstünü km olarak göstermeli', () => {
    assert.equal(formatDistance(3.456), '3.5 km');
  });
});

describe('validateCoordinates', () => {
  it('geçerli koordinatları kabul etmeli', () => {
    assert.equal(validateCoordinates(40.76, 29.91), true);
  });

  it('geçersiz enlemi reddetmeli', () => {
    assert.equal(validateCoordinates(95, 29.91), false);
  });

  it('NaN değerleri reddetmeli', () => {
    assert.equal(validateCoordinates(NaN, 29.91), false);
  });
});

describe('fixCoordinates', () => {
  it('ters eksen koordinatlarını düzeltmeli', () => {
    // Boylam değeri (120) yanlışlıkla enlem alanına yazılmışsa düzeltilmeli
    const fixed = fixCoordinates(120, 40.76);
    assert.deepEqual(fixed, { lat: 40.76, lng: 120 });
  });

  it('geçersiz koordinat için null dönmeli', () => {
    assert.equal(fixCoordinates(200, 300), null);
  });
});
