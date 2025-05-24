const redisClient = require("../config/redis")
const makeWebhook = require("./makeWebhook")

class MessageBuffer {
  constructor() {
    this.BUFFER_DURATION = 20000 // 20 segundos
    this.REDIS_KEY = "chat:buffer" // Sorted set global para todos los mensajes
  }

  // Agregar mensaje al buffer
  async addMessage(message) {
    const timestamp = Date.now()
    const entry = JSON.stringify({ ...message, timestamp })
    await redisClient.zAdd(this.REDIS_KEY, [{ score: timestamp, value: entry }])
    console.log(`📝 Mensaje agregado al buffer: ${entry}`)
  }

  // Obtener y eliminar mensajes listos para procesar
  async getAndRemoveReadyMessages() {
    const now = Date.now()
    const readyTimestamp = now - this.BUFFER_DURATION
    // Obtener mensajes con timestamp <= readyTimestamp
    const entries = await redisClient.zRangeByScore(this.REDIS_KEY, 0, readyTimestamp)
    if (entries.length === 0) return []
    // Eliminar los mensajes procesados
    await redisClient.zRemRangeByScore(this.REDIS_KEY, 0, readyTimestamp)
    // Parsear los mensajes
    return entries.map(e => JSON.parse(e))
  }
}

module.exports = new MessageBuffer()
