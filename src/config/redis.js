const { createClient } = require("redis")

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
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

// Connect to Redis
;(async () => {
  try {
    await redisClient.connect()
  } catch (error) {
    console.error("Failed to connect to Redis:", error)
    process.exit(1)
  }
})()

module.exports = redisClient
