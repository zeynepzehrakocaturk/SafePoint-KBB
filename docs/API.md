# SafePoint KBB — API Dokümantasyonu

## Base URL

```
http://localhost:3000/api
```

## Endpoint'ler

### `GET /api/health`

Sunucu durumu.

### `GET /api/toplanma-alanlari`

496 AFAD acil toplanma alanı (GeoJSON).

### `GET /api/location-hierarchy`

NVI CSBM tabanlı Kocaeli adres hiyerarşisi.

**Kapsam:** 12 ilçe · 488 mahalle · 25.363 sokak/cadde

### `GET /api/street-location`

Seçilen sokak için gerçek koordinat döner. Önce yerel önbelleğe bakar; yoksa Nominatim ile çözümler ve kaydeder.

| Parametre | Zorunlu | Açıklama |
|-----------|---------|----------|
| `ilce` | Evet | İlçe adı (ör. İzmit) |
| `mahalle` | Evet | Mahalle adı |
| `cadde` | Evet | Sokak/cadde adı |

**Örnek yanıt:**

```json
{
  "lat": 40.7061272,
  "lng": 29.6958802,
  "source": "openstreetmap",
  "displayName": "Alkan (Sokak), 28 Haziran, İzmit, Kocaeli",
  "exact": true,
  "cached": true
}
```

### `GET /api/geocode/search` · `GET /api/geocode/reverse`

Nominatim proxy (rate limit + önbellek).

## Veri Kaynakları

| Kaynak | Açıklama |
|--------|----------|
| [NVI Adres Sistemi](https://adres.nvi.gov.tr/) | CSBM hiyerarşisi (melihozkara veri seti) |
| [PTT Posta Kodu](https://postakodu.ptt.gov.tr/) | Mahalle-sokak doğrulama referansı |
| [OpenStreetMap](https://www.openstreetmap.org/) | Sokak koordinatları |
| [Kandilli API](https://api.orhanaydogdu.com.tr/deprem/kandilli/live) | Deprem verisi |
