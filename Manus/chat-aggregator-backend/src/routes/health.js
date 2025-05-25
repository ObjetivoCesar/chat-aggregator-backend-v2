const express = require('express');
const router = express.Router();
const Redis = require('ioredis');
const logger = require('../utils/logger');

// Inicializar cliente Redis para health check
const redis = new Redis(process.env.REDIS_URL);

/**
 * Endpoint de health check
 * Verifica que el servidor esté funcionando y que Redis esté disponible
 */
router.get('/', async (req, res) => {
  try {
    // Verificar conexión a Redis
    await redis.ping();
    
    // Responder con estado OK
    return res.status(200).json({ 
      status: "up",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error en health check: ${error.message}`);
    
    // Si hay error con Redis, responder con estado degradado
    return res.status(200).json({ 
      status: "degraded",
      error: "Redis connection failed",
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = {
  healthRouter: router
};
