const whisperService = require("./whisperService")
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
      let isFirstAudio = false
      let timerKey = `${channel}_${user_id}`

      // Log para ver el payload recibido
      console.log("Payload recibido en processIncomingMessage:", JSON.stringify(payload, null, 2));

      // Si es audio, transcribir con Whisper
      if (type === "audio" && (content || payload.audioFilePath)) {
        console.log("Entrando al bloque de procesamiento de audio. content:", content, "audioFilePath:", payload.audioFilePath);
        let tempFile, mp3File;
        try {
          let audioPath = content;
          if (payload.audioFilePath) {
            audioPath = payload.audioFilePath;
            // Convertir a mp3
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
          }
          console.log("Enviando a Whisper:", audioPath);
          processedContent = await whisperService.transcribeAudio(audioPath);
          console.log(`📝 Audio transcribed: "${processedContent}"`);
          // Limpiar archivos temporales si se crearon
          if (payload.audioFilePath) {
            if (fs.existsSync(payload.audioFilePath)) fs.unlinkSync(payload.audioFilePath);
            if (fs.existsSync(mp3File)) fs.unlinkSync(mp3File);
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
