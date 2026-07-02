/**
 * Express uygulama fabrikası.
 * Middleware ve route'ları tek noktada birleştirir.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PUBLIC_DIR } = require('./config');
const { ROOT_DIR } = require('./config');
const apiRoutes = require('./routes/api.routes');
const { securityHeaders } = require('./middleware/security');

/**
 * Yapılandırılmış Express uygulaması oluşturur.
 * @returns {import('express').Express}
 */
function createApp() {
  const app = express();

  // Güvenlik başlıkları — XSS/clickjacking riskini azaltır
  app.use(securityHeaders);

  // CORS: frontend'in API'ye erişimine izin verir
  app.use(cors());

  // Statik dosyalar (HTML, CSS, JS, görseller)
  app.use(express.static(PUBLIC_DIR));

  // Proje kökündeki logo dosyası
  app.get('/logo.png', (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'logo.png'));
  });

  // API route'ları /api altında gruplanır
  app.use('/api', apiRoutes);

  // SPA fallback — bilinmeyen rotalar ana sayfaya yönlendirilir
  app.get('*', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  return app;
}

module.exports = { createApp };
