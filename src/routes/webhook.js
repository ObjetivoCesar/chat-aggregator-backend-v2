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
router.post("/", limiter, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), validatePayload, async (req, res) => {
  let audioFile, imageFile;
  try {
    let payload = req.body
    // Si viene un archivo, agregar la información al payload
    if (req.files) {
      audioFile = req.files['audio']?.[0];
      imageFile = req.files['image']?.[0];
      
      if (audioFile) {
        payload = {
          ...payload,
          type: "audio",
          filePath: audioFile.path,
          originalName: audioFile.originalname,
          mimetype: audioFile.mimetype,
        }
      } else if (imageFile) {
        payload = {
          ...payload,
          type: "image",
          filePath: imageFile.path,
          originalName: imageFile.originalname,
          mimetype: imageFile.mimetype,
        }
      }
    }
    console.log("📨 Webhook received:", JSON.stringify(payload, null, 2))
    // Validar payload según el canal
    if (payload.channel === 'web') {
      if (!payload.user_id || !payload.channel || !payload.type) {
        console.log(`❌ Payload web inválido:`, payload);
        return res.status(400).json({ error: 'Payload inválido' });
      }
      
      // Validar campos específicos según el tipo
      if (payload.type === 'text' && !payload.text) {
        console.log(`❌ Payload web inválido: Falta campo 'text'`);
        return res.status(400).json({ error: 'Campo text requerido para mensajes de texto' });
      }
      
      if (payload.type === 'image' && !payload.filePath) {
        console.log(`❌ Payload web inválido: Falta campo 'filePath'`);
        return res.status(400).json({ error: 'Campo filePath requerido para imágenes' });
      }
      
      if (payload.type === 'audio' && !payload.filePath) {
        console.log(`❌ Payload web inválido: Falta campo 'filePath'`);
        return res.status(400).json({ error: 'Campo filePath requerido para audio' });
      }
    }
    // Procesar el mensaje según la plataforma
    const processedMessage = await messageProcessor.processIncomingMessage(payload)
    if (!processedMessage) {
      console.log("⚠️  Message filtered out (echo or invalid)")
      // Limpiar archivo temporal si existe
      if (req.files && audioFile && fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
      if (req.files && imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
      return res.status(200).json({ status: "filtered" })
    }
    console.log("✅ Processed message:", processedMessage)
    
    // NO eliminar los archivos aquí - ahora se eliminan en visionService.js y whisperService.js
    // después de procesarlos correctamente
    
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
    
    // En caso de error, limpiar archivos temporales
    if (req.files && audioFile && fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
    if (req.files && imageFile && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    
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
