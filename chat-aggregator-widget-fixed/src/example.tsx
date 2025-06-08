import React from 'react';
import { EmbeddedChat } from './components/EmbeddedChat';

export default function ChatPage() {
  return (
    <div className="chat-page-container">
      <h1>Ejemplo de Integración</h1>
      <div className="chat-container">
        <EmbeddedChat 
          title="Asistente Virtual"
          welcomeMessage="¡Hola! Soy el asistente virtual. ¿En qué puedo ayudarte hoy?"
          height="500px"
          onSendMessage={(message) => console.log('Mensaje enviado:', message)}
          onReceiveMessage={(message) => console.log('Mensaje recibido:', message)}
        />
      </div>
    </div>
  );
}
