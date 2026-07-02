# SafePoint KBB — Mimari Dokümantasyon

## Veri Katmanları

```
┌─────────────────────────────────────────────────────────┐
│ NVI CSBM (25.363 sokak)                                  │
│   kocaeli-csbm-hierarchy.json                            │
├─────────────────────────────────────────────────────────┤
│ Sokak Koordinat Önbelleği                                │
│   kocaeli-street-coordinates.json (OSM + Nominatim)      │
├─────────────────────────────────────────────────────────┤
│ AFAD Toplanma Alanları (496 kayıt)                       │
│   acil-toplanma-alanlari.json                            │
└─────────────────────────────────────────────────────────┘
```

## Konum Akışı

1. Kullanıcı ilçe → mahalle → sokak seçer (NVI CSBM listesi)
2. Frontend `/api/street-location` çağırır
3. Sunucu önbellekte koordinat arar; yoksa Nominatim ile çözümler
4. Gerçek lat/lng ile Haversine mesafe hesaplanır
5. En yakın 3 toplanma alanı + deprem verisi gösterilir

## Koordinat Çözümleme

| Aşama | Yöntem | Kapsam |
|-------|--------|--------|
| 1 | OSM Overpass toplu eşleştirme | ~11.800+ sokak |
| 2 | Nominatim yapılandırılmış arama | Kalan sokaklar (canlı + önbellek) |
| 3 | Toplanma alanları | İlçe merkezi yaklaşık konum (AFAD koordinatsız) |

## Build Scriptleri

```bash
npm run build:csbm              # NVI verisinden hiyerarşi
npm run geocode:streets         # OSM + Nominatim koordinat
npm run geocode:streets -- --district=İzmit
```

## Güvenlik

- XSS: `escapeHtml()` ile dinamik HTML sanitizasyonu
- HTTP güvenlik başlıkları (`middleware/security.js`)
- Geocode proxy: giriş doğrulama, rate limit, önbellek
