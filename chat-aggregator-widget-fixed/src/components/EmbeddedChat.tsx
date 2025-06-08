"use client"

import { useState, useEffect, useRef, ReactNode } from "react"
import "./EmbeddedChat.css"

// Tipos
export interface ChatMessage {
  type: "user" | "bot" | "status" | "error"
  message: string
  isAudio?: boolean
  timestamp: number
}

export interface EmbeddedChatProps {
  /** URL del backend para enviar mensajes */
  apiUrl?: string
  /** Mensaje de bienvenida inicial */
  welcomeMessage?: string
  /** Título del chat */
  title?: string
  /** Clase CSS para el contenedor principal */
  className?: string
  /** Estilo inline para el contenedor principal */
  style?: React.CSSProperties
  /** Función que se ejecuta cuando se envía un mensaje */
  onSendMessage?: (message: string) => void
  /** Función que se ejecuta cuando se recibe un mensaje */
  onReceiveMessage?: (message: ChatMessage) => void
  /** Función que se ejecuta cuando cambia el estado de la conexión */
  onConnectionStatusChange?: (status: ConnectionStatus) => void
  /** Componente personalizado para el encabezado */
  headerComponent?: ReactNode
  /** Componente personalizado para el pie */
  footerComponent?: ReactNode
  /** Duración máxima de grabación de audio en segundos */
  maxAudioDuration?: number
  /** Mostrar botón de audio */
  showAudioButton?: boolean
  /** Mostrar botón de imagen */
  showImageButton?: boolean
  /** Placeholder para el campo de texto */
  inputPlaceholder?: string
  /** Texto del botón de envío */
  sendButtonText?: string
  /** Altura del componente (ej: "500px", "100%") */
  height?: string
}

export type ConnectionStatus = "online" | "offline" | "connecting" | "error"

/**
 * Componente de chat incrustable para React/Next.js
 * 
 * Este componente puede ser colocado en cualquier contenedor y se adaptará a su tamaño.
 * Mantiene la comunicación con el backend a través de SSE y POST.
 */
export default function EmbeddedChat({
  apiUrl = "https://chat-aggregator-backend-v2.onrender.com/webhook",
  welcomeMessage = "¡Hola! Soy un asistente virtual. ¿En qué puedo ayudarte?",
  title = "Chat",
  className = "",
  style = {},
  onSendMessage,
  onReceiveMessage,
  onConnectionStatusChange,
  headerComponent,
  footerComponent,
  maxAudioDuration = 60,
  showAudioButton = true,
  showImageButton = true,
  inputPlaceholder = "Escribe un mensaje...",
  sendButtonText = "Enviar",
  height = "500px",
}: EmbeddedChatProps) {
  // Estado
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline")
  const [isTyping, setIsTyping] = useState(false)
  
  // Referencia para el último mensaje de estado
  const lastStatusMessageRef = useRef<string | null>(null)

  // Referencias
  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Generar o recuperar user_id persistente
  const [userId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("embedded_chat_user_id")
      if (!id) {
        id = "user_" + Math.random().toString(36).substring(2, 15)
        localStorage.setItem("embedded_chat_user_id", id)
      }
      return id
    }
    return "user_" + Math.random().toString(36).substring(2, 15)
  })

  // Cargar conversación guardada
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedMessages = localStorage.getItem(`embedded_chat_messages_${userId}`)
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages)
          // Filtrar mensajes de estado duplicados al cargar
          const filteredMessages = parsed.filter((msg: ChatMessage, index: number, array: ChatMessage[]) => {
            if (msg.type !== "status") return true;
            // Solo mantener el último mensaje de estado si hay varios consecutivos
            const nextMsg = array[index + 1];
            return !nextMsg || nextMsg.type !== "status";
          });
          setMessages(filteredMessages)
        } catch (e) {
          console.error("Error loading saved messages:", e)
          // Mostrar mensaje de bienvenida si hay error
          setMessages([
            {
              type: "bot",
              message: welcomeMessage,
              timestamp: Date.now(),
            },
          ])
        }
      } else {
        // Mostrar mensaje de bienvenida
        setMessages([
          {
            type: "bot",
            message: welcomeMessage,
            timestamp: Date.now(),
          },
        ])
      }
    }
  }, [userId, welcomeMessage])

  // Guardar mensajes
  useEffect(() => {
    if (typeof window !== "undefined" && messages.length > 0) {
      localStorage.setItem(`embedded_chat_messages_${userId}`, JSON.stringify(messages))
    }
  }, [messages, userId])

  // Scroll automático
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages])

  // Notificar cambios en el estado de conexión
  useEffect(() => {
    if (onConnectionStatusChange) {
      onConnectionStatusChange(connectionStatus)
    }
  }, [connectionStatus, onConnectionStatusChange])

  // Conectar SSE al montar el componente
  useEffect(() => {
    connectSSE()
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // Conectar SSE
  const connectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setConnectionStatus("connecting")

    try {
      const baseUrl = apiUrl.replace("/webhook", "")
      const sseUrl = `${baseUrl}/webhook/sse/${userId}?channel=web`

      eventSourceRef.current = new EventSource(sseUrl)

      eventSourceRef.current.onopen = () => {
        setConnectionStatus("online")
      }

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setIsTyping(false)

          if (data.type === "message") {
            // Siempre añadir mensajes reales del bot
            addMessage("bot", data.message)
            if (onReceiveMessage) {
              onReceiveMessage({
                type: "bot",
                message: data.message,
                timestamp: Date.now(),
              })
            }
          } else if (data.type === "status") {
            // Para mensajes de estado, actualizar en lugar de añadir
            updateStatusMessage(data.message)
            if (onReceiveMessage) {
              onReceiveMessage({
                type: "status",
                message: data.message,
                timestamp: Date.now(),
              })
            }
          } else if (data.type === "error") {
            addMessage("error", data.message)
            if (onReceiveMessage) {
              onReceiveMessage({
                type: "error",
                message: data.message,
                timestamp: Date.now(),
              })
            }
          }
        } catch (error) {
          console.error("Error processing SSE message:", error)
          addMessage("error", "Error al procesar la respuesta del servidor")
        }
      }

      eventSourceRef.current.onerror = () => {
        setConnectionStatus("error")
        setIsTyping(false)
        setTimeout(() => {
          if (connectionStatus !== "online") {
            connectSSE()
          }
        }, 5000)
      }
    } catch (error) {
      console.error("Error creating SSE connection:", error)
      setConnectionStatus("error")
    }
  }

  // Añadir mensaje
  const addMessage = (type: ChatMessage["type"], message: string, isAudio = false) => {
    const newMessage: ChatMessage = {
      type,
      message,
      isAudio,
      timestamp: Date.now(),
    }
    
    // Si es un mensaje de estado, actualizar la referencia
    if (type === "status") {
      lastStatusMessageRef.current = message;
    }
    
    setMessages((prev) => [...prev, newMessage])
  }
  
  // Actualizar mensaje de estado (en lugar de añadir uno nuevo)
  const updateStatusMessage = (message: string) => {
    // Si el mensaje es el mismo que el último, no hacer nada
    if (message === lastStatusMessageRef.current) {
      return;
    }
    
    // Actualizar la referencia
    lastStatusMessageRef.current = message;
    
    setMessages((prev) => {
      // Buscar el último mensaje de estado
      const lastStatusIndex = [...prev].reverse().findIndex(msg => msg.type === "status");
      
      // Si no hay mensajes de estado o el último mensaje no es de estado, añadir uno nuevo
      if (lastStatusIndex === -1 || prev[prev.length - 1].type !== "status") {
        return [...prev, {
          type: "status" as const,
          message,
          timestamp: Date.now(),
        }];
      }
      
      // Si el último mensaje es de estado, actualizarlo
      const actualIndex = prev.length - 1 - lastStatusIndex;
      const updated = [...prev];
      updated[actualIndex] = {
        ...updated[actualIndex],
        message,
        timestamp: Date.now(),
      };
      
      return updated;
    });
  }

  // Enviar mensaje de texto
  const sendTextMessage = async () => {
    if (!currentMessage.trim()) return

    addMessage("user", currentMessage)
    setIsTyping(true)

    if (onSendMessage) {
      onSendMessage(currentMessage)
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          channel: "web",
          type: "text",
          text: currentMessage,
        }),
      })

      if (!response.ok) {
        throw new Error("Error al enviar mensaje")
      }

      // Conectar SSE si no está conectado
      if (connectionStatus !== "online") {
        connectSSE()
      }
    } catch (error) {
      console.error("Error sending message:", error)
      setIsTyping(false)
      addMessage("error", "Error al enviar el mensaje. Verifica tu conexión.")
    }

    setCurrentMessage("")
  }

  // Iniciar grabación de audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.addEventListener("dataavailable", (event) => {
        audioChunksRef.current.push(event.data)
      })

      mediaRecorderRef.current.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop())
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        sendAudioFile(audioBlob)
      })

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingDuration(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= maxAudioDuration) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    } catch (error) {
      console.error("Error accessing microphone:", error)
      addMessage("error", "No se pudo acceder al micrófono")
    }
  }

  // Detener grabación
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
    }
  }

  // Enviar archivo de audio
  const sendAudioFile = async (audioBlob: Blob) => {
    addMessage("user", "Audio grabado", true)
    setIsTyping(true)

    try {
      const formData = new FormData()
      formData.append("user_id", userId)
      formData.append("channel", "web")
      formData.append("type", "audio")
      formData.append("audio", audioBlob, "recording.webm")

      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Error al enviar audio")
      }

      // Conectar SSE si no está conectado
      if (connectionStatus !== "online") {
        connectSSE()
      }
    } catch (error) {
      console.error("Error sending audio:", error)
      setIsTyping(false)
      addMessage("error", "Error al enviar el audio")
    }
  }

  // Enviar imagen
  const sendImage = async (file: File) => {
    addMessage("user", `Imagen: ${file.name}`)
    setIsTyping(true)

    try {
      const formData = new FormData()
      formData.append("user_id", userId)
      formData.append("channel", "web")
      formData.append("type", "image")
      formData.append("image", file)

      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Error al enviar imagen")
      }

      // Conectar SSE si no está conectado
      if (connectionStatus !== "online") {
        connectSSE()
      }
    } catch (error) {
      console.error("Error sending image:", error)
      setIsTyping(false)
      addMessage("error", "Error al enviar la imagen")
    }
  }

  // Formatear tiempo
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")
    return `${mins}:${secs}`
  }

  // Procesar Markdown básico
  const parseMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>")
  }

  // Manejar selección de archivo de imagen
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      sendImage(file)
    }
  }

  // Manejar tecla Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendTextMessage()
    }
  }

  return (
    <div 
      className={`embedded-chat-container ${className}`} 
      style={{ 
        ...style,
        height: height
      }}
    >
      {/* Header */}
      {headerComponent || (
        <div className="embedded-chat-header">
          <h3 className="embedded-chat-title">{title}</h3>
          
          {/* Estado de conexión */}
          <div className={`embedded-chat-connection-status ${connectionStatus}`}>
            {connectionStatus === "online"
              ? "Conectado"
              : connectionStatus === "connecting"
                ? "Conectando..."
                : "Desconectado"}
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div ref={messagesRef} className="embedded-chat-messages">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`embedded-chat-message ${message.type}-message`}
          >
            {message.isAudio && <span className="embedded-chat-audio-icon">🎵</span>}
            <div 
              className="embedded-chat-message-content"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(message.message) }} 
            />
          </div>
        ))}

        {/* Indicador de escritura */}
        {isTyping && (
          <div className="embedded-chat-typing-indicator">
            <div className="embedded-chat-typing-dots">
              <div className="embedded-chat-typing-dot"></div>
              <div className="embedded-chat-typing-dot"></div>
              <div className="embedded-chat-typing-dot"></div>
            </div>
            <span className="embedded-chat-typing-text">Escribiendo...</span>
          </div>
        )}
      </div>

      {/* Grabación de audio */}
      {isRecording && (
        <div className="embedded-chat-recording">
          <div className="embedded-chat-recording-timer">{formatTime(recordingDuration)}</div>
          <div className="embedded-chat-recording-controls">
            <button 
              className="embedded-chat-recording-stop-button"
              onClick={stopRecording}
            >
              Detener
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {footerComponent || (
        <div className="embedded-chat-input-container">
          <textarea
            ref={textareaRef}
            className="embedded-chat-textarea"
            placeholder={inputPlaceholder}
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <div className="embedded-chat-actions">
            {showImageButton && (
              <>
                <button 
                  className="embedded-chat-image-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📷
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImageSelect}
                />
              </>
            )}
            
            {showAudioButton && (
              <button 
                className="embedded-chat-audio-button"
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? "⏹" : "🎤"}
              </button>
            )}
            
            <button 
              className="embedded-chat-send-button"
              onClick={sendTextMessage}
              disabled={!currentMessage.trim()}
            >
              {sendButtonText}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
