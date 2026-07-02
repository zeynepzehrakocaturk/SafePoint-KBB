/**
 * REST API route tanımları.
 * Toplanma alanı verisi, CSBM hiyerarşisi, sokak koordinatı ve geocode proxy endpoint'leri.
 */
const express = require('express');
const fs = require('fs');
const { ASSEMBLY_AREAS_FILE } = require('../config');
const {
  getLocationHierarchy,
  getStreetCoordinate,
  persistStreetCoordinate,
  buildStreetKey,
  isKnownStreet,
  isWithinKocaeliBounds,
} = require('../services/csbmHierarchy');
const { searchAddress, reverseAddress } = require('../services/nominatim');

const router = express.Router();

/**
 * GET /api/health
 * Sunucunun ayakta olduğunu doğrular.
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SafePoint-KBB',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/toplanma-alanlari
 * GeoJSON formatında acil toplanma alanı verisini döner.
 */
router.get('/toplanma-alanlari', (_req, res) => {
  try {
    const raw = fs.readFileSync(ASSEMBLY_AREAS_FILE, 'utf8');
    const data = JSON.parse(raw);

    if (!data.features || !Array.isArray(data.features)) {
      return res.status(500).json({ error: 'Veri formatı geçersiz.' });
    }

    res.json(data);
  } catch (error) {
    console.error('[API] Toplanma alanı okuma hatası:', error.message);
    res.status(500).json({ error: 'Toplanma alanı verisi okunamadı.' });
  }
});

/**
 * GET /api/location-hierarchy
 * NVI tabanlı Kocaeli ilçe/mahalle/sokak (CSBM) hiyerarşisini döner.
 */
router.get('/location-hierarchy', async (_req, res) => {
  try {
    const hierarchy = await getLocationHierarchy();
    res.json(hierarchy);
  } catch (error) {
    console.error('[API] Konum hiyerarşisi hazırlama hatası:', error.message);
    res.status(500).json({ error: 'Konum seçim verisi hazırlanamadı.' });
  }
});

/**
 * GET /api/street-location
 * Seçilen sokak için kayıtlı koordinatı döner; yoksa Nominatim ile çözümler ve önbelleğe yazar.
 */
router.get('/street-location', async (req, res) => {
  try {
    const ilce = String(req.query.ilce || '').trim();
    const mahalle = String(req.query.mahalle || '').trim();
    const cadde = String(req.query.cadde || req.query.street || '').trim();

    if (!ilce || !mahalle || !cadde) {
      return res.status(400).json({ error: 'ilce, mahalle ve cadde parametreleri zorunludur.' });
    }

    if (!(await isKnownStreet(ilce, mahalle, cadde))) {
      return res.status(400).json({ error: 'Seçilen adres CSBM listesinde bulunamadı.' });
    }

    const cached = await getStreetCoordinate({ ilce, mahalle, cadde });
    if (cached) {
      return res.json({ ...cached, exact: true, cached: true });
    }

    const nominatimResults = await searchAddress({
      street: cadde,
      suburb: mahalle,
      county: ilce,
      city: 'Kocaeli',
      state: 'Kocaeli',
      limit: 1,
    });

    const best = Array.isArray(nominatimResults) ? nominatimResults[0] : null;
    if (!best) {
      return res.status(404).json({ error: 'Seçilen sokak için koordinat bulunamadı.' });
    }

    const lat = Number.parseFloat(best.lat);
    const lng = Number.parseFloat(best.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(502).json({ error: 'Geocode sonucu geçersiz.' });
    }

    if (!isWithinKocaeliBounds(lat, lng)) {
      return res.status(404).json({ error: 'Seçilen sokak için Kocaeli içinde koordinat bulunamadı.' });
    }

    const resolved = {
      lat,
      lng,
      source: 'nominatim',
      displayName: best.display_name || `${cadde}, ${mahalle}, ${ilce}, Kocaeli`,
      exact: true,
      cached: false,
    };

    await persistStreetCoordinate(buildStreetKey(ilce, mahalle, cadde), resolved);

    res.json(resolved);
  } catch (error) {
    console.error('[API] Sokak konumu hatası:', error.message);
    res.status(502).json({ error: 'Sokak koordinatı çözümlenemedi.' });
  }
});

/**
 * GET /api/geocode/search
 * Nominatim adres araması proxy'si (hız sınırlı + önbellekli).
 */
router.get('/geocode/search', async (req, res) => {
  try {
    const data = await searchAddress(req.query);
    res.json(data);
  } catch (error) {
    const status = /gerekli|geçersiz|Geçerli/i.test(error.message) ? 400 : 502;
    console.error('[API] Geocode arama hatası:', error.message);
    res.status(status).json({ error: 'Adres çözümleme servisi yanıt vermedi.' });
  }
});

/**
 * GET /api/geocode/reverse
 * Koordinattan adres çözümleme proxy'si.
 */
router.get('/geocode/reverse', async (req, res) => {
  try {
    const data = await reverseAddress(req.query);
    res.json(data);
  } catch (error) {
    const status = /gerekli|geçersiz|Geçerli/i.test(error.message) ? 400 : 502;
    console.error('[API] Ters geocode hatası:', error.message);
    res.status(status).json({ error: 'Adres çözümleme servisi yanıt vermedi.' });
  }
});

module.exports = router;
