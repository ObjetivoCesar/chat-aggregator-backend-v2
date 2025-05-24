const redisClient = require("../config/redis")
const makeWebhook = require("./makeWebhook")

class MessageBuffer {
  constructor() {
    this.BUFFER_DURATION = 20000 // 20 segundos
    this.activeTimers = new Map() // Para tracking de timers activos
  }

  async addMessage(message) {
    const { user_id, channel, content } = message
    const chatKey = `chat:${channel}:${user_id}`
    const startKey = `start:${channel}:${user_id}`
    const timerKey = `${channel}:${user_id}`

    try {
      // Agregar mensaje al buffer
      await redisClient.lPush(chatKey, content)
      console.log(`📝 Added message to buffer: ${chatKey}`)

      // Verificar si ya existe un timer activo
      const startExists = await redisClient.exists(startKey)

      if (!startExists) {
        // Primer mensaje - iniciar timer
        console.log(`⏰ Starting 20s timer for ${timerKey}`)

        // Marcar inicio en Redis con TTL
        await redisClient.setEx(startKey, 25, Date.now().toString())

        // Iniciar timer local
        const timer = setTimeout(async () => {
          await this.processBuffer(channel, user_id)
          this.activeTimers.delete(timerKey)
        }, this.BUFFER_DURATION)

        this.activeTimers.set(timerKey, timer)
      } else {
        console.log(`⏳ Timer already active for ${timerKey}, adding to buffer`)
      }
    } catch (error) {
      console.error("❌ Error adding message to buffer:", error)
      throw error
    }
  }

  async processBuffer(channel, user_id) {
    const chatKey = `chat:${channel}:${user_id}`
    const startKey = `start:${channel}:${user_id}`

    try {
      console.log(`🔄 Processing buffer for ${channel}:${user_id}`)

      // Obtener todos los mensajes del buffer
      const messages = await redisClient.lRange(chatKey, 0, -1)

      if (messages.length === 0) {
        console.log(`⚠️  No messages found in buffer for ${channel}:${user_id}`)
        return
      }

      // Combinar mensajes (reverse porque Redis LPUSH invierte el orden)
      const combinedText = messages.reverse().join(" ")
      console.log(`📋 Combined text (${messages.length} fragments): "${combinedText}"`)

      // Limpiar buffer
      await Promise.all([redisClient.del(chatKey), redisClient.del(startKey)])

      console.log(`🧹 Cleaned buffer for ${channel}:${user_id}`)

      // Enviar a Make.com
      await makeWebhook.sendToMake({
        user_id,
        channel,
        text: combinedText,
      })
    } catch (error) {
      console.error(`❌ Error processing buffer for ${channel}:${user_id}:`, error)

      // En caso de error, intentar limpiar el buffer
      try {
        await Promise.all([redisClient.del(chatKey), redisClient.del(startKey)])
      } catch (cleanupError) {
        console.error("❌ Error cleaning up buffer after failure:", cleanupError)
      }
    }
  }

  // Método para limpiar timers al cerrar la aplicación
  clearAllTimers() {
    console.log(`🧹 Clearing ${this.activeTimers.size} active timers`)
    for (const [key, timer] of this.activeTimers) {
      clearTimeout(timer)
    }
    this.activeTimers.clear()
  }
}

// Limpiar timers al cerrar la aplicación
const messageBuffer = new MessageBuffer()

process.on("SIGTERM", () => {
  messageBuffer.clearAllTimers()
})

process.on("SIGINT", () => {
  messageBuffer.clearAllTimers()
})

module.exports = messageBuffer
