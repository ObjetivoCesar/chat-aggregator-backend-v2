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

// Crear un wrapper para los métodos de Redis
const redisWrapper = {
  lLen: async (key) => {
    return await redisClient.lLen(key);
  },
  lPush: async (key, value) => {
    return await redisClient.lPush(key, value);
  },
  lRange: async (key, start, stop) => {
    return await redisClient.lRange(key, start, stop);
  },
  exists: async (key) => {
    return await redisClient.exists(key);
  },
  setEx: async (key, seconds, value) => {
    return await redisClient.setEx(key, seconds, value);
  },
  del: async (key) => {
    return await redisClient.del(key);
  },
  quit: async () => {
    return await redisClient.quit();
  }
};

module.exports = {
  redisClient: redisWrapper,
  connectRedis
};
