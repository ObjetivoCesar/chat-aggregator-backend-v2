const { OpenAI } = require("openai");
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configurar Cloudinary
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'du32btjke', 
  api_key: process.env.CLOUDINARY_API_KEY || '479141314328389', 
  api_secret: process.env.CLOUDINARY_API_SECRET || 'VlQghKectWopFqAyZdU1AbY_g84'
});

class VisionService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzeImage(imagePath) {
    let publicId = null;
    try {
      console.log("📸 Procesando imagen:", imagePath);
      
      // Verificar que el archivo existe
      if (!fs.existsSync(imagePath)) {
        console.error("❌ El archivo de imagen no existe:", imagePath);
        throw new Error("Image file not found");
      }
      
      // Subir imagen a Cloudinary con una etiqueta para facilitar la eliminación posterior
      console.log("☁️ Subiendo imagen a Cloudinary...");
      const timestamp = new Date().getTime();
      const uploadResult = await cloudinary.uploader.upload(imagePath, {
        folder: "chat-aggregator-temp",
        public_id: `temp-${timestamp}`,
        tags: ["temp", "auto-delete"],
        resource_type: "image"
      });
      
      publicId = uploadResult.public_id;
      const imageUrl = uploadResult.secure_url;
      console.log("✅ Imagen subida a Cloudinary:", imageUrl, "Public ID:", publicId);
      
      // Usar la URL pública con OpenAI
      console.log("🧠 Enviando imagen a OpenAI para análisis...");
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
      
      // Eliminar la imagen de Cloudinary después de procesarla
      try {
        console.log("🗑️ Eliminando imagen de Cloudinary:", publicId);
        await cloudinary.uploader.destroy(publicId);
        console.log("✅ Imagen eliminada de Cloudinary");
      } catch (cloudinaryError) {
        console.warn("⚠️ No se pudo eliminar la imagen de Cloudinary:", cloudinaryError);
      }
      
      // Eliminar el archivo local después de procesarlo
      try {
        fs.unlinkSync(imagePath);
        console.log("🗑️ Archivo local eliminado:", imagePath);
      } catch (deleteError) {
        console.warn("⚠️ No se pudo eliminar el archivo local:", deleteError);
      }
      
      return response.choices[0].message.content;
    } catch (error) {
      console.error("❌ Error analyzing image:", error);
      
      // Intentar eliminar la imagen de Cloudinary en caso de error
      if (publicId) {
        try {
          console.log("🗑️ Eliminando imagen de Cloudinary después de error:", publicId);
          await cloudinary.uploader.destroy(publicId);
          console.log("✅ Imagen eliminada de Cloudinary");
        } catch (cloudinaryError) {
          console.warn("⚠️ No se pudo eliminar la imagen de Cloudinary:", cloudinaryError);
        }
      }
      
      // Intentar eliminar el archivo local en caso de error
      try {
        if (imagePath && fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log("🗑️ Archivo local eliminado después de error:", imagePath);
        }
      } catch (deleteError) {
        console.warn("⚠️ No se pudo eliminar el archivo local:", deleteError);
      }
      
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }
  
  // Método para limpiar imágenes temporales antiguas de Cloudinary (puede ejecutarse periódicamente)
  async cleanupTempImages(maxAgeHours = 24) {
    try {
      console.log("🧹 Iniciando limpieza de imágenes temporales en Cloudinary...");
      
      // Buscar imágenes con la etiqueta "temp" o en la carpeta "chat-aggregator-temp"
      const result = await cloudinary.search
        .expression('resource_type:image AND tags=temp OR folder=chat-aggregator-temp')
        .sort_by('created_at', 'desc')
        .max_results(500)
        .execute();
      
      if (!result.resources || result.resources.length === 0) {
        console.log("✅ No se encontraron imágenes temporales para limpiar");
        return;
      }
      
      console.log(`🔍 Encontradas ${result.resources.length} imágenes temporales`);
      
      const now = new Date();
      const deletePromises = [];
      
      for (const resource of result.resources) {
        const createdAt = new Date(resource.created_at);
        const ageHours = (now - createdAt) / (1000 * 60 * 60);
        
        if (ageHours > maxAgeHours) {
          console.log(`🗑️ Eliminando imagen antigua (${Math.round(ageHours)}h): ${resource.public_id}`);
          deletePromises.push(cloudinary.uploader.destroy(resource.public_id));
        }
      }
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`✅ Eliminadas ${deletePromises.length} imágenes temporales antiguas`);
      } else {
        console.log("✅ No hay imágenes temporales que superen el tiempo máximo");
      }
    } catch (error) {
      console.error("❌ Error limpiando imágenes temporales:", error);
    }
  }
}

module.exports = new VisionService();
