const { OpenAI } = require("openai");

class VisionService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzeImage(imageUrl) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe detalladamente lo que ves en esta imagen. Sé específico y descriptivo." },
              {
                type: "image_url",
                image_url: imageUrl
              }
            ]
          }
        ],
        max_tokens: 500
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("❌ Error analyzing image:", error);
      throw new Error("Failed to analyze image");
    }
  }
}

module.exports = new VisionService(); 