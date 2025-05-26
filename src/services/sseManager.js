/**
 * Gestor de conexiones Server-Sent Events (SSE)
 * Permite mantener conexiones abiertas con los clientes y enviar respuestas en tiempo real
 */

class SSEManager {
  constructor() {
    // Mapa de conexiones activas por usuario y canal
    this.connections = new Map();
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
      timestamp: Date.now()
    });
    console.log(`🔌 New SSE connection registered: ${connectionKey}`);
    // Manejar cierre de conexión
    res.on('close', () => {
      this.connections.delete(connectionKey);
      console.log(`🔌 SSE connection closed: ${connectionKey}`);
    });
    return true;
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
      console.log(`⚠️ No active SSE connection for ${connectionKey}`);
      return false;
    }
    try {
      const eventData = JSON.stringify({
        type,
        message,
        timestamp: Date.now()
      });
      connection.res.write(`data: ${eventData}\n\n`);
      console.log(`📤 SSE message sent to ${connectionKey}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
      return true;
    } catch (error) {
      console.error(`❌ Error sending SSE message to ${connectionKey}:`, error);
      // Si hay error, eliminar la conexión
      this.connections.delete(connectionKey);
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
        this.connections.delete(key);
        continue;
      }
      try {
        // Enviar evento de keep-alive
        connection.res.write(`: keep-alive\n\n`);
        // Actualizar timestamp
        connection.timestamp = now;
      } catch (error) {
        console.error(`❌ Error sending keep-alive to ${key}:`, error);
        // Si hay error, eliminar la conexión
        this.connections.delete(key);
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
}
// Exportar instancia única
module.exports = new SSEManager(); 