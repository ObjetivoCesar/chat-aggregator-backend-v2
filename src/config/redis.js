const redis = require('redis');

// Crear cliente Redis con configuración para v4.6.10
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    connectTimeout: 60000,
    lazyConnect: true,
  }
});

// Event listeners
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Reconnecting to Redis...');
});

redisClient.on('ready', () => {
  console.log('🚀 Redis client ready');
});

// Conectar al cliente
const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// En Redis v4.6.10, los métodos están disponibles directamente en el cliente
// No necesitamos wrapper, solo exportamos el cliente directamente
const pingRedis = async () => {
  try {
    const response = await redisClient.ping();
    console.log('Redis ping response:', response);
    return response;
  } catch (error) {
    console.error('Redis ping failed:', error);
    throw error;
  }
};

module.exports = {
  redisClient,
  connectRedis,
  pingRedis
};