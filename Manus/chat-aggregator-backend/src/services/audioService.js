const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Descarga un archivo de audio desde una URL
 * @param {string} url - URL del archivo de audio
 * @returns {Promise<string>} - Ruta al archivo descargado
 */
async function downloadAudio(url) {
  try {
    logger.info(`Descargando audio desde: ${url}`);
    
    // Crear directorio temporal si no existe
    const tempDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generar nombre de archivo único
    const fileName = `audio_${Date.now()}.mp3`;
    const filePath = path.join(tempDir, fileName);
    
    // Descargar el archivo
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });
    
    // Guardar el archivo
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        logger.info(`Audio descargado en: ${filePath}`);
        resolve(filePath);
      });
      writer.on('error', (err) => {
        logger.error(`Error al guardar audio: ${err.message}`);
        reject(err);
      });
    });
  } catch (error) {
    logger.error(`Error al descargar audio: ${error.message}`);
    throw error;
  }
}

module.exports = {
  downloadAudio
};
