const axios = require("axios")
const sseManager = require("./sseManager")

class MakeWebhook {
  constructor() {
    this.webhookUrl = "https://hook.us2.make.com/s2syufrq4vmd5no2p17e2kxr1oy6rlcu"
  }

  async sendToMake(payload, retryCount = 0) {
    if (!this.webhookUrl) {
      console.error("❌ MAKE_WEBHOOK_URL not configured")
      throw new Error("Make.com webhook URL not configured")
    }

    try {
      console.log(`🚀 Sending to Make.com: ${JSON.stringify(payload)}`)

      const response = await axios.post(this.webhookUrl, payload, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 120000, // Aumentado de 30000 a 120000 (2 minutos)
      })

      console.log(`✅ Successfully sent to Make.com (${response.status})`)

      let responseText = "No se recibió respuesta del servidor."
      if (response.data) {
        console.log(`📄 Make.com response:`, response.data)
        if (typeof response.data === 'string') {
          responseText = response.data
        } else if (response.data.response) {
          responseText = response.data.response
        } else if (response.data.text) {
          responseText = response.data.text
        } else {
          responseText = JSON.stringify(response.data)
        }
      }

      // Enviar respuesta al cliente a través de SSE
      if (payload.user_id && payload.platform) {
        const userId = payload.user_id
        const channel = payload.platform
        if (sseManager.hasActiveConnection(userId, channel)) {
          console.log(`📡 Sending response to SSE client ${channel}:${userId}`)
          sseManager.sendMessage(userId, channel, responseText)
        } else {
          console.log(`⚠️ No active SSE connection for ${channel}:${userId}`)
        }
      }

      return response.data
    } catch (error) {
      console.error("❌ Error sending to Make.com:", error.response?.data || error.message)

      // Si es timeout y no hemos excedido los reintentos
      if (error.code === "ECONNABORTED" && retryCount < 3) {
        console.log(`⏱️ Timeout detected, retrying (${retryCount + 1}/3)...`);
        // Esperar antes de reintentar (backoff exponencial)
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, retryCount)));
        return this.sendToMake(payload, retryCount + 1);
      }

      // Notificar error al cliente a través de SSE
      if (payload.user_id && payload.platform) {
        const userId = payload.user_id
        const channel = payload.platform
        if (sseManager.hasActiveConnection(userId, channel)) {
          sseManager.sendMessage(
            userId,
            channel,
            "Lo siento, hubo un problema al procesar tu mensaje. Por favor, intenta de nuevo más tarde.",
            "error"
          )
        }
      }

      if (error.response) {
        throw new Error(`Make.com webhook failed: ${error.response.status} - ${error.response.statusText}`)
      } else if (error.code === "ECONNABORTED") {
        throw new Error("Make.com webhook timeout")
      } else {
        throw new Error(`Make.com webhook error: ${error.message}`)
      }
    }
  }

  // Método para verificar si el webhook está configurado
  isConfigured() {
    return !!this.webhookUrl
  }

  // Método para test del webhook
  async testWebhook() {
    const testPayload = {
      user_id: "test_user",
      channel: "test",
      text: "Test message from chat-aggregator-backend",
    }

    try {
      await this.sendToMake(testPayload)
      return { success: true, message: "Webhook test successful" }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

module.exports = new MakeWebhook()
