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

// Multer disk storage para audios e imágenes
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const prefix = file.mimetype.startsWith('audio/') ? 'audio-' : 'image-';
    cb(null, prefix + uniqueSuffix + ext);
  }
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máx
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de audio o imagen'));
    }
  }
});

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

// Endpoint principal para recibir mensajes
router.post("/", limiter, upload.single("file"), validatePayload, async (req, res) => {
  try {
    let payload = req.body
    // Si viene un archivo, agregar la información al payload
    if (req.file) {
      const isAudio = req.file.mimetype.startsWith('audio/');
      const isImage = req.file.mimetype.startsWith('image/');
      
      payload = {
        ...payload,
        type: isAudio ? "audio" : isImage ? "image" : payload.type,
        filePath: req.file.path,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
      }
    }
    console.log("📨 Webhook received:", JSON.stringify(payload, null, 2))
    // Validación de esquema para canal web
    if (payload.channel === "web") {
      const hasText = (payload.type === "text" && (typeof payload.text === "string" || (payload.payload && typeof payload.payload.text === "string")));
      const hasAudio = (payload.type === "audio" && payload.audioFilePath);
      if (!payload.user_id || !payload.type || (!hasText && !hasAudio)) {
        console.error("❌ Payload web inválido:", JSON.stringify(payload));
        return res.status(400).json({ status: "error", message: "Formato de mensaje web inválido" });
      }
    }
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
    // Responder inmediatamente con mensaje de procesamiento y datos SSE
    res.status(200).json({
      status: "processing",
      message: "Mensaje recibido y en procesamiento",
      user_id: processedMessage.user_id,
      channel: processedMessage.channel,
      type: processedMessage.type,
      use_sse: true,
      sse_endpoint: `/sse/${processedMessage.user_id}?channel=${processedMessage.channel}`
    });
  } catch (error) {
    console.error("❌ Webhook error:", error)
    res.status(500).json({
      error: "Failed to process webhook",
      message: error.message,
    })
  }
})

// Endpoint SSE para recibir respuestas en tiempo real
router.get("/sse/:userId", (req, res) => {
  try {
    const userId = req.params.userId;
    const channel = req.query.channel || 'web';
    const sseManager = require("../services/sseManager");
    console.log(`🔌 SSE connection request for ${channel}:${userId}`);
    // Registrar conexión SSE
    sseManager.registerConnection(userId, channel, res);
    // Enviar mensaje inicial
    sseManager.sendMessage(userId, channel, "Conectado y esperando respuesta...", "status");
  } catch (error) {
    console.error("❌ SSE connection error:", error);
    res.status(500).json({
      error: "Failed to establish SSE connection",
      message: error.message,
    });
  }
});

module.exports = router
