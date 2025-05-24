const express = require("express")
const router = express.Router()
const messageBuffer = require("../services/messageBuffer")
const makeWebhook = require("../services/makeWebhook")

router.get("/process-buffer", async (req, res) => {
  try {
    const readyMessages = await messageBuffer.getAndRemoveReadyMessages()
    if (readyMessages.length === 0) {
      return res.status(200).json({ processed: 0, message: "No hay mensajes listos" })
    }
    let success = 0, failed = 0
    for (const msg of readyMessages) {
      try {
        await makeWebhook.sendToMake({
          user_id: msg.user_id,
          channel: msg.channel,
          text: msg.content
        })
        success++
      } catch (err) {
        console.error("❌ Error enviando a Make.com:", err)
        failed++
      }
    }
    res.status(200).json({ processed: readyMessages.length, success, failed })
  } catch (error) {
    console.error("❌ Error en el cron de buffer:", error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router 