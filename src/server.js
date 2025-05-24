const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
require("dotenv").config()

const webhookRoutes = require("./routes/webhook")
const healthRoutes = require("./routes/health")
const redisClient = require("./config/redis")

const app = express()

// Configuración CORS específica
app.use(cors({
  origin: ['https://cdpn.io', 'https://codepen.io', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// Manejo de preflight (OPTIONS)
app.options('*', cors())

const PORT = process.env.PORT || 3000

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" }
}))
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Routes
app.use("/webhook", webhookRoutes)
app.use("/health", healthRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err)
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" })
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully")
  await redisClient.quit()
  process.exit(0)
})

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully")
  await redisClient.quit()
  process.exit(0)
})

app.listen(PORT, () => {
  console.log(`🚀 Chat Aggregator Backend running on port ${PORT}`)
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`)
  console.log(`❤️  Health check: http://localhost:${PORT}/health`)
})

module.exports = app
