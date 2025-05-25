const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Envía el mensaje combinado a Make.com
 * @param {Object} messageData - Datos del mensaje a enviar
 * @param {string} messageData.user_id - ID del usuario
 * @param {string} messageData.channel - Canal (facebook, whatsapp, instagram, web)
 * @param {string} messageData.text - Texto combinado
 * @returns {Promise<void>}
 */
async function sendMessageToMake(messageData) {
  try {
    const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
    
    if (!makeWebhookUrl) {
      throw new Error('MAKE_WEBHOOK_URL no está configurada en las variables de entorno');
    }
    
    logger.info(`Enviando mensaje a Make.com: ${JSON.stringify(messageData)}`);
    
    // Realizar solicitud POST a Make.com
    const response = await axios.post(makeWebhookUrl, messageData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    logger.info(`Respuesta de Make.com: ${response.status} ${response.statusText}`);
    
    if (response.status !== 200) {
      throw new Error(`Make.com respondió con código ${response.status}`);
    }
    
    return response.data;
  } catch (error) {
    logger.error(`Error al enviar mensaje a Make.com: ${error.message}`);
    
    // Si hay un error de respuesta, registrar más detalles
    if (error.response) {
      logger.error(`Detalles de error: ${JSON.stringify({
        status: error.response.status,
        data: error.response.data
      })}`);
    }
    
    throw error;
  }
}

module.exports = {
  sendMessageToMake
};
