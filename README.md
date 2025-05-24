# Chat Aggregator Backend

Backend inteligente para agregación de mensajes de chatbots multicanal con transcripción de audio y compatibilidad con Make.com.

## 🚀 Características

- **Multicanal**: Soporte para Facebook Messenger, Instagram, WhatsApp y Web Chat
- **Buffering Inteligente**: Agrupa mensajes durante 20 segundos para respuestas coherentes
- **Transcripción de Audio**: Convierte mensajes de voz a texto usando Whisper de OpenAI
- **Filtrado de Echo**: Elimina automáticamente mensajes echo de todas las plataformas
- **Integración Make.com**: Envía mensajes procesados a webhooks de Make.com
- **Redis**: Almacenamiento temporal escalable para múltiples conversaciones

## 📋 Requisitos

- Node.js 18+
- Redis (local o remoto)
- Cuenta OpenAI (para transcripción de audio)
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
PORT=3000
NODE_ENV=production

# Redis
REDIS_URL=redis://localhost:6379

# OpenAI
OPENAI_API_KEY=sk-tu-clave-openai-aqui
OPENAI_WHISPER_PROMPT="Transcribe este mensaje de audio con precisión."

# Make.com
MAKE_WEBHOOK_URL=https://hook.make.com/tu-webhook-url-aqui

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

**Estructura JSON esperada:**
\`\`\`json
{
  "user_id": "web_user_123",
  "channel": "web",
  "type": "text",
  "payload": {
    "text": "Mensaje desde web"
  }
}
\`\`\`

**Para audio:**
\`\`\`json
{
  "user_id": "web_user_123",
  "channel": "web",
  "type": "audio",
  "payload": {
    "audio_url": "https://audio-url.com/file.mp3"
  }
}
\`\`\`

## 🔄 Flujo de Procesamiento

1. **Recepción**: Webhook recibe mensaje en \`POST /webhook\`
2. **Detección**: Identifica plataforma y extrae datos
3. **Filtrado**: Elimina mensajes echo automáticamente
4. **Transcripción**: Si es audio, convierte a texto con Whisper
5. **Buffering**: Agrega al buffer Redis con timer de 20s
6. **Agregación**: Combina todos los mensajes del buffer
7. **Envío**: Envía mensaje consolidado a Make.com
8. **Limpieza**: Elimina datos del buffer

## 📡 Endpoints

### POST /webhook
Recibe mensajes de todas las plataformas.

**Respuesta exitosa:**
\`\`\`json
{
  "status": "received",
  "user_id": "123456",
  "channel": "whatsapp",
  "type": "text"
}
\`\`\`

### GET /health
Verifica el estado del servicio.

**Respuesta:**
\`\`\`json
{
  "status": "up",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "redis": "connected",
    "openai": "configured",
    "make_webhook": "configured"
  }
}
\`\`\`

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
MAKE_WEBHOOK_URL=https://hook.make.com/tu-webhook
\`\`\`

### 4. Redis en Render

Puedes usar:
- **Redis Labs** (recomendado)
- **Upstash Redis**
- **Redis interno de Render**

### 5. Desplegar

Haz push a tu repositorio y Render desplegará automáticamente.

## 🔧 Configuración de Make.com

### Payload enviado a Make.com

\`\`\`json
{
  "user_id": "123456789",
  "channel": "whatsapp",
  "text": "Mensaje combinado de todos los fragmentos recibidos en 20 segundos"
}
\`\`\`

### Configurar webhook en Make.com

1. Crea un nuevo escenario
2. Agrega un trigger "Webhook"
3. Copia la URL del webhook
4. Configúrala en \`MAKE_WEBHOOK_URL\`

## 🧪 Testing

### Test del webhook

\`\`\`bash
curl -X POST http://localhost:3000/webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_id": "test_user",
    "channel": "web",
    "type": "text",
    "payload": { "text": "Mensaje de prueba" }
  }'
\`\`\`

### Test de salud

\`\`\`bash
curl http://localhost:3000/health
\`\`\`

## 📊 Monitoreo

El backend incluye logs detallados:

- ✅ Mensajes procesados exitosamente
- ⚠️ Mensajes filtrados (echo)
- 🎵 Transcripciones de audio
- ⏰ Timers iniciados/completados
- 🚀 Envíos a Make.com
- ❌ Errores y fallos

## 🔒 Seguridad

- Validación de entrada en todos los endpoints
- Rate limiting (configurable)
- Headers de seguridad con Helmet
- Sanitización de datos
- Logs sin información sensible

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama feature (\`git checkout -b feature/nueva-funcionalidad\`)
3. Commit tus cambios (\`git commit -am 'Agregar nueva funcionalidad'\`)
4. Push a la rama (\`git push origin feature/nueva-funcionalidad\`)
5. Crea un Pull Request

## 📄 Licencia

MIT License - ver archivo [LICENSE](LICENSE) para detalles.

## 🆘 Soporte

Si encuentras problemas:

1. Revisa los logs del servidor
2. Verifica la configuración de Redis
3. Confirma las variables de entorno
4. Abre un issue en GitHub

---

**Desarrollado por Manus** 🤖
\`\`\`
