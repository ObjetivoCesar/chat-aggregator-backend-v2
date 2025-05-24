const axios = require("axios")

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

      if (response.data) {
        console.log(`📄 Make.com response:`, response.data)
      }

      return response.data
    } catch (error) {
      console.error("❌ Error sending to Make.com:", error.response?.data || error.message)

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
