require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const Redis = require('ioredis');
const { webhookRouter } = require('./routes/webhook');
const { healthRouter } = require('./routes/health');
const logger = require('./utils/logger');

// Inicializar aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Rutas
app.use('/webhook', webhookRouter);
app.use('/health', healthRouter);

// Manejo de errores
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  logger.info(`Servidor iniciado en puerto ${PORT}`);
});

module.exports = app;
