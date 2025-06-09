import { useEffect, useRef, useCallback } from 'react';
import { EventMessage, EventTypes } from '@repo/types';

interface UseWebSocketProps {
  onMessage: (data: EventMessage) => void;
  onStatusChange: (status: string) => void;
}

export const useWebSocket = ({ onMessage, onStatusChange }: UseWebSocketProps) => {
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      onStatusChange("Connected");
      ws.send(JSON.stringify({
        type: EventTypes.JOIN_ROOM,
        message: {
          roomId: "123"
        }
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as EventMessage;
      onMessage(data);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      onStatusChange("Disconnected");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      onStatusChange("Connection error");
    };
  }, [onMessage, onStatusChange]);

  const sendMessage = useCallback((message: EventMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    sendMessage,
    wsRef,
  };
}; 