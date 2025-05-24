const express = require("express")
const router = express.Router()
const messageProcessor = require("../services/messageProcessor")
const messageBuffer = require("../services/messageBuffer")

router.post("/", async (req, res) => {
  try {
    console.log("📨 Webhook received:", JSON.stringify(req.body, null, 2))

    // Procesar el mensaje según la plataforma
    const processedMessage = await messageProcessor.processIncomingMessage(req.body)

    if (!processedMessage) {
      console.log("⚠️  Message filtered out (echo or invalid)")
      return res.status(200).json({ status: "filtered" })
    }

    console.log("✅ Processed message:", processedMessage)

    // Agregar al buffer
    await messageBuffer.addMessage(processedMessage)

    res.status(200).json({
      status: "received",
      user_id: processedMessage.user_id,
      channel: processedMessage.channel,
      type: processedMessage.type,
    })
  } catch (error) {
    console.error("❌ Webhook error:", error)
    res.status(500).json({
      error: "Failed to process webhook",
      message: error.message,
    })
  }
})

module.exports = router
