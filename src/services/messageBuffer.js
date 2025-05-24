const redisClient = require("../config/redis")
const makeWebhook = require("./makeWebhook")

class MessageBuffer {
  constructor() {
    this.BUFFER_DURATION = 20000 // 20 segundos
    this.MAX_BUFFER_SIZE = 50 // máximo número de mensajes en buffer
    this.MAX_MESSAGE_LENGTH = 10000 // longitud máxima de mensaje combinado
    this.activeTimers = new Map() // Para tracking de timers activos
    this.metrics = {
      totalMessages: 0,
      totalErrors: 0,
      totalRetries: 0,
      lastError: null,
      lastProcessed: null
    }
  }

  async addMessage(message) {
    const startTime = Date.now()
    const { user_id, channel, content } = message
    const chatKey = `chat:${channel}:${user_id}`
    const startKey = `start:${channel}:${user_id}`
    const timerKey = `${channel}:${user_id}`

    try {
      this.metrics.totalMessages++
      console.log(`📊 Metrics - Total messages: ${this.metrics.totalMessages}, Active timers: ${this.activeTimers.size}`)

      // Verificar longitud del mensaje
      if (content && content.length > this.MAX_MESSAGE_LENGTH) {
        console.warn(`⚠️ Message too long (${content.length} chars), truncating`)
        message.content = content.substring(0, this.MAX_MESSAGE_LENGTH)
      }

      // Verificar tamaño del buffer
      const bufferLength = await redisClient.lLen(chatKey)
      if (bufferLength >= this.MAX_BUFFER_SIZE) {
        console.warn(`⚠️ Buffer full for ${timerKey}, processing now`)
        await this.processBuffer(channel, user_id)
        return
      }

      // Agregar mensaje al buffer
      await redisClient.lPush(chatKey, content)
      const processingTime = Date.now() - startTime
      console.log(`📝 Added message to buffer: ${chatKey} (${bufferLength + 1}/${this.MAX_BUFFER_SIZE}) - Processing time: ${processingTime}ms`)

      // Verificar si ya existe un timer activo
      const startExists = await redisClient.exists(startKey)

      if (!startExists) {
        // Primer mensaje - iniciar timer
        console.log(`⏰ Starting 20s timer for ${timerKey}`)

        // Marcar inicio en Redis con TTL
        await redisClient.setEx(startKey, 25, Date.now().toString())

        // Iniciar timer local
        const timer = setTimeout(async () => {
          try {
            await this.processBuffer(channel, user_id)
          } catch (error) {
            this.metrics.totalErrors++
            this.metrics.lastError = {
              timestamp: new Date().toISOString(),
              error: error.message,
              channel,
              user_id
            }
            console.error(`❌ Error in timer callback for ${timerKey}:`, error)
            console.error(`📊 Error metrics - Total errors: ${this.metrics.totalErrors}, Last error: ${JSON.stringify(this.metrics.lastError)}`)
          } finally {
            this.activeTimers.delete(timerKey)
          }
        }, this.BUFFER_DURATION)

        this.activeTimers.set(timerKey, timer)
      } else {
        console.log(`⏳ Timer already active for ${timerKey}, adding to buffer`)
      }
    } catch (error) {
      this.metrics.totalErrors++
      this.metrics.lastError = {
        timestamp: new Date().toISOString(),
        error: error.message,
        channel,
        user_id
      }
      console.error("❌ Error adding message to buffer:", error)
      console.error(`📊 Error metrics - Total errors: ${this.metrics.totalErrors}, Last error: ${JSON.stringify(this.metrics.lastError)}`)
      throw error
    }
  }

  async processBuffer(channel, user_id) {
    const startTime = Date.now()
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
      
      // Verificar longitud total
      if (combinedText.length > this.MAX_MESSAGE_LENGTH) {
        console.warn(`⚠️ Combined text too long (${combinedText.length} chars), truncating`)
        combinedText = combinedText.substring(0, this.MAX_MESSAGE_LENGTH)
      }

      const processingTime = Date.now() - startTime
      console.log(`📋 Combined text (${messages.length} fragments): "${combinedText}" - Processing time: ${processingTime}ms`)

      // Limpiar buffer
      await Promise.all([redisClient.del(chatKey), redisClient.del(startKey)])

      console.log(`🧹 Cleaned buffer for ${channel}:${user_id}`)

      // Enviar a Make.com
      await makeWebhook.sendToMake({
        user_id,
        channel,
        text: combinedText,
      })

      this.metrics.lastProcessed = {
        timestamp: new Date().toISOString(),
        channel,
        user_id,
        messageCount: messages.length,
        processingTime
      }
      console.log(`📊 Processing metrics - Last processed: ${JSON.stringify(this.metrics.lastProcessed)}`)

    } catch (error) {
      this.metrics.totalErrors++
      this.metrics.lastError = {
        timestamp: new Date().toISOString(),
        error: error.message,
        channel,
        user_id
      }
      console.error(`❌ Error processing buffer for ${channel}:${user_id}:`, error)
      console.error(`📊 Error metrics - Total errors: ${this.metrics.totalErrors}, Last error: ${JSON.stringify(this.metrics.lastError)}`)

      // En caso de error, intentar limpiar el buffer
      try {
        await Promise.all([redisClient.del(chatKey), redisClient.del(startKey)])
      } catch (cleanupError) {
        console.error("❌ Error cleaning up buffer after failure:", cleanupError)
      }

      // Reintentar el envío a Make.com después de un delay
      setTimeout(async () => {
        try {
          this.metrics.totalRetries++
          console.log(`🔄 Retrying Make.com webhook (attempt ${this.metrics.totalRetries})`)
          await makeWebhook.sendToMake({
            user_id,
            channel,
            text: combinedText,
            retry: true
          })
        } catch (retryError) {
          console.error("❌ Retry failed:", retryError)
        }
      }, 5000) // 5 segundos de delay
    }
  }

  // Método para limpiar timers al cerrar la aplicación
  clearAllTimers() {
    console.log(`🧹 Clearing ${this.activeTimers.size} active timers`)
    console.log(`📊 Final metrics - Total messages: ${this.metrics.totalMessages}, Total errors: ${this.metrics.totalErrors}, Total retries: ${this.metrics.totalRetries}`)
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
