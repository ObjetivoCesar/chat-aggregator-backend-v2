const { OpenAI } = require("openai");

class VisionService {
  constructor() {
    console.log("🔑 Verificando configuración de OpenAI...");
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY no está configurada");
    } else {
      console.log("✅ OPENAI_API_KEY está configurada");
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzeImage(imageUrl) {
    try {
      console.log("🔍 Iniciando análisis de imagen con OpenAI...");
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Eres un asistente especializado en extraer texto de imágenes. Tu misión es analizar la imagen adjunta y devolver todo el texto exacto manteniendo el orden y saltos de línea tal como aparecen." 
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 500
      });

      console.log("✅ Análisis de imagen completado");
      return response.choices[0].message.content;
    } catch (error) {
      console.error("❌ Error analyzing image:", error);
      throw new Error("Failed to analyze image");
    }
  }
}

module.exports = new VisionService(); 