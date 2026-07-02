/**
 * SafePoint-KBB — Uygulama giriş noktası
 * Kocaeli Büyükşehir Belediyesi Afet Konum Uygulaması
 */
const { createApp } = require('./src/server/app');
const { PORT } = require('./src/server/config');

const app = createApp();

app.listen(PORT, () => {
  console.log(`[SafePoint-KBB] Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
