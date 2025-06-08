# Chat Aggregator Backend

Backend inteligente para agregación de mensajes de chatbots multicanal con transcripción de audio, análisis de imágenes y compatibilidad con Make.com.

## 🚀 Características

- **Multicanal**: Soporte para Facebook Messenger, Instagram, WhatsApp y Web Chat
- **Buffering Inteligente**: Agrupa mensajes durante 20 segundos para respuestas coherentes, con manejo de duplicados.
- **Transcripción de Audio**: Convierte mensajes de voz a texto usando Whisper de OpenAI.
- **Análisis de Imágenes**: Extrae texto de imágenes usando OpenAI Vision API (`gpt-4o-mini`).
- **Gestión Temporal de Imágenes**: Sube imágenes a Cloudinary temporalmente para análisis y las elimina automáticamente después.
- **Filtrado de Echo**: Elimina automáticamente mensajes echo de todas las plataformas.
- **Integración Make.com**: Envía mensajes procesados y agregados a webhooks de Make.com.
- **Redis**: Almacenamiento temporal escalable para múltiples conversaciones y buffer de mensajes.
- **Gestión Robusta de SSE**: Manejo mejorado de conexiones Server-Sent Events para comunicación en tiempo real con el frontend, incluyendo reconexión automática y pings.

## 📋 Requisitos

- Node.js 18+
- Redis (local o remoto)
- Cuenta OpenAI (para transcripción de audio y análisis de imágenes)
- Cuenta Cloudinary (para gestión temporal de imágenes subidas desde el Web Chat)
- Webhook de Make.com configurado

## 🛠️ Instalación

### 1. Clonar el repositorio

\`\`\`bash
git clone https://github.com/tu-usuario/chat-aggregator-backend.git
cd chat-aggregator-backend
\`\`\`

### 2. Instalar dependencias

\`\`\`bash
npm install
\`\`\`

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y configura tus variables:

\`\`\`bash
cp .env.example .env
\`\`\`

Edita el archivo \`.env\` con tus configuraciones:

\`\`\`env
# Configuración del servidor
PORT=10000
NODE_ENV=production

# Redis
REDIS_URL=redis://localhost:6379

# OpenAI
OPENAI_API_KEY=sk-tu-clave-openai-aqui
OPENAI_WHISPER_PROMPT="Transcribe este mensaje de audio con precisión."
# Opcional: Prompt para el análisis de visión si se gestiona desde .env
# OPENAI_VISION_PROMPT="Eres un asistente especializado en extraer texto de imágenes..."

# Cloudinary (Necesario si usas la funcionalidad de subida de imágenes en Web Chat)
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

# Make.com
MAKE_WEBHOOK_URL=https://hook.us2.make.com/s2syufrq4vmd5no2p17e2kxr1oy6rlcu

# Tokens de plataformas (opcional)
FB_PAGE_ACCESS_TOKEN=tu-token-facebook
WHATSAPP_ACCESS_TOKEN=tu-token-whatsapp
WHATSAPP_PHONE_NUMBER_ID=tu-numero-whatsapp
\`\`\`

### 4. Ejecutar la aplicación

**Desarrollo:**
\`\`\`bash
npm run dev
\`\`\`

**Producción:**
\`\`\`bash
npm start
\`\`\`

## 🔧 Configuración por Plataforma

### Facebook Messenger

**Estructura JSON esperada:**
\`\`\`json
{
  "object": "page",
  "entry": [{
    "messaging": [{
      "sender": { "id": "USER_ID" },
      "message": {
        "text": "Mensaje de texto",
        "is_echo": false,
        "attachments": [{
          "type": "audio",
          "payload": { "url": "https://audio-url.com/file.mp3" }
        }]
      }
    }]
  }]
}
\`\`\`

**Campos clave:**
- \`sender.id\`: ID del usuario
- \`message.is_echo\`: Detecta mensajes echo
- \`attachments[0].payload.url\`: URL del archivo de audio

### WhatsApp Cloud API

**Estructura JSON esperada:**
\`\`\`json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "contacts": [{ "wa_id": "USER_PHONE" }],
        "messages": [{
          "from": "USER_PHONE",
          "type": "text",
          "text": { "body": "Mensaje de texto" }
        }]
      }
    }]
  }]
}
\`\`\`

**Para audio:**
\`\`\`json
{
  "messages": [{
    "type": "audio",
    "audio": { "url": "https://audio-url.com/file.mp3" }
  }]
}
\`\`\`

**Campos clave:**
- \`contacts[0].wa_id\`: Número de WhatsApp del usuario
- \`messages[0].type\`: Tipo de mensaje ("text" o "audio")
- \`messages[0].audio.url\`: URL del archivo de audio

### Instagram Messaging

**Estructura idéntica a Facebook Messenger** con \`"object": "instagram"\`

### Web Chat (Formato personalizado)

**Estructura JSON esperada para texto, audio o imagen (subidos como \`multipart/form-data\`):**
\`\`\`json
{
  "user_id": "web_user_123",
  "channel": "web",
  "type": "text", // o "audio", "image"
  "payload": {
    "text": "Mensaje desde web" // presente si type es "text"
    // Para audio/imagen, el archivo se envía en el campo 'audio' o 'image'
  }
}
\`\`\`

**Campos clave:**
- \`user_id\`: ID del usuario web
- \`channel\`: Debe ser "web"
- \`type\`: Tipo de mensaje ("text", "audio", "image")
- \`payload.text\`: Contenido del mensaje de texto (si aplica)
- Archivo: Enviado como \`multipart/form-data\` bajo el nombre del campo \`audio\` o \`image\`.

## 🔄 Flujo de Procesamiento Actualizado

1. **Recepción**: Webhook recibe mensaje en \`POST /webhook\`. Archivos (audio/imagen de Web Chat) son gestionados por Multer.
2. **Detección y Validación**: Identifica plataforma y extrae datos. Valida la estructura del payload según el canal y tipo de mensaje.
3. **Filtrado**: Elimina mensajes echo automáticamente.
4. **Procesamiento Multimedia**: Si es audio (de cualquier canal) o imagen (de Web Chat):
   - **Audio**: Convierte a texto usando Whisper.
   - **Imagen (Web Chat)**: Sube a Cloudinary temporalmente, obtiene URL, analiza con OpenAI Vision API (\`gpt-4o-mini\`) para extraer texto, y **elimina la imagen de Cloudinary inmediatamente**.
5. **Buffering Inteligente**: Agrega el contenido procesado (texto normal, transcripción de audio prefijada con '[Audio]', texto de imagen prefijado con '[Imagen]') al buffer Redis con un timer de 20s. Maneja duplicados.
6. **Agregación**: Al expirar el timer (o recibir un nuevo mensaje que extienda el timer), combina todos los mensajes del buffer para ese usuario/canal.
7. **Envío a Make.com**: Envía el mensaje consolidado al webhook de Make.com.
8. **Envío al Widget (Web Chat)**: La respuesta de Make.com es enviada de vuelta al backend y luego reenviada al widget a través de la conexión SSE.
9. **Limpieza Local**: Elimina archivos temporales locales (si aplica) después del procesamiento.

## 📡 Endpoints

### POST /webhook
Recibe mensajes de todas las plataformas. Ahora maneja \`multipart/form-data\` para subidas de archivos de Web Chat.

**Respuesta exitosa:**
\`\`\`json
{
  "status": "received",
  "user_id": "123456",
  "channel": "whatsapp",
  "type": "text", // o "audio", "image"
  "sse_endpoint": "/sse/user_123456/web" // solo para Web Chat
}
\`\`\`

La respuesta para Web Chat incluye un \`sse_endpoint\` para que el widget se conecte y reciba actualizaciones en tiempo real (como la respuesta de Make.com).

### GET /health
Verifica el estado del servicio y sus dependencias.

**Respuesta:**
\`\`\`json
{
  "status": "up",
  "timestamp": "...",
  "services": {
    "redis": "connected" || "disconnected",
    "openai": "configured" || "not configured", // Verifica si OPENAI_API_KEY está presente
    "cloudinary": "configured" || "not configured", // Verifica si CLOUDINARY_URL está presente
    "make_webhook": "configured" || "not configured"
  }
}
\`\`\`

### GET /sse/:userId/:channel
Establece una conexión Server-Sent Events (SSE) con el cliente (usado por el widget Web Chat).

## 🚀 Despliegue en Render

### 1. Conectar repositorio

1. Ve a [Render.com](https://render.com)
2. Crea una nueva "Web Service"
3. Conecta tu repositorio de GitHub

### 2. Configurar el servicio

**Build Command:**
\`\`\`bash
npm install
\`\`\`

**Start Command:**
\`\`\`bash
npm start
\`\`\`

**Environment:**
- Node.js
- Auto-deploy: Yes

### 3. Variables de entorno

Agrega estas variables en la configuración de Render:

\`\`\`
PORT=10000
NODE_ENV=production
REDIS_URL=redis://tu-redis-url:6379
OPENAI_API_KEY=sk-tu-clave-openai
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name # Necesario para Web Chat Image Upload
MAKE_WEBHOOK_URL=https://hook.us2.make.com/s2syufrq4vmd5no2p17e2kxr1oy6rlcu
# Opcional: OPENAI_WHISPER_PROMPT="Transcribe este mensaje..."
# Opcional: OPENAI_VISION_PROMPT="Eres un asistente..."
\`\`\`

### 4. Configuración de Webhooks

Configura los webhooks en las plataformas correspondientes (Facebook, Instagram, WhatsApp) apuntando a la URL de tu servicio en Render + \`/webhook\` (ej: \`https://your-service-name.onrender.com/webhook\`).

Para Web Chat, integra el código del widget en tu página web, asegurándote de configurar \`widgetConfig.apiUrl\` a la URL de tu servicio en Render.

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor, abre un issue o envía un Pull Request con tus mejoras.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo \`LICENSE\` para más detalles.

## 🆘 Soporte

Si encuentras problemas:

1. Revisa los logs del servidor
2. Verifica la configuración de Redis
3. Confirma las variables de entorno
4. Abre un issue en GitHub

---

**Desarrollado por Manus** 🤖
\`\`\`
