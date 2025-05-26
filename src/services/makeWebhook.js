const axios = require("axios")
const sseManager = require("./sseManager")

class MakeWebhook {
  constructor() {
    this.webhookUrl = process.env.MAKE_WEBHOOK_URL
  }

  async sendToMake(payload) {
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
        timeout: 30000,
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
