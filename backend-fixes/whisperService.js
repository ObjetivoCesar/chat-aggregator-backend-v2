const axios = require("axios")
const FormData = require("form-data")
const fs = require("fs")
const path = require("path")

class WhisperService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY
    this.baseURL = "https://api.openai.com/v1/audio/transcriptions"
  }

  async transcribeAudio(audioPathOrUrl) {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured")
    }

    try {
      let audioStream;
      let filename = "audio.mp3";

      if (audioPathOrUrl.startsWith("http://") || audioPathOrUrl.startsWith("https://")) {
        // Descargar el archivo de audio remoto
        console.log(`🎵 Downloading audio from URL: ${audioPathOrUrl}`);
        const audioResponse = await axios.get(audioPathOrUrl, {
          responseType: "stream",
          timeout: 60000, // Aumentado a 60 segundos para descargas lentas
        });
        audioStream = audioResponse.data;
      } else {
        // Leer archivo local como stream
        console.log(`🎵 Using local audio file: ${audioPathOrUrl}`);
        if (!fs.existsSync(audioPathOrUrl)) {
          console.error(`❌ Audio file not found: ${audioPathOrUrl}`);
          throw new Error(`Audio file not found: ${audioPathOrUrl}`);
        }
        audioStream = fs.createReadStream(audioPathOrUrl);
        filename = path.basename(audioPathOrUrl);
      }

      // Crear FormData para enviar a Whisper
      const formData = new FormData();
      formData.append("file", audioStream, {
        filename: filename,
        contentType: "audio/mpeg",
      });
      formData.append("model", "whisper-1");

      // Agregar prompt personalizado si está configurado
      if (process.env.OPENAI_WHISPER_PROMPT) {
        formData.append("prompt", process.env.OPENAI_WHISPER_PROMPT);
      }

      console.log("🤖 Sending audio to Whisper API...");

      // Enviar a Whisper API
      const transcriptionResponse = await axios.post(this.baseURL, formData, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...formData.getHeaders(),
        },
        timeout: 90000, // Aumentado a 90 segundos para transcripciones largas
      });

      const transcription = transcriptionResponse.data.text;
      console.log(`✅ Transcription completed: "${transcription}"`);

      return transcription;
    } catch (error) {
      console.error("❌ Whisper transcription error:", error.response?.data || error.message);

      if (error.response?.status === 401) {
        throw new Error("Invalid OpenAI API key");
      } else if (error.response?.status === 429) {
        throw new Error("OpenAI API rate limit exceeded");
      } else if (error.code === "ECONNABORTED") {
        throw new Error("Audio transcription timeout");
      } else if (error.code === "ENOENT") {
        throw new Error(`Audio file not found: ${audioPathOrUrl}`);
      }

      throw new Error(`Audio transcription failed: ${error.message}`);
    }
  }
}

module.exports = new WhisperService();
