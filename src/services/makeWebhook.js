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
        timeout: 60000,
      })

      console.log(`✅ Successfully sent to Make.com (${response.status})`)
    } catch (error) {
      console.error("❌ Error sending to Make.com:", error)
      throw error
    }
  }
}

module.exports = new MakeWebhook()