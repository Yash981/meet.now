"use client";
import { useEffect, useState, useRef } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { encodeBinaryMessage, decodeBinaryMessage } from "@repo/utils";
import { EventMessage, EventPayloadMap, EventTypes } from "@repo/types";
import { useUIStore } from "@/store";

export function ChatSidebar({ localPeerId, localUserName = "You", roomId, ws }: { localPeerId: string; localUserName?: string, roomId: string, ws?: WebSocket | null }) {
  const [newMessage, setNewMessage] = useState("");
  const { messages, addMessage, typingUsers, addTypingUser, removeTypingUser } = useUIStore();
  const lastTypingRef = useRef<number>(0);

  useEffect(() => {
    if (!ws) return;

    const handleReceiveMessage = (event: MessageEvent) => {
      const decodedData = decodeBinaryMessage(event.data)
      const data = JSON.parse(decodedData) as EventMessage;
      if (data.type === EventTypes.RECEIVE_CHAT_MESSAGE) {
        const payload = data.message as EventPayloadMap[typeof EventTypes.RECEIVE_CHAT_MESSAGE];
        const message: EventPayloadMap[typeof EventTypes.RECEIVE_CHAT_MESSAGE] = {
          roomId: payload.roomId,
          peerId: payload.peerId,
          peerName: payload.peerName,
          message: payload.message,
          timestamp: new Date(payload.timestamp).toISOString(),
        };
        removeTypingUser(payload.peerId);
        addMessage(message);
      } else if (data.type === EventTypes.TYPING) {
        const payload = data.message as EventPayloadMap[typeof EventTypes.TYPING];
        if (payload.peerId !== localPeerId) {
          addTypingUser(payload.peerId, payload.peerId);
        }
      }
    };

    ws.addEventListener("message", handleReceiveMessage);
    return () => {
      ws.removeEventListener("message", handleReceiveMessage);
    };
  }, [ws, addMessage, addTypingUser, removeTypingUser, localPeerId]);
  useEffect(() => {
    // console.log("Typingusers 47", typingUsers);
    const interval = setInterval(() => {
      const now = Date.now();
      typingUsers.forEach((info, peerId) => {
        if (now - info.timestamp > 3000) {
          removeTypingUser(peerId);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [typingUsers, removeTypingUser]);
  const sendTypingIndicator = () => {
    const now = Date.now();
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(encodeBinaryMessage(JSON.stringify({
          type: EventTypes.TYPING,
          message: {
            roomId,
            peerId: localPeerId
          }
        })));
      }
    }
  };


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);
    if (value.length > 0) {
      sendTypingIndicator();
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    const message: EventPayloadMap[typeof EventTypes.SEND_CHAT_MESSAGE] = {
      roomId: roomId,
      peerId: localPeerId,
      peerName: localUserName,
      message: newMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    addMessage(message);
    setNewMessage("");

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.SEND_CHAT_MESSAGE,
        message: {
          roomId,
          peerId: localPeerId,
          peerName: localUserName,
          message: newMessage.trim(),
          timestamp: new Date().toISOString(),
        }
      })));
    }
  };
  return (
    <aside className="w-full lg:w-80 xl:w-96 shrink-0">
      <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-md shadow-xl p-4 h-[calc(100vh-13rem)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare size={16} />
            <span>Chat</span>
          </div>
          <Badge variant="outline" className="text-[10px]">{messages.length} messages</Badge>
        </div>

        <div className="space-y-4 overflow-y-auto h-[calc(100%-6rem)] mb-4 pr-2">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex flex-col ${message.peerId === localPeerId ? "items-end" : "items-start"
                }`}
            >
              <div className={`max-w-[85%] ${message.peerId === localPeerId
                ? "bg-primary/20 border-primary/30"
                : "bg-muted/80 border-border/60"
                } border rounded-xl px-3 py-2`}
              >
                <div className="text-xs text-muted-foreground mb-1">
                  {message.peerId === localPeerId ? "You" : message.peerId}
                </div>
                <div className="text-sm text-foreground">{message.message}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={newMessage}
            onChange={(e) => handleInputChange(e)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message..."
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSendMessage}
            className="shrink-0"
          >
            <Send size={18} />
          </Button>
        </div>
        <div className="">
          {typingUsers.size > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-2 h-6">
              <span>
                {Array.from(typingUsers.values())
                  .map(info => info.name)
                  .join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing
              </span>
              <span className="relative flex h-0 w-6 top-0.5 left-0">
                <span className="animate-bounce [animation-delay:-0.3s] inline-block w-1 h-1 bg-muted-foreground rounded-full mx-[1.5px]" />
                <span className="animate-bounce [animation-delay:-0.15s] inline-block w-1 h-1 bg-muted-foreground rounded-full mx-[1.5px]" />
                <span className="animate-bounce inline-block w-1 h-1 bg-muted-foreground rounded-full mx-[1.5px]" />
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
