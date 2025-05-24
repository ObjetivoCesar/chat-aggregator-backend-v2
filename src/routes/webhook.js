const express = require("express")
const router = express.Router()
const messageProcessor = require("../services/messageProcessor")
const messageBuffer = require("../services/messageBuffer")
const rateLimit = require("express-rate-limit")

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 peticiones por ventana
  message: "Too many requests from this IP, please try again later"
})

// Validación de payload
const validatePayload = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: "Empty payload" })
  }
  if (JSON.stringify(req.body).length > 1024 * 1024) { // 1MB
    return res.status(413).json({ error: "Payload too large" })
  }
  next()
}

router.post("/", limiter, validatePayload, async (req, res) => {
  try {
    console.log("📨 Webhook received:", JSON.stringify(req.body, null, 2))
    // Procesar el mensaje según la plataforma
    const processedMessage = await messageProcessor.processIncomingMessage(req.body)
    if (!processedMessage) {
      console.log("⚠️  Message filtered out (echo or invalid)")
      return res.status(200).json({ status: "filtered" })
    }
    console.log("✅ Processed message:", processedMessage)
    // Agregar al buffer (solo guardar, no procesar)
    await messageBuffer.addMessage(processedMessage)
    res.status(200).json({
      status: "received",
      user_id: processedMessage.user_id,
      channel: processedMessage.channel,
      type: processedMessage.type,
    })
  } catch (error) {
    console.error("❌ Webhook error:", error)
    res.status(500).json({
      error: "Failed to process webhook",
      message: error.message,
    })
  }
})

module.exports = router
