const { OpenAI } = require('openai');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Transcribe un archivo de audio usando la API de OpenAI Whisper
 * @param {string} audioPath - Ruta al archivo de audio
 * @returns {Promise<string>} - Texto transcrito
 */
async function transcribeAudio(audioPath) {
  try {
    logger.info(`Transcribiendo audio: ${audioPath}`);
    
    // Verificar que existe la clave de API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no está configurada en las variables de entorno');
    }
    
    // Verificar que el archivo existe
    if (!await fs.pathExists(audioPath)) {
      throw new Error(`El archivo de audio no existe: ${audioPath}`);
    }
    
    // Verificar tamaño del archivo
    const stats = await fs.stat(audioPath);
    logger.info(`Tamaño del archivo: ${stats.size} bytes`);
    
    if (stats.size === 0) {
      throw new Error('El archivo de audio está vacío');
    }
    
    // Crear stream de lectura del archivo
    const audioFile = fs.createReadStream(audioPath);
    
    // Transcribir usando la API de OpenAI
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });
    
    logger.info(`Audio transcrito: "${transcription.text}"`);
    
    return transcription.text;
  } catch (error) {
    logger.error(`Error al transcribir audio: ${error.message}`);
    
    // Si el error es específico de OpenAI, mostrar más detalles
    if (error.response && error.response.data) {
      logger.error('Detalles del error de OpenAI:', error.response.data);
    }
    
    // En caso de error, devolver un mensaje genérico
    return "[Error al transcribir audio]";
  }
}

module.exports = {
  transcribeAudio
};
