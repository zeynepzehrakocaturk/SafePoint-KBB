/**
 * Sunucu yapılandırma sabitleri.
 * Ortam değişkenleri üzerinden port ve dosya yolları yönetilir.
 */
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  ROOT_DIR,
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  DATA_DIR: path.join(ROOT_DIR, 'data'),
  ASSEMBLY_AREAS_FILE: path.join(ROOT_DIR, 'data', 'acil-toplanma-alanlari.json'),
  LOCATION_HIERARCHY_FILE: path.join(ROOT_DIR, 'data', 'kocaeli-location-hierarchy.json'),
  CSBM_HIERARCHY_FILE: path.join(ROOT_DIR, 'data', 'kocaeli-csbm-hierarchy.json'),
  STREET_COORDINATES_FILE: path.join(ROOT_DIR, 'data', 'kocaeli-street-coordinates.json'),
};
