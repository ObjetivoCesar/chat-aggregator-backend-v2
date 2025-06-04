/**
 * Gestor de conexiones Server-Sent Events (SSE)
 * Permite mantener conexiones abiertas con los clientes y enviar respuestas en tiempo real
 */

class SSEManager {
  constructor() {
    // Mapa de conexiones activas por usuario y canal
    this.connections = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 3000; // 3 segundos
    // Intervalo para enviar eventos keep-alive y limpiar conexiones muertas
    this.keepAliveInterval = 30000; // 30 segundos
    // Iniciar intervalo de keep-alive
    setInterval(() => this.sendKeepAlive(), this.keepAliveInterval);
    console.log("🔌 SSE Manager initialized");
  }
  /**
   * Registra una nueva conexión SSE
   * @param {string} userId - ID del usuario
   * @param {string} channel - Canal (web, facebook, etc.)
   * @param {object} res - Objeto de respuesta Express
   */
  registerConnection(userId, channel, res) {
    const connectionKey = this.getConnectionKey(userId, channel);
    
    // Limpiar intentos de reconexión previos
    this.reconnectAttempts.delete(connectionKey);
    
    // Configurar cabeceras para SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    // Enviar evento inicial
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Conexión establecida' })}\n\n`);
    // Almacenar la conexión
    this.connections.set(connectionKey, {
      res,
      userId,
      channel,
      timestamp: Date.now(),
      lastActivity: Date.now(),
      pingInterval: null
    });
    console.log(`🔌 New SSE connection registered: ${connectionKey}`);
    // Configurar ping cada 30 segundos para mantener la conexión viva
    const pingInterval = setInterval(() => {
      if (this.connections.has(connectionKey)) {
        try {
          res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
          this.connections.get(connectionKey).lastActivity = Date.now();
        } catch (error) {
          console.error(`Error sending ping to ${connectionKey}:`, error);
          this.removeConnection(connectionKey);
        }
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
    // Guardar referencia al intervalo
    this.connections.get(connectionKey).pingInterval = pingInterval;
    // Manejar cierre de conexión
    res.on('close', () => {
      console.log(`🔌 SSE connection closed: ${connectionKey}`);
      this.handleConnectionClose(connectionKey);
    });
    return true;
  }
  /**
   * Maneja el cierre de una conexión
   * @param {string} connectionKey - Clave de la conexión
   */
  handleConnectionClose(connectionKey) {
    const connection = this.connections.get(connectionKey);
    if (!connection) return;
    // Limpiar intervalo de ping
    if (connection.pingInterval) {
      clearInterval(connection.pingInterval);
    }
    // Intentar reconexión si no excede el máximo de intentos
    const attempts = this.reconnectAttempts.get(connectionKey) || 0;
    if (attempts < this.maxReconnectAttempts) {
      console.log(`🔄 Attempting to reconnect ${connectionKey} (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
      this.reconnectAttempts.set(connectionKey, attempts + 1);
      
      // Programar reconexión
      setTimeout(() => {
        if (this.reconnectAttempts.has(connectionKey)) {
          console.log(`⏰ Reconnection timeout for ${connectionKey}`);
          this.removeConnection(connectionKey);
        }
      }, this.reconnectDelay);
    } else {
      console.log(`❌ Max reconnection attempts reached for ${connectionKey}`);
      this.removeConnection(connectionKey);
    }
  }
  /**
   * Envía un mensaje a un cliente específico
   * @param {string} userId - ID del usuario
   * @param {string} channel - Canal (web, facebook, etc.)
   * @param {string} message - Mensaje a enviar
   * @param {string} type - Tipo de mensaje (message, status, error)
   */
  sendMessage(userId, channel, message, type = 'message') {
    const connectionKey = this.getConnectionKey(userId, channel);
    const connection = this.connections.get(connectionKey);
    if (!connection) {
      console.log(`⚠️ No active SSE connection for ${channel}:${userId}`);
      return false;
    }
    try {
      const data = JSON.stringify({
        type,
        message,
        timestamp: new Date().toISOString()
      });
      connection.res.write(`data: ${data}\n\n`);
      connection.lastActivity = Date.now();
      console.log(`📡 Message sent to ${connectionKey}:`, message);
      return true;
    } catch (error) {
      console.error(`❌ Error sending message to ${connectionKey}:`, error);
      this.handleConnectionClose(connectionKey);
      return false;
    }
  }
  /**
   * Envía un evento de keep-alive a todas las conexiones activas
   * y limpia las conexiones muertas
   */
  sendKeepAlive() {
    const now = Date.now();
    const expiredTime = now - (this.keepAliveInterval * 2);
    for (const [key, connection] of this.connections.entries()) {
      // Verificar si la conexión ha expirado
      if (connection.timestamp < expiredTime) {
        console.log(`⏱️ Removing expired SSE connection: ${key}`);
        this.removeConnection(key);
        continue;
      }
      try {
        // Enviar evento de keep-alive
        connection.res.write(`: keep-alive\n\n`);
        // Actualizar timestamp
        connection.timestamp = now;
      } catch (error) {
        console.error(`❌ Error sending keep-alive to ${key}:`, error);
        this.handleConnectionClose(key);
      }
    }
  }
  /**
   * Obtiene la clave de conexión para un usuario y canal
   * @param {string} userId - ID del usuario
   * @param {string} channel - Canal (web, facebook, etc.)
   * @returns {string} - Clave de conexión
   */
  getConnectionKey(userId, channel) {
    return `${channel}:${userId}`;
  }
  /**
   * Verifica si existe una conexión activa para un usuario y canal
   * @param {string} userId - ID del usuario
   * @param {string} channel - Canal (web, facebook, etc.)
   * @returns {boolean} - True si existe una conexión activa
   */
  hasActiveConnection(userId, channel) {
    const connectionKey = this.getConnectionKey(userId, channel);
    return this.connections.has(connectionKey);
  }
  /**
   * Obtiene estadísticas de conexiones activas
   * @returns {object} - Estadísticas de conexiones
   */
  getStats() {
    return {
      activeConnections: this.connections.size,
      connections: Array.from(this.connections.keys())
    };
  }
  removeConnection(connectionKey) {
    if (this.connections.has(connectionKey)) {
      const connection = this.connections.get(connectionKey);
      // Limpiar intervalo de ping
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }
      try {
        connection.res.end();
      } catch (error) {
        console.error(`Error closing connection ${connectionKey}:`, error);
      }
      this.connections.delete(connectionKey);
      this.reconnectAttempts.delete(connectionKey);
      console.log(`🔌 Connection removed: ${connectionKey}`);
    }
  }
  // Limpiar conexiones inactivas
  cleanupInactiveConnections() {
    const now = Date.now();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutos
    for (const [key, connection] of this.connections) {
      if (now - connection.lastActivity > inactiveThreshold) {
        console.log(`🧹 Cleaning up inactive connection: ${key}`);
        this.removeConnection(key);
      }
    }
  }
}
// Exportar instancia única
const sseManager = new SSEManager();
// Inicializar limpieza periódica
setInterval(() => {
  sseManager.cleanupInactiveConnections();
}, 60000); // Cada minuto
module.exports = sseManager; 
