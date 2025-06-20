import { useEffect, useRef, useCallback } from 'react';
import { EventMessage, EventTypes } from '@repo/types';
import { decodeBinaryMessage, encodeBinaryMessage } from '@repo/utils';
import { useUIStore } from '@/store';

interface UseWebSocketProps {
  onMessage: (event: EventMessage) => Promise<void>;
  onStatusChange: (status: string) => void;
}

export const useWebSocket = ({ onMessage, onStatusChange }: UseWebSocketProps) => {
  const {setRemoteUsers} = useUIStore()
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080");
    ws.binaryType = "arraybuffer"
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      onStatusChange("Connected");
      ws.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.JOIN_ROOM,
        message: {
          roomId: "123"
        }
      })))
    };

    ws.onmessage = (event) => {
      try {
        const decodedData = decodeBinaryMessage(event.data)
        const data = JSON.parse(decodedData) as EventMessage;
        onMessage(data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
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
      wsRef.current.send(encodeBinaryMessage(JSON.stringify(message)));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        useUIStore.getState().remoteUsers.forEach((user) => {
          user.stream?.getTracks().forEach((track) => track.stop());
          user.screenStream?.getTracks().forEach((track) => track.stop());
        });
        setRemoteUsers(new Map());
      }
    };
  }, []);

  return {
    sendMessage,
    wsRef,
  };
}; 