const express = require("express")
const router = express.Router()
const messageProcessor = require("../services/messageProcessor")
const messageBuffer = require("../services/messageBuffer")
const rateLimit = require("express-rate-limit")
const multer = require("multer")
const fs = require("fs")
const path = require("path")

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 peticiones por ventana
  message: "Too many requests from this IP, please try again later"
})

// Multer disk storage para audios
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'audio-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB máx

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

router.post("/", limiter, upload.single("audio"), validatePayload, async (req, res) => {
  try {
    let payload = req.body
    // Si viene un archivo de audio, agregar la ruta al payload
    if (req.file) {
      payload = {
        ...payload,
        type: "audio",
        audioFilePath: req.file.path,
        audioOriginalName: req.file.originalname,
        audioMimetype: req.file.mimetype,
      }
    }
    console.log("📨 Webhook received:", JSON.stringify(payload, null, 2))
    // Procesar el mensaje según la plataforma
    const processedMessage = await messageProcessor.processIncomingMessage(payload)
    if (!processedMessage) {
      console.log("⚠️  Message filtered out (echo or invalid)")
      // Limpiar archivo temporal si existe
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(200).json({ status: "filtered" })
    }
    console.log("✅ Processed message:", processedMessage)
    // Agregar al buffer (solo guardar, no procesar)
    await messageBuffer.addMessage(processedMessage)
    // Limpiar archivo temporal si existe
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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
