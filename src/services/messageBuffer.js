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
      if (!this.timers.has(timerKey)) {
        // Si es audio y no está transcrito, el temporizador se programa después de la transcripción
        if (message.original_type === "audio" && !message.transcription_done) {
          // El messageProcessor debe llamar a startFlushTimer después de la transcripción
          return true;
        }
        this.startFlushTimer(timerKey, message.channel, message.user_id);
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

      // Concatenar mensajes (texto y transcripciones)
      const concatenated = messages.map(m => m.content).join(" ");

      // Payload a Make
      const payload = {
        user_id: userId,
        platform: channel,
        message_concatenado: concatenated,
        metadata: {
          count: messages.length,
          timestamps: messages.map(m => m.timestamp),
          original_types: messages.map(m => m.original_type),
        }
      };

      try {
        await makeWebhook.sendToMake(payload);
        console.log("✅ Payload sent to Make:", payload);
      } catch (error) {
        console.error("❌ Error sending payload to Make:", error.message);
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
