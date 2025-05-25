const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
require("dotenv").config()

const webhookRoutes = require("./routes/webhook")
const healthRoutes = require("./routes/health")

// Importar Redis de forma más robusta
let redisClient = null;
let redisConfig = null;
try {
  console.log("📦 Intentando cargar módulo Redis...");
  redisConfig = require("./config/redis");
  redisClient = redisConfig.redisClient;
  console.log("✅ Módulo Redis cargado correctamente");
  
  // Conectar a Redis
  console.log("🔄 Intentando conectar a Redis...");
  redisConfig.connectRedis().then(() => {
    console.log("✅ Redis client connected");
  }).catch(err => {
    console.warn('❌ Redis connection failed, continuing without Redis:', err.message);
    redisClient = null;
  });
} catch (error) {
  console.warn('❌ Redis module not found or failed to load, continuing without Redis:', error.message);
  redisClient = null;
}

const app = express()

// IMPORTANTE: trust proxy debe estar activado en Render/Heroku/similares
app.set('trust proxy', 1);

// Configuración CORS específica
const corsOptions = {
  origin: [
    'https://cdpn.io', 
    'https://codepen.io', 
    'http://localhost:3000',
    'https://chat-aggregator-backend-v2.onrender.com'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}

// Aplicar CORS antes de otros middlewares
app.use(cors(corsOptions))

// Configuración de Helmet más permisiva
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false // Deshabilitar CSP temporalmente para pruebas
}))

// Manejo de preflight (OPTIONS)
app.options('*', cors(corsOptions))

const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Routes
app.use("/webhook", webhookRoutes)
app.use("/health", healthRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err)
  if (err && err.message && err.message.includes('Redis')) {
    return res.status(503).json({
      error: "Redis unavailable",
      message: "El servicio de almacenamiento temporal no está disponible. Intenta más tarde."
    });
  }
  res.status(500).json({
    error: "Internal server error",
    message: "Something went wrong"
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" })
})

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`)
  
  if (redisClient && redisConfig) {
    try {
      if (redisClient.isOpen) {
        await redisClient.quit()
        console.log('✅ Redis connection closed')
      }
    } catch (error) {
      console.error('❌ Error closing Redis connection:', error)
    }
  }
  
  process.exit(0)
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

app.listen(PORT, () => {
  console.log(`🚀 Chat Aggregator Backend running on port ${PORT}`)
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`)
  console.log(`❤️  Health check: http://localhost:${PORT}/health`)
  
  if (redisClient) {
    console.log('✅ Redis client loaded')
  } else {
    console.log('⚠️  Running without Redis')
  }
})

module.exports = app