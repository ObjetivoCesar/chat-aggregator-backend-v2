const { createClient } = require("redis")

const MAX_RETRIES = 5
const RETRY_DELAY = 5000 // 5 segundos

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > MAX_RETRIES) {
        console.error("❌ Max Redis reconnection attempts reached")
        return new Error("Max reconnection attempts reached")
      }
      console.log(`🔄 Redis reconnection attempt ${retries}/${MAX_RETRIES}`)
      return RETRY_DELAY
    }
  }
})

redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err)
})

redisClient.on("connect", () => {
  console.log("🔗 Redis Client Connected")
})

redisClient.on("ready", () => {
  console.log("✅ Redis Client Ready")
})

redisClient.on("end", () => {
  console.log("🔌 Redis Client Disconnected")
})

redisClient.on("reconnecting", () => {
  console.log("🔄 Redis Client Reconnecting...")
})

// Connect to Redis
;(async () => {
  let retries = 0
  while (retries < MAX_RETRIES) {
    try {
      await redisClient.connect()
      break
    } catch (error) {
      retries++
      console.error(`Failed to connect to Redis (attempt ${retries}/${MAX_RETRIES}):`, error)
      if (retries === MAX_RETRIES) {
        console.error("❌ Max Redis connection attempts reached")
        process.exit(1)
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
    }
  }
})()

module.exports = redisClient
