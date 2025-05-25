# Chat Aggregator Backend

Backend para agregar mensajes de diferentes plataformas (Facebook, WhatsApp, Instagram, Web) y enviarlos a Make.com después de un período de acumulación de 20 segundos.

## Características

- Recibe mensajes de múltiples plataformas a través de un único endpoint webhook
- Soporta tanto mensajes JSON como archivos de audio subidos desde widgets web
- Filtra mensajes "echo" de Facebook Messenger, Instagram y WhatsApp
- Detecta automáticamente el tipo de mensaje (texto vs. audio)
- Procesa archivos de audio usando la API de OpenAI Whisper
- Agrupa mensajes del mismo usuario durante 20 segundos
- Envía mensajes agrupados a Make.com

## Requisitos

- Node.js 14 o superior
- Redis
- FFmpeg (para conversión de archivos de audio)
- Cuenta de OpenAI (para la API de Whisper)
- Cuenta de Make.com

## Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/tu-usuario/chat-aggregator-backend.git
cd chat-aggregator-backend
```

2. Instalar dependencias:
```bash
npm install
```

3. Crear archivo `.env` basado en `.env.example`:
```bash
cp .env.example .env
```

4. Configurar variables de entorno en el archivo `.env`:
```
PORT=3000
REDIS_URL=redis://usuario:contraseña@host:puerto
OPENAI_API_KEY=tu_clave_api_openai
MAKE_WEBHOOK_URL=https://hook.us2.make.com/tu_webhook_id
FB_PAGE_ACCESS_TOKEN=tu_token_de_acceso_facebook
```

5. Asegurarse de que FFmpeg esté instalado:
```bash
# En Ubuntu/Debian
sudo apt-get install ffmpeg

# En macOS con Homebrew
brew install ffmpeg

# En Windows con Chocolatey
choco install ffmpeg
```

6. Iniciar el servidor:
```bash
npm start
```

## Endpoints

### POST /webhook

Recibe mensajes de diferentes plataformas, los procesa y los agrupa.

#### Modos de recepción:

1. **JSON** - Para plataformas como Facebook, WhatsApp, Instagram:
   ```
   Content-Type: application/json
   ```

2. **Multipart/form-data** - Para widgets web con archivos de audio:
   ```
   Content-Type: multipart/form-data
   ```
   Con campo `audio` para el archivo de audio.

#### Ejemplos de payload por plataforma:

##### Facebook Messenger

```json
{
  "object": "page",
  "entry": [
    {
      "id": "page_id",
      "time": 1458692752478,
      "messaging": [
        {
          "sender": {
            "id": "user_id"
          },
          "recipient": {
            "id": "page_id"
          },
          "timestamp": 1458692752478,
          "message": {
            "mid": "mid.1457764197618:41d102a3e1ae206a38",
            "text": "hello, world!",
            "attachments": [
              {
                "type": "audio",
                "payload": {
                  "url": "https://cdn.fbsbx.com/v/audiomessage.mp3"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Mensaje echo (que debe ser filtrado):
```json
{
  "object": "page",
  "entry": [
    {
      "id": "page_id",
      "time": 1458692752478,
      "messaging": [
        {
          "sender": {
            "id": "page_id"
          },
          "recipient": {
            "id": "user_id"
          },
          "timestamp": 1458692752478,
          "message": {
            "is_echo": true,
            "mid": "mid.1457764197618:41d102a3e1ae206a38",
            "text": "hello, world!"
          }
        }
      ]
    }
  ]
}
```

##### WhatsApp

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "PHONE_NUMBER",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": {
                  "name": "NAME"
                },
                "wa_id": "WHATSAPP_ID"
              }
            ],
            "messages": [
              {
                "from": "WHATSAPP_ID",
                "id": "wamid.ID",
                "timestamp": "TIMESTAMP",
                "type": "text",
                "text": {
                  "body": "MESSAGE_BODY"
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

Mensaje de audio:
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "PHONE_NUMBER",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": {
                  "name": "NAME"
                },
                "wa_id": "WHATSAPP_ID"
              }
            ],
            "messages": [
              {
                "from": "WHATSAPP_ID",
                "id": "wamid.ID",
                "timestamp": "TIMESTAMP",
                "type": "audio",
                "audio": {
                  "mime_type": "audio/ogg; codecs=opus",
                  "id": "MEDIA_ID",
                  "url": "https://example.com/audio.ogg"
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

##### Instagram

Instagram DM usa la misma estructura que Facebook Messenger.

##### Web

```json
{
  "user_id": "user123",
  "channel": "web",
  "type": "text",
  "payload": "Hola, ¿cómo estás?"
}
```

Mensaje de audio:
```json
{
  "user_id": "user123",
  "channel": "web",
  "type": "audio",
  "payload": "https://example.com/audio.mp3"
}
```

##### Widget Web con Archivo de Audio

Para enviar un archivo de audio desde un widget web, usa `multipart/form-data`:

```html
<form action="/webhook" method="post" enctype="multipart/form-data">
  <input type="file" name="audio" accept="audio/*">
  <input type="hidden" name="userId" value="user123">
  <button type="submit">Enviar</button>
</form>
```

O con JavaScript:

```javascript
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('userId', 'user123');

fetch('/webhook', {
  method: 'POST',
  body: formData
});
```

### GET /health

Endpoint para verificar el estado del servicio.

Respuesta:
```json
{
  "status": "up",
  "timestamp": "2023-11-15T12:34:56.789Z"
}
```

## Flujo de Procesamiento

1. El mensaje llega al endpoint `/webhook`
2. Si es un archivo de audio desde un widget web:
   - Se guarda el archivo en disco
   - Se convierte a MP3 usando FFmpeg
   - Se transcribe usando la API de Whisper
   - Se almacena el texto transcrito en Redis
3. Si es un mensaje JSON de una plataforma:
   - Se identifica la plataforma y se filtra si es un mensaje "echo"
   - Si es un mensaje de audio, se descarga y se transcribe usando la API de Whisper
   - El texto (original o transcrito) se almacena en Redis
4. Si es el primer mensaje del usuario, se inicia un temporizador de 20 segundos
5. Después de 20 segundos, se combinan todos los mensajes y se envían a Make.com

## Estructura del Proyecto

```
chat-aggregator-backend/
├── src/
│   ├── index.js                 # Punto de entrada
│   ├── routes/
│   │   ├── webhook.js           # Endpoint webhook
│   │   └── health.js            # Endpoint health
│   ├── services/
│   │   ├── audioService.js      # Descarga de archivos de audio
│   │   ├── whisperService.js    # Transcripción con OpenAI
│   │   ├── redisService.js      # Almacenamiento y temporizador
│   │   └── makeService.js       # Envío a Make.com
│   └── utils/
│       └── logger.js            # Utilidad de logging
├── uploads/                     # Archivos temporales de audio
├── logs/                        # Archivos de log
├── .env                         # Variables de entorno
├── .env.example                 # Ejemplo de variables de entorno
├── package.json
└── README.md
```

## Despliegue en Render

1. Crea una cuenta en [Render](https://render.com) si aún no tienes una.

2. Conecta tu repositorio de GitHub:
   - Ve a Dashboard > New > Web Service
   - Conecta tu cuenta de GitHub
   - Selecciona el repositorio chat-aggregator-backend

3. Configura el servicio:
   - **Name**: chat-aggregator-backend (o el nombre que prefieras)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

4. Configura las variables de entorno:
   - Ve a la sección "Environment"
   - Añade todas las variables de entorno necesarias:
     - `PORT`: 10000 (Render asignará automáticamente este puerto)
     - `REDIS_URL`: tu URL de Redis
     - `OPENAI_API_KEY`: tu clave de API de OpenAI
     - `MAKE_WEBHOOK_URL`: tu URL de webhook de Make.com
     - `FB_PAGE_ACCESS_TOKEN`: tu token de acceso de página de Facebook

5. Haz clic en "Create Web Service"

6. Una vez desplegado, Render te proporcionará una URL para tu servicio (por ejemplo, https://chat-aggregator-backend.onrender.com)

7. Configura esta URL como webhook en tus plataformas (Facebook, WhatsApp, etc.)

## Integración con Widget Web

Para integrar este backend con un widget web que envíe archivos de audio:

1. Configura el widget para enviar archivos de audio usando `multipart/form-data`:

```javascript
// Ejemplo de grabación y envío de audio desde un widget web
let mediaRecorder;
let audioChunks = [];

// Iniciar grabación
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];
  
  mediaRecorder.addEventListener('dataavailable', event => {
    audioChunks.push(event.data);
  });
  
  mediaRecorder.addEventListener('stop', () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    sendAudioToServer(audioBlob);
  });
  
  mediaRecorder.start();
}

// Detener grabación
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
}

// Enviar audio al servidor
async function sendAudioToServer(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  formData.append('userId', 'user_' + Date.now());
  
  try {
    const response = await fetch('https://tu-backend.com/webhook', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    console.log('Resultado:', result);
  } catch (error) {
    console.error('Error al enviar audio:', error);
  }
}
```

2. Asegúrate de que el backend esté configurado para recibir archivos de audio:
   - Verifica que FFmpeg esté instalado en el servidor
   - Comprueba que las carpetas `uploads` y `logs` tengan permisos de escritura

## Notas Importantes

- **Mensajes Echo**: El sistema filtra automáticamente los mensajes "echo" de Facebook Messenger (`message.is_echo`), Instagram y WhatsApp (cuando `from` coincide con tu número).

- **Procesamiento de Audio**: Los archivos de audio se descargan temporalmente, se convierten a MP3, se transcriben con la API de Whisper y luego se eliminan.

- **Agrupación de Mensajes**: Los mensajes se agrupan durante 20 segundos desde la llegada del primer mensaje, luego se combinan y se envían a Make.com.

- **Redis**: Se utiliza Redis para almacenar temporalmente los mensajes y gestionar los temporizadores.

- **Límites de Whisper**: La API de Whisper tiene un límite de 25MB por archivo. Considera implementar compresión o limitación de duración si es necesario.

## Solución de Problemas

### El servidor no se inicia
- Verifica que Node.js esté instalado correctamente
- Comprueba que todas las variables de entorno estén configuradas
- Revisa los logs en la carpeta `logs/`

### Problemas con Redis
- Verifica que la URL de Redis sea correcta
- Comprueba que Redis esté en ejecución y sea accesible

### Problemas con la API de Whisper
- Verifica que la clave de API de OpenAI sea válida
- Comprueba los límites de tu cuenta de OpenAI

### Problemas con la transcripción de audio
- Verifica que FFmpeg esté instalado correctamente
- Comprueba que los archivos de audio se estén guardando correctamente
- Asegúrate de que el archivo de audio no esté vacío o corrupto

### Los mensajes no llegan a Make.com
- Verifica que la URL de webhook de Make.com sea correcta
- Comprueba los logs para ver si hay errores en el envío

## Licencia

MIT
