const { redisClient } = require("../config/redis");
const makeWebhook = require("./makeWebhook");

class MessageBuffer {
  constructor() {
    this.maxBufferSize = 100;
    this.flushInterval = 20000; // 20 segundos
    this.timers = new Map();
  }

  // Key por usuario/plataforma
  getBufferKey(channel, userId) {
    return `message_buffer:${channel}:${userId}`;
  }

  async addMessage(message) {
    try {
      const bufferKey = this.getBufferKey(message.channel, message.user_id);
      console.log("📝 Adding message to buffer:", message);

      // Agregar mensaje al buffer en Redis usando RPUSH (para mantener orden)
      const messageStr = JSON.stringify(message);
      await redisClient.rPush(bufferKey, messageStr);

      // Mantener el buffer dentro del límite usando LTRIM
      const bufferSize = await redisClient.lLen(bufferKey);
      if (bufferSize > this.maxBufferSize) {
        await redisClient.lTrim(bufferKey, -this.maxBufferSize, -1);
        console.log(`✂️  Buffer trimmed to ${this.maxBufferSize} messages`);
      }

      // Programar flush solo si no existe temporizador
      const timerKey = `${message.channel}_${message.user_id}`;
      
      // Si es audio y no está transcrito, esperar a que se complete la transcripción
      if (message.original_type === "audio" && !message.transcription_done) {
        console.log("⏳ Esperando transcripción de audio antes de iniciar temporizador");
        return true;
      }

      // Si no hay temporizador activo, iniciar uno nuevo
      if (!this.timers.has(timerKey)) {
        console.log(`⏰ Iniciando nuevo temporizador para ${timerKey}`);
        this.startFlushTimer(timerKey, message.channel, message.user_id);
      } else {
        console.log(`⏰ Temporizador existente para ${timerKey}, mensaje agregado al buffer`);
      }

      return true;
    } catch (error) {
      console.error("❌ Error adding message to buffer:", error);
      throw error;
    }
  }

  // Llamar esto después de la transcripción de audio
  startFlushTimer(timerKey, channel, userId) {
    console.log(`⏰ Scheduling flush for ${timerKey} in ${this.flushInterval}ms`);
    
    // Limpiar temporizador existente si hay uno
    if (this.timers.has(timerKey)) {
      clearTimeout(this.timers.get(timerKey));
      this.timers.delete(timerKey);
    }
    
    const timer = setTimeout(async () => {
      try {
        await this.flushMessages(channel, userId);
        this.timers.delete(timerKey);
      } catch (error) {
        console.error(`❌ Error in scheduled flush for ${timerKey}:`, error);
        this.timers.delete(timerKey);
      }
    }, this.flushInterval);
    
    this.timers.set(timerKey, timer);
  }

  async flushMessages(channel, userId) {
    try {
      const bufferKey = this.getBufferKey(channel, userId);
      console.log(`🚀 Flushing messages for ${channel}:${userId}`);

      // Obtener todos los mensajes del buffer
      const messagesRaw = await redisClient.lRange(bufferKey, 0, -1);
      if (!messagesRaw || messagesRaw.length === 0) {
        console.log("📭 No messages to flush");
        return;
      }

      // Parsear y ordenar mensajes
      const messages = messagesRaw.map(msg => {
        try {
          return JSON.parse(msg);
        } catch {
          return null;
        }
      }).filter(Boolean);

      // Ordenar mensajes por timestamp
      messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // Crear mensaje concatenado con formato claro
      const messageParts = messages.map((m, index) => {
        const prefix = m.original_type === 'audio' ? '[Audio] ' : '';
        return `${prefix}${m.content}`;
      });

      const concatenated = messageParts.join('\n');

      // Crear payload simplificado para Make.com
      const payload = {
        user_id: userId,
        platform: channel,
        message_concatenado: concatenated
      };

      try {
        console.log("📤 Sending to Make.com:", JSON.stringify(payload, null, 2));
        await makeWebhook.sendToMake(payload);
        console.log("✅ Successfully sent to Make.com (200)");
        console.log("📄 Make.com response: Accepted");
      } catch (error) {
        console.error("❌ Error sending payload to Make:", error.message);
        throw error;
      }

      // Limpiar buffer
      await redisClient.del(bufferKey);
      console.log("🧹 Buffer cleared for", bufferKey);

    } catch (error) {
      console.error("❌ Error flushing messages:", error);
      throw error;
    }
  }

  getActiveTimers() {
    return this.timers.size;
  }

  clearAllTimers() {
    for (const [key, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    console.log("🧹 All timers cleared");
  }

  // Método para verificar el estado del buffer
  async getBufferStats() {
    // Este método puede ser adaptado para múltiples buffers si lo necesitas
    return {};
  }
}

module.exports = new MessageBuffer();
