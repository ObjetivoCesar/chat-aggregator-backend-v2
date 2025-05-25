const whisperService = require("./whisperService")
const platformDetector = require("./platformDetector")
const messageBuffer = require("./messageBuffer")
const fs = require("fs");
const path = require("path");

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
      let isFirstAudio = false
      let timerKey = `${channel}_${user_id}`

      // Si es audio, transcribir con Whisper
      if (type === "audio" && (content || payload.audioBuffer)) {
        console.log(`🎵 Processing audio message from ${channel}:${user_id}`)
        try {
          let audioUrl = content;
          // Si viene como buffer (desde el widget), guardarlo temporalmente y obtener la ruta local
          if (payload.audioBuffer) {
            const tempDir = path.join(__dirname, "../../tmp");
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            const tempFile = path.join(tempDir, `${user_id}_${Date.now()}.mp3`);
            fs.writeFileSync(tempFile, Buffer.from(payload.audioBuffer.data));
            audioUrl = tempFile;
          }
          processedContent = await whisperService.transcribeAudio(audioUrl);
          console.log(`📝 Audio transcribed: "${processedContent}"`);
          // Eliminar archivo temporal si se creó
          if (payload.audioBuffer) {
            fs.unlinkSync(audioUrl);
          }
          // Verificar si es el primer mensaje de audio (no hay temporizador activo)
          if (!messageBuffer.timers.has(timerKey)) {
            isFirstAudio = true
          }
        } catch (error) {
          console.error("❌ Audio transcription failed:", error)
          processedContent = "[Audio transcription failed]"
        }
      }

      const processedMessage = {
        user_id,
        channel,
        type: type === "audio" ? "audio_transcribed" : type,
        content: processedContent,
        timestamp: new Date().toISOString(),
        original_type: type,
        transcription_done: type === "audio"
      }

      // Si es el primer audio, programa el temporizador después de la transcripción
      if (isFirstAudio) {
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
