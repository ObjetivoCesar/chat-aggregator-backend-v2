const whisperService = require("./whisperService")
const platformDetector = require("./platformDetector")
const messageBuffer = require("./messageBuffer")

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
      if (type === "audio" && content) {
        console.log(`🎵 Processing audio message from ${channel}:${user_id}`)
        try {
          processedContent = await whisperService.transcribeAudio(content)
          console.log(`📝 Audio transcribed: "${processedContent}"`)
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
