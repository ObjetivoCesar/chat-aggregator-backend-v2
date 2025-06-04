const whisperService = require("./whisperService")
const visionService = require("./visionService")
const platformDetector = require("./platformDetector")
const messageBuffer = require("./messageBuffer")
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

class MessageProcessor {
  async processIncomingMessage(payload) {
    try {
      // Detectar plataforma y extraer datos
      const platformData = platformDetector.detectPlatform(payload)

      if (!platformData) {
        console.log("⚠️  Could not detect platform or extract data")
        return null
      }

      const { channel, user_id, type, content, is_echo } = platformData

      // Filtrar mensajes echo
      if (is_echo) {
        console.log(`🔄 Filtering echo message from ${channel}:${user_id}`)
        return null
      }

      let processedContent = content
      let timerKey = `${channel}_${user_id}`

      // Log para ver el payload recibido
      console.log("Payload recibido en processIncomingMessage:", JSON.stringify(payload, null, 2));

      // Si es audio, transcribir con Whisper
      if (type === "audio" && (content || payload.filePath)) {
        console.log("Entrando al bloque de procesamiento de audio. content:", content, "filePath:", payload.filePath);
        let tempFile, mp3File;
        try {
          let audioPath = content;
          if (payload.filePath) {
            audioPath = payload.filePath;
            const ext = path.extname(audioPath).toLowerCase();
            if (ext !== '.mp3') {
              mp3File = audioPath.replace(/\.[^/.]+$/, ".mp3");
              await new Promise((resolve, reject) => {
                ffmpeg(audioPath)
                  .output(mp3File)
                  .audioCodec('libmp3lame')
                  .on('end', resolve)
                  .on('error', reject)
                  .run();
              });
              audioPath = mp3File;
            } else {
              mp3File = null; // No se crea archivo temporal mp3
            }
          }
          console.log("Enviando a Whisper:", audioPath);
          processedContent = await whisperService.transcribeAudio(audioPath);
          console.log(`📝 Audio transcribed: "${processedContent}"`);
          // Limpiar archivos temporales si se crearon
          if (payload.filePath) {
            if (fs.existsSync(payload.filePath)) fs.unlinkSync(payload.filePath);
            if (mp3File && fs.existsSync(mp3File)) fs.unlinkSync(mp3File);
          }
        } catch (error) {
          console.error("❌ Audio transcription failed:", error)
          processedContent = "[Audio transcription failed]"
        }
      }
      // Si es imagen, analizar con Vision API
      else if (type === "image" && (content || payload.filePath)) {
        try {
          const imagePath = payload.filePath || content;
          console.log("📸 Processing image:", imagePath);
          processedContent = await visionService.analyzeImage(imagePath);
          console.log(`📝 Image analyzed: "${processedContent}"`);
          // Limpiar archivo temporal si existe
          if (payload.filePath && fs.existsSync(payload.filePath)) {
            fs.unlinkSync(payload.filePath);
          }
        } catch (error) {
          console.error("❌ Image analysis failed:", error)
          processedContent = "[Image analysis failed]"
        }
      }

      const processedMessage = {
        user_id,
        channel,
        type: type === "audio" ? "audio_transcribed" : type === "image" ? "image_analyzed" : type,
        content: processedContent,
        timestamp: new Date().toISOString(),
        original_type: type,
        transcription_done: type === "audio" || type === "image"
      }

      // Agregar el mensaje al buffer
      await messageBuffer.addMessage(processedMessage)

      // Iniciar el temporizador SOLO si no hay uno activo
      if (!messageBuffer.timers.has(timerKey)) {
        console.log(`⏱️ Starting 20s timer for ${channel}:${user_id} after processing ${type}`);
        messageBuffer.startFlushTimer(timerKey, channel, user_id)
      }

      return processedMessage
    } catch (error) {
      console.error("❌ Error processing message:", error)
      throw error
    }
  }
}

module.exports = new MessageProcessor()
