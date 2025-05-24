const express = require("express")
const router = express.Router()
const redisClient = require("../config/redis")

router.get("/", async (req, res) => {
  try {
    // Check Redis connection
    await redisClient.ping()

    res.status(200).json({
      status: "up",
      timestamp: new Date().toISOString(),
      services: {
        redis: "connected",
        openai: process.env.OPENAI_API_KEY ? "configured" : "not configured",
        make_webhook: process.env.MAKE_WEBHOOK_URL ? "configured" : "not configured",
      },
    })
  } catch (error) {
    console.error("Health check failed:", error)
    res.status(503).json({
      status: "down",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
})

module.exports = router
