const axios = require("axios")
const FormData = require("form-data")

class WhisperService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY
    this.baseURL = "https://api.openai.com/v1/audio/transcriptions"
  }

  async transcribeAudio(audioUrl) {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured")
    }

    try {
      console.log(`🎵 Downloading audio from: ${audioUrl}`)

      // Descargar el archivo de audio
      const audioResponse = await axios.get(audioUrl, {
        responseType: "stream",
        timeout: 30000,
      })

      // Crear FormData para enviar a Whisper
      const formData = new FormData()
      formData.append("file", audioResponse.data, {
        filename: "audio.mp3",
        contentType: "audio/mpeg",
      })
      formData.append("model", "whisper-1")

      // Agregar prompt personalizado si está configurado
      if (process.env.OPENAI_WHISPER_PROMPT) {
        formData.append("prompt", process.env.OPENAI_WHISPER_PROMPT)
      }

      console.log("🤖 Sending audio to Whisper API...")

      // Enviar a Whisper API
      const transcriptionResponse = await axios.post(this.baseURL, formData, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...formData.getHeaders(),
        },
        timeout: 60000,
      })

      const transcription = transcriptionResponse.data.text
      console.log(`✅ Transcription completed: "${transcription}"`)

      return transcription
    } catch (error) {
      console.error("❌ Whisper transcription error:", error.response?.data || error.message)

      if (error.response?.status === 401) {
        throw new Error("Invalid OpenAI API key")
      } else if (error.response?.status === 429) {
        throw new Error("OpenAI API rate limit exceeded")
      } else if (error.code === "ECONNABORTED") {
        throw new Error("Audio transcription timeout")
      }

      throw new Error(`Audio transcription failed: ${error.message}`)
    }
  }
}

module.exports = new WhisperService()
