const { redisClient } = require("../config/redis");

class MessageBuffer {
  constructor() {
    this.bufferKey = "message_buffer";
    this.maxBufferSize = 100;
    this.flushInterval = 5000; // 5 segundos
    this.timers = new Map();
  }

  async addMessage(message) {
    try {
      console.log("📝 Adding message to buffer:", message);
      
      // Agregar mensaje al buffer en Redis usando LPUSH
      const messageStr = JSON.stringify(message);
      await redisClient.sendCommand(['LPUSH', this.bufferKey, messageStr]);
      
      // Verificar tamaño del buffer usando LLEN
      const bufferSize = await redisClient.sendCommand(['LLEN', this.bufferKey]);
      console.log(`📊 Buffer size: ${bufferSize}`);
      
      // Mantener el buffer dentro del límite usando LTRIM
      if (bufferSize > this.maxBufferSize) {
        await redisClient.sendCommand(['LTRIM', this.bufferKey, '0', (this.maxBufferSize - 1).toString()]);
        console.log(`✂️  Buffer trimmed to ${this.maxBufferSize} messages`);
      }
      
      // Programar flush automático si no existe
      const channelKey = `${message.channel}_${message.user_id}`;
      if (!this.timers.has(channelKey)) {
        this.scheduleFlush(channelKey, message.channel, message.user_id);
      }
      
      return true;
    } catch (error) {
      console.error("❌ Error adding message to buffer:", error);
      console.error("❌ Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getMessages(limit = 10) {
    try {
      // Usar LRANGE para obtener mensajes
      const messages = await redisClient.lRange(this.bufferKey, 0, limit - 1);
      return messages.map(msg => {
        try {
          return JSON.parse(msg);
        } catch (parseError) {
          console.error("❌ Error parsing message:", parseError);
          return null;
        }
      }).filter(msg => msg !== null);
    } catch (error) {
      console.error("❌ Error getting messages from buffer:", error);
      return [];
    }
  }

  async clearBuffer() {
    try {
      // Usar DEL para eliminar la clave
      await redisClient.del(this.bufferKey);
      console.log("🧹 Buffer cleared");
      return true;
    } catch (error) {
      console.error("❌ Error clearing buffer:", error);
      return false;
    }
  }

  scheduleFlush(channelKey, channel, userId) {
    console.log(`⏰ Scheduling flush for ${channelKey} in ${this.flushInterval}ms`);
    
    const timer = setTimeout(async () => {
      try {
        await this.flushMessages(channel, userId);
        this.timers.delete(channelKey);
      } catch (error) {
        console.error(`❌ Error in scheduled flush for ${channelKey}:`, error);
        this.timers.delete(channelKey);
      }
    }, this.flushInterval);
    
    this.timers.set(channelKey, timer);
  }

  async flushMessages(channel, userId) {
    try {
      console.log(`🚀 Flushing messages for ${channel}:${userId}`);
      
      // Obtener mensajes del buffer
      const messages = await this.getMessages();
      
      if (messages.length === 0) {
        console.log("📭 No messages to flush");
        return;
      }
      
      // Filtrar mensajes del canal/usuario específico
      const userMessages = messages.filter(msg => 
        msg.channel === channel && msg.user_id === userId
      );
      
      if (userMessages.length === 0) {
        console.log(`📭 No messages to flush for ${channel}:${userId}`);
        return;
      }
      
      console.log(`📤 Flushing ${userMessages.length} messages for ${channel}:${userId}`);
      
      // Procesar mensajes
      for (const message of userMessages) {
        console.log(`✅ Processed message: ${message.content || message.payload?.text || 'N/A'}`);
        
        // Aquí puedes agregar lógica adicional como:
        // - Enviar a webhook externo
        // - Guardar en base de datos
        // - Procesar con IA
        // - etc.
      }
      
      // Opcional: limpiar mensajes procesados
      // await this.clearBuffer();
      
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
    try {
      const size = await redisClient.lLen(this.bufferKey);
      const activeTimers = this.getActiveTimers();
      
      return {
        bufferSize: size,
        activeTimers: activeTimers,
        maxBufferSize: this.maxBufferSize,
        flushInterval: this.flushInterval
      };
    } catch (error) {
      console.error("❌ Error getting buffer stats:", error);
      return {
        bufferSize: 0,
        activeTimers: this.getActiveTimers(),
        maxBufferSize: this.maxBufferSize,
        flushInterval: this.flushInterval,
        error: error.message
      };
    }
  }
}

module.exports = new MessageBuffer();
