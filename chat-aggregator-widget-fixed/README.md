# Documentación: Componente de Chat Incrustable para React/Next.js

## Descripción

Este componente de chat ha sido diseñado específicamente para ser incrustado directamente en cualquier sección de tu página web, en lugar de funcionar como una ventana flotante. Mantiene toda la funcionalidad de comunicación con el backend a través de SSE y POST, pero con una arquitectura que separa completamente la lógica de comunicación de la presentación visual.

## Características

- **Incrustable**: Se puede colocar en cualquier contenedor HTML y se adaptará a su tamaño
- **Tema oscuro**: Diseño con tema oscuro y borde blanco por defecto
- **Comunicación con backend**: Mantiene la misma funcionalidad de comunicación con el backend
- **Personalizable**: Fácil de estilizar mediante variables CSS o clases
- **API clara**: Expone métodos y eventos para interactuar con el componente
- **Responsive**: Se adapta a diferentes tamaños de pantalla
- **TypeScript**: Completamente tipado para mejor desarrollo

## Archivos incluidos

- `EmbeddedChat.tsx`: Componente principal de React
- `EmbeddedChat.css`: Estilos del componente (tema oscuro por defecto)
- `example.tsx`: Ejemplo de integración en una página Next.js

## Instalación

1. Copia los archivos `EmbeddedChat.tsx` y `EmbeddedChat.css` a tu proyecto en la carpeta de componentes
2. Importa el componente donde lo necesites

## Uso básico

```tsx
import { EmbeddedChat } from '@/components/EmbeddedChat';

export default function MiPagina() {
  return (
    <div className="mi-contenedor">
      <h1>Mi Página</h1>
      
      {/* El chat se adaptará al tamaño del contenedor */}
      <div style={{ height: '500px', width: '100%' }}>
        <EmbeddedChat 
          title="Asistente Virtual"
          welcomeMessage="¡Hola! ¿En qué puedo ayudarte hoy?"
        />
      </div>
    </div>
  );
}
```

## Props disponibles

| Prop | Tipo | Descripción | Valor por defecto |
|------|------|-------------|-------------------|
| `apiUrl` | string | URL del backend para enviar mensajes | "https://chat-aggregator-backend-v2.onrender.com/webhook" |
| `welcomeMessage` | string | Mensaje de bienvenida inicial | "¡Hola! Soy un asistente virtual. ¿En qué puedo ayudarte?" |
| `title` | string | Título del chat | "Chat" |
| `className` | string | Clase CSS para el contenedor principal | "" |
| `style` | React.CSSProperties | Estilo inline para el contenedor principal | {} |
| `onSendMessage` | function | Función que se ejecuta cuando se envía un mensaje | undefined |
| `onReceiveMessage` | function | Función que se ejecuta cuando se recibe un mensaje | undefined |
| `onConnectionStatusChange` | function | Función que se ejecuta cuando cambia el estado de la conexión | undefined |
| `headerComponent` | ReactNode | Componente personalizado para el encabezado | undefined |
| `footerComponent` | ReactNode | Componente personalizado para el pie | undefined |
| `maxAudioDuration` | number | Duración máxima de grabación de audio en segundos | 60 |
| `showAudioButton` | boolean | Mostrar botón de audio | true |
| `showImageButton` | boolean | Mostrar botón de imagen | true |
| `inputPlaceholder` | string | Placeholder para el campo de texto | "Escribe un mensaje..." |
| `sendButtonText` | string | Texto del botón de envío | "Enviar" |
| `height` | string | Altura del componente | "500px" |

## Personalización de estilos

### Usando variables CSS

Puedes sobrescribir las variables CSS para personalizar el aspecto del chat:

```css
:root {
  --embedded-chat-primary-color: #1a1a1a;
  --embedded-chat-secondary-color: #2a2a2a;
  --embedded-chat-text-color: #ffffff;
  --embedded-chat-bg-color: #121212;
  --embedded-chat-border-color: #ffffff;
  --embedded-chat-user-message-bg: #3a3a3a;
  --embedded-chat-bot-message-bg: #252525;
  /* ... más variables ... */
}
```

### Usando clases CSS

También puedes sobrescribir las clases CSS directamente:

```css
.embedded-chat-container {
  /* Tus estilos personalizados */
}

.embedded-chat-message.bot-message {
  /* Personalizar mensajes del bot */
}
```

### Usando la prop className

```tsx
<EmbeddedChat 
  className="mi-chat-personalizado"
  /* otras props */
/>
```

Y luego en tu CSS:

```css
.mi-chat-personalizado {
  /* Tus estilos personalizados */
}

.mi-chat-personalizado .embedded-chat-header {
  /* Personalizar el encabezado */
}
```

## Componentes personalizados

Puedes reemplazar el encabezado o el pie del chat con tus propios componentes:

```tsx
<EmbeddedChat 
  headerComponent={
    <div className="mi-encabezado-personalizado">
      <h3>Mi Chat</h3>
      <button>Configuración</button>
    </div>
  }
  footerComponent={
    <div className="mi-pie-personalizado">
      <input type="text" placeholder="Escribe aquí..." />
      <button>Enviar</button>
    </div>
  }
/>
```

## Eventos

El componente expone varios eventos que puedes utilizar para integrar con tu aplicación:

```tsx
<EmbeddedChat 
  onSendMessage={(message) => {
    console.log('Mensaje enviado:', message);
    // Puedes hacer análisis, logging, etc.
  }}
  onReceiveMessage={(message) => {
    console.log('Mensaje recibido:', message);
    // Puedes procesar respuestas, actualizar estado, etc.
  }}
  onConnectionStatusChange={(status) => {
    console.log('Estado de conexión:', status);
    // Puedes mostrar indicadores de conexión en tu UI
  }}
/>
```

## Notas importantes

1. El componente mantiene la misma lógica de comunicación con el backend que el widget original:
   - POST a `apiUrl` para enviar mensajes
   - Conexión SSE a `baseUrl/webhook/sse/{userId}?channel=web` para recibir mensajes

2. El componente gestiona automáticamente:
   - Generación y persistencia del user_id en localStorage
   - Reconexión automática si se pierde la conexión SSE
   - Guardado y carga de mensajes anteriores

3. Para usar en un entorno de producción, asegúrate de:
   - Verificar que la URL del backend es correcta
   - Probar la conexión SSE en diferentes navegadores
   - Considerar la gestión de errores y reconexiones en caso de problemas de red
