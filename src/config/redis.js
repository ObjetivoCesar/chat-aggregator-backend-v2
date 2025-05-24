const redis = require('redis');

// Crear cliente Redis
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    connectTimeout: 60000,
    lazyConnect: true,
  }
});

// Manejar eventos de conexión
redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis client error:', err);
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Redis client reconnecting...');
});

// Función para conectar a Redis
const connectRedis = async () => {
  try {
    await redisClient.connect();
    return true;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return false;
  }
};

module.exports = {
  redisClient,
  connectRedis
};
