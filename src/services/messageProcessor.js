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

      // Si es audio, transcribir con Whisper
      if (type === "audio" && (content || payload.audioBuffer)) {
        console.log(`🎵 Processing audio message from ${channel}:${user_id}`)
        try {
          let audioUrl = content;
          let tempFile, mp3File;
          // Si viene como buffer (desde el widget), guardarlo temporalmente y convertirlo a mp3
          if (payload.audioBuffer) {
            const tempDir = path.join(__dirname, "../../tmp");
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            const ext = payload.audioOriginalName ? path.extname(payload.audioOriginalName) : '.ogg';
            tempFile = path.join(tempDir, `${user_id}_${Date.now()}${ext}`);
            fs.writeFileSync(tempFile, Buffer.from(payload.audioBuffer.data));
            // Convertir a mp3
            mp3File = tempFile.replace(/\.[^/.]+$/, ".mp3");
            await new Promise((resolve, reject) => {
              ffmpeg(tempFile)
                .toFormat('mp3')
                .on('end', resolve)
                .on('error', reject)
                .save(mp3File);
            });
            audioUrl = mp3File;
          }
          processedContent = await whisperService.transcribeAudio(audioUrl);
          console.log(`📝 Audio transcribed: "${processedContent}"`);
          // Eliminar archivos temporales si se crearon
          if (payload.audioBuffer) {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
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
