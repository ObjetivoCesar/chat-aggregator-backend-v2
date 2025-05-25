const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('../utils/logger');
const { processMessage } = require('../services/messageProcessor');
const { downloadAudio } = require('../services/audioService');
const { transcribeAudio } = require('../services/whisperService');
const { storeMessage, checkAndStartTimer } = require('../services/redisService');

// Configuración de multer para almacenar archivos de audio
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    fs.ensureDirSync(uploadDir); // Asegura que el directorio exista
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generar nombre único para el archivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'audio-' + uniqueSuffix + ext);
  }
});

// Filtro para aceptar solo archivos de audio
const fileFilter = (req, file, cb) => {
  // Aceptar formatos comunes de audio
  if (file.mimetype.startsWith('audio/') || 
      file.mimetype === 'application/octet-stream') {
    cb(null, true);
  } else {
    cb(new Error('Formato de archivo no soportado. Solo se aceptan archivos de audio.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // Límite de 10MB
  }
});

const router = express.Router();

/**
 * Endpoint principal para recibir webhooks de diferentes plataformas
 * Soporta tanto JSON (para plataformas como Facebook, WhatsApp) como
 * multipart/form-data (para el widget web con archivos de audio)
 */
router.post('/', upload.single('audio'), async (req, res) => {
  try {
    logger.info('Webhook recibido');
    
    // Verificar si es una solicitud con archivo de audio (desde widget web)
    if (req.file) {
      logger.info(`Archivo de audio recibido: ${req.file.path}`);
      
      // Procesar el archivo de audio
      const messageData = await processAudioFile(req.file, req.body);
      
      // Almacenar mensaje en Redis y verificar/iniciar temporizador
      await storeMessage(messageData);
      await checkAndStartTimer(messageData);
      
      // Responder con éxito
      return res.status(200).json({
        success: true,
        message: 'Audio recibido y procesado correctamente'
      });
    }
    
    // Si no es un archivo, procesar como webhook JSON normal
    logger.debug(`Payload JSON: ${JSON.stringify(req.body)}`);
    
    // Detectar la plataforma y procesar el mensaje
    const messageData = await processWebhook(req.body);
    
    // Si no hay datos de mensaje (por ejemplo, es un mensaje de eco), responder OK y terminar
    if (!messageData) {
      return res.status(200).send('OK');
    }
    
    // Almacenar mensaje en Redis y verificar/iniciar temporizador
    await storeMessage(messageData);
    await checkAndStartTimer(messageData);
    
    // Responder con éxito
    return res.status(200).send('OK');
  } catch (error) {
    logger.error(`Error procesando webhook: ${error.message}`);
    
    // Intentar limpiar archivos en caso de error
    if (req.file) {
      try {
        await fs.remove(req.file.path);
      } catch (cleanupError) {
        logger.error(`Error al limpiar archivos temporales: ${cleanupError.message}`);
      }
    }
    
    return res.status(500).json({ error: 'Error procesando webhook' });
  }
});

/**
 * Procesa un archivo de audio recibido desde el widget web
 * @param {Object} file - Objeto de archivo de multer
 * @param {Object} body - Cuerpo de la solicitud
 * @returns {Object} - Datos del mensaje procesado
 */
async function processAudioFile(file, body) {
  try {
    // Extraer información del cuerpo de la solicitud
    const userId = body.userId || `web_user_${Date.now()}`;
    const channel = 'web';
    
    // Ruta del archivo original subido
    const originalFilePath = file.path;
    
    // Ruta para el archivo convertido a mp3
    const mp3FilePath = path.join(
      path.dirname(originalFilePath),
      path.basename(originalFilePath, path.extname(originalFilePath)) + '.mp3'
    );
    
    logger.info('Convirtiendo archivo a MP3...');
    
    // Convertir el archivo a MP3 usando FFmpeg
    await convertToMp3(originalFilePath, mp3FilePath);
    
    logger.info('Archivo convertido a MP3, transcribiendo...');
    
    // Transcribir el archivo MP3 usando la API de Whisper
    const transcriptText = await transcribeAudio(mp3FilePath);
    
    logger.info(`Transcripción completada: "${transcriptText}"`);
    
    // Limpiar archivos temporales
    await cleanupFiles(originalFilePath, mp3FilePath);
    
    // Devolver datos del mensaje
    return {
      userId,
      channel,
      text: transcriptText,
      isAudio: true
    };
  } catch (error) {
    logger.error(`Error al procesar archivo de audio: ${error.message}`);
    throw error;
  }
}

/**
 * Convierte un archivo de audio a formato MP3 usando FFmpeg
 * @param {string} inputPath - Ruta del archivo de entrada
 * @param {string} outputPath - Ruta del archivo de salida (MP3)
 * @returns {Promise<void>}
 */
function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .audioCodec('libmp3lame')
      .on('end', () => {
        logger.info('Conversión a MP3 completada');
        resolve();
      })
      .on('error', (err) => {
        logger.error(`Error en la conversión a MP3: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Limpia los archivos temporales después de la transcripción
 * @param {string} originalPath - Ruta del archivo original
 * @param {string} mp3Path - Ruta del archivo MP3
 * @returns {Promise<void>}
 */
async function cleanupFiles(originalPath, mp3Path) {
  try {
    // Eliminar archivo original
    if (await fs.pathExists(originalPath)) {
      await fs.remove(originalPath);
      logger.info(`Archivo original eliminado: ${originalPath}`);
    }
    
    // Eliminar archivo MP3
    if (await fs.pathExists(mp3Path)) {
      await fs.remove(mp3Path);
      logger.info(`Archivo MP3 eliminado: ${mp3Path}`);
    }
  } catch (error) {
    logger.error(`Error al limpiar archivos temporales: ${error.message}`);
    // No lanzar el error para no interrumpir el flujo principal
  }
}

/**
 * Procesa el webhook según la plataforma
 * @param {Object} payload - Payload del webhook
 * @returns {Object|null} - Datos del mensaje procesado o null si debe ignorarse
 */
async function processWebhook(payload) {
  // Detectar la plataforma basada en la estructura del payload
  if (isFacebookMessenger(payload)) {
    return processFacebookMessenger(payload);
  } else if (isWhatsApp(payload)) {
    return processWhatsApp(payload);
  } else if (isInstagram(payload)) {
    return processInstagram(payload);
  } else if (isWeb(payload)) {
    return processWeb(payload);
  } else {
    logger.warn('Plataforma no reconocida');
    return null;
  }
}

/**
 * Verifica si el payload es de Facebook Messenger
 */
function isFacebookMessenger(payload) {
  return payload.object === 'page' && 
         payload.entry && 
         payload.entry[0] && 
         payload.entry[0].messaging;
}

/**
 * Procesa mensajes de Facebook Messenger
 */
async function processFacebookMessenger(payload) {
  const messaging = payload.entry[0].messaging[0];
  
  // Filtrar mensajes echo
  if (messaging.message && messaging.message.is_echo) {
    logger.info('Mensaje echo de Facebook ignorado');
    return null;
  }

  const userId = messaging.sender.id;
  const channel = 'facebook';
  
  // Verificar si es mensaje de audio
  if (messaging.message && 
      messaging.message.attachments && 
      messaging.message.attachments[0] && 
      messaging.message.attachments[0].type === 'audio') {
    
    // Procesar audio
    const audioUrl = messaging.message.attachments[0].payload.url;
    const audioPath = await downloadAudio(audioUrl);
    const transcriptText = await transcribeAudio(audioPath);
    
    return {
      userId,
      channel,
      text: transcriptText,
      isAudio: true
    };
  } 
  
  // Mensaje de texto
  if (messaging.message && messaging.message.text) {
    return {
      userId,
      channel,
      text: messaging.message.text,
      isAudio: false
    };
  }
  
  return null;
}

/**
 * Verifica si el payload es de WhatsApp
 */
function isWhatsApp(payload) {
  return payload.object === 'whatsapp_business_account' && 
         payload.entry && 
         payload.entry[0] && 
         payload.entry[0].changes && 
         payload.entry[0].changes[0] && 
         payload.entry[0].changes[0].value && 
         payload.entry[0].changes[0].value.messages;
}

/**
 * Procesa mensajes de WhatsApp
 */
async function processWhatsApp(payload) {
  const value = payload.entry[0].changes[0].value;
  const messages = value.messages;
  
  if (!messages || messages.length === 0) {
    return null;
  }
  
  const message = messages[0];
  const contacts = value.contacts;
  
  if (!contacts || contacts.length === 0) {
    return null;
  }
  
  const userId = contacts[0].wa_id;
  const channel = 'whatsapp';
  
  // Filtrar mensajes echo (cuando from coincide con nuestro número)
  // Nota: Esto es una aproximación, se debe ajustar con el número real
  if (message.from === process.env.WHATSAPP_PHONE_NUMBER) {
    logger.info('Mensaje echo de WhatsApp ignorado');
    return null;
  }
  
  // Verificar si es mensaje de audio
  if (message.type === 'audio') {
    // Procesar audio
    const audioUrl = message.audio.url;
    const audioPath = await downloadAudio(audioUrl);
    const transcriptText = await transcribeAudio(audioPath);
    
    return {
      userId,
      channel,
      text: transcriptText,
      isAudio: true
    };
  } 
  
  // Mensaje de texto
  if (message.type === 'text') {
    return {
      userId,
      channel,
      text: message.text.body,
      isAudio: false
    };
  }
  
  return null;
}

/**
 * Verifica si el payload es de Instagram
 */
function isInstagram(payload) {
  return payload.object === 'instagram' && 
         payload.entry && 
         payload.entry[0] && 
         payload.entry[0].messaging;
}

/**
 * Procesa mensajes de Instagram
 */
async function processInstagram(payload) {
  // Instagram DM usa la misma estructura que Facebook Messenger
  return processFacebookMessenger(payload);
}

/**
 * Verifica si el payload es de la Web
 */
function isWeb(payload) {
  return payload.channel === 'web' && 
         payload.user_id && 
         (payload.type === 'text' || payload.type === 'audio');
}

/**
 * Procesa mensajes de la Web
 */
async function processWeb(payload) {
  const userId = payload.user_id;
  const channel = 'web';
  
  // Verificar si es mensaje de audio
  if (payload.type === 'audio') {
    // Procesar audio
    const audioUrl = payload.payload;
    const audioPath = await downloadAudio(audioUrl);
    const transcriptText = await transcribeAudio(audioPath);
    
    return {
      userId,
      channel,
      text: transcriptText,
      isAudio: true
    };
  } 
  
  // Mensaje de texto
  if (payload.type === 'text') {
    return {
      userId,
      channel,
      text: payload.payload,
      isAudio: false
    };
  }
  
  return null;
}

module.exports = {
  webhookRouter: router
};
