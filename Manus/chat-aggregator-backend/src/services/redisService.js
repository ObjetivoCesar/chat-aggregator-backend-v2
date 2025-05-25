const Redis = require('ioredis');
const logger = require('../utils/logger');
const { sendMessageToMake } = require('./makeService');

// Inicializar cliente Redis
const redis = new Redis(process.env.REDIS_URL);

// Tiempo de espera para agrupar mensajes (20 segundos)
const AGGREGATION_TIME = 20000;

/**
 * Almacena un fragmento de mensaje en Redis
 * @param {Object} messageData - Datos del mensaje
 * @returns {Promise<void>}
 */
async function storeMessage(messageData) {
  try {
    const { userId, channel, text } = messageData;
    const key = `chat:${channel}:${userId}`;
    
    logger.info(`Almacenando mensaje para ${key}: "${text}"`);
    
    // Añadir mensaje a la lista (al inicio, para poder usar reverse después)
    await redis.lpush(key, text);
    
    logger.info(`Mensaje almacenado correctamente`);
  } catch (error) {
    logger.error(`Error al almacenar mensaje en Redis: ${error.message}`);
    throw error;
  }
}

/**
 * Verifica si existe un temporizador para el usuario y canal, y lo inicia si no existe
 * @param {Object} messageData - Datos del mensaje
 * @returns {Promise<void>}
 */
async function checkAndStartTimer(messageData) {
  try {
    const { userId, channel } = messageData;
    const startKey = `start:${channel}:${userId}`;
    
    // Verificar si ya existe un temporizador
    const exists = await redis.exists(startKey);
    
    if (!exists) {
      logger.info(`Iniciando temporizador para ${startKey}`);
      
      // Establecer marca de inicio con TTL de 20 segundos
      await redis.set(startKey, Date.now(), 'EX', Math.ceil(AGGREGATION_TIME / 1000));
      
      // Programar el procesamiento después de 20 segundos
      setTimeout(() => {
        processAggregatedMessages(userId, channel).catch(err => {
          logger.error(`Error al procesar mensajes agrupados: ${err.message}`);
        });
      }, AGGREGATION_TIME);
    } else {
      logger.info(`Temporizador ya existe para ${startKey}`);
    }
  } catch (error) {
    logger.error(`Error al verificar/iniciar temporizador: ${error.message}`);
    throw error;
  }
}

/**
 * Procesa los mensajes agrupados después de que expire el temporizador
 * @param {string} userId - ID del usuario
 * @param {string} channel - Canal (facebook, whatsapp, instagram, web)
 * @returns {Promise<void>}
 */
async function processAggregatedMessages(userId, channel) {
  try {
    const chatKey = `chat:${channel}:${userId}`;
    const startKey = `start:${channel}:${userId}`;
    
    logger.info(`Procesando mensajes agrupados para ${chatKey}`);
    
    // Obtener todos los fragmentos de mensaje
    const fragments = await redis.lrange(chatKey, 0, -1);
    
    if (fragments.length === 0) {
      logger.warn(`No hay fragmentos para procesar en ${chatKey}`);
      return;
    }
    
    // Combinar fragmentos (invertir para orden cronológico y unir con espacio)
    const combinedText = fragments.reverse().join(" ");
    
    logger.info(`Texto combinado: "${combinedText}"`);
    
    // Eliminar claves de Redis
    await redis.del(chatKey);
    await redis.del(startKey);
    
    // Enviar mensaje combinado a Make.com
    await sendMessageToMake({
      user_id: userId,
      channel: channel,
      text: combinedText
    });
    
    logger.info(`Mensaje combinado enviado a Make.com`);
  } catch (error) {
    logger.error(`Error al procesar mensajes agrupados: ${error.message}`);
    throw error;
  }
}

module.exports = {
  storeMessage,
  checkAndStartTimer,
  processAggregatedMessages
};
