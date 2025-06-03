class PlatformDetector {
  detectPlatform(payload) {
    try {
      // Facebook Messenger
      if (payload.object === "page" && payload.entry) {
        return this.processFacebookMessenger(payload)
      }

      // Instagram (similar structure to Facebook)
      if (payload.object === "instagram" && payload.entry) {
        return this.processInstagram(payload)
      }

      // WhatsApp
      if (payload.object === "whatsapp_business_account" && payload.entry) {
        return this.processWhatsApp(payload)
      }

      // Web Chat (custom format)
      if (payload.channel === "web" && payload.user_id) {
        return this.processWebChat(payload)
      }

      console.log("⚠️  Unknown platform format")
      return null
    } catch (error) {
      console.error("❌ Error detecting platform:", error)
      return null
    }
  }

  processFacebookMessenger(payload) {
    try {
      const entry = payload.entry[0]
      const messaging = entry.messaging?.[0]

      if (!messaging || !messaging.message) {
        return null
      }

      const sender_id = messaging.sender?.id
      const message = messaging.message
      const is_echo = message.is_echo || false

      if (!sender_id) {
        return null
      }

      // Detectar tipo de mensaje
      let type = "text"
      let content = message.text || ""

      // Verificar si es audio o imagen
      if (message.attachments && message.attachments.length > 0) {
        const attachment = message.attachments[0]
        if (attachment.type === "audio") {
          type = "audio"
          content = attachment.payload?.url || ""
        } else if (attachment.type === "image") {
          type = "image"
          content = attachment.payload?.url || ""
        }
      }

      return {
        channel: "facebook",
        user_id: sender_id,
        type,
        content,
        is_echo,
      }
    } catch (error) {
      console.error("❌ Error processing Facebook Messenger:", error)
      return null
    }
  }

  processInstagram(payload) {
    try {
      const entry = payload.entry[0]
      const messaging = entry.messaging?.[0]

      if (!messaging || !messaging.message) {
        return null
      }

      const sender_id = messaging.sender?.id
      const message = messaging.message
      const is_echo = message.is_echo || false

      if (!sender_id) {
        return null
      }

      // Detectar tipo de mensaje (similar a Facebook)
      let type = "text"
      let content = message.text || ""

      if (message.attachments && message.attachments.length > 0) {
        const attachment = message.attachments[0]
        if (attachment.type === "audio") {
          type = "audio"
          content = attachment.payload?.url || ""
        } else if (attachment.type === "image") {
          type = "image"
          content = attachment.payload?.url || ""
        }
      }

      return {
        channel: "instagram",
        user_id: sender_id,
        type,
        content,
        is_echo,
      }
    } catch (error) {
      console.error("❌ Error processing Instagram:", error)
      return null
    }
  }

  processWhatsApp(payload) {
    try {
      const entry = payload.entry[0]
      const changes = entry.changes?.[0]
      const value = changes?.value

      if (!value || !value.messages || value.messages.length === 0) {
        return null
      }

      const message = value.messages[0]
      const contact = value.contacts?.[0]
      const user_id = contact?.wa_id || message.from

      if (!user_id) {
        return null
      }

      // Verificar si es echo (mensaje de nuestro número)
      const our_number = process.env.WHATSAPP_PHONE_NUMBER_ID
      const is_echo = our_number && message.from === our_number

      // Detectar tipo de mensaje
      let type = "text"
      let content = ""

      if (message.type === "text") {
        type = "text"
        content = message.text?.body || ""
      } else if (message.type === "audio") {
        type = "audio"
        content = message.audio?.url || ""
      } else if (message.type === "image") {
        type = "image"
        content = message.image?.url || ""
      }

      return {
        channel: "whatsapp",
        user_id,
        type,
        content,
        is_echo,
      }
    } catch (error) {
      console.error("❌ Error processing WhatsApp:", error)
      return null
    }
  }

  processWebChat(payload) {
    try {
      const { user_id, type, payload: messagePayload, text } = payload

      if (!user_id || !type) {
        return null
      }

      let content = ""

      if (type === "text") {
        // Prioridad: payload.text > payload.payload.text
        content = text || messagePayload?.text || ""
      } else if (type === "audio") {
        content = messagePayload?.audio_url || ""
      } else if (type === "image") {
        content = messagePayload?.image_url || ""
      }

      return {
        channel: "web",
        user_id,
        type,
        content,
        is_echo: false, // Web chat no tiene echo
      }
    } catch (error) {
      console.error("❌ Error processing Web Chat:", error)
      return null
    }
  }
}

module.exports = new PlatformDetector()
