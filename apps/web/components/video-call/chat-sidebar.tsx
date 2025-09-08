"use client";
import { useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { encodeBinaryMessage, decodeBinaryMessage } from "@repo/utils";
import { EventMessage, EventPayloadMap, EventTypes } from "@repo/types";
import { useUIStore } from "@/store";

export function ChatSidebar({ localPeerId, localUserName = "You",roomId,ws }: { localPeerId: string; localUserName?: string,roomId:string,ws?:WebSocket | null }) {
  const [newMessage, setNewMessage] = useState("");
  const { messages, addMessage } = useUIStore();

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
        addMessage(message);
      }
    };

    ws.addEventListener("message", handleReceiveMessage);
    return () => {
      ws.removeEventListener("message", handleReceiveMessage);
    };
  }, [ws, addMessage]);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    console.log("Sending message:", newMessage,localPeerId,localUserName);
    const message: EventPayloadMap[typeof EventTypes.SEND_CHAT_MESSAGE] = {
      roomId: roomId,
      peerId: localPeerId,
      peerName: localUserName,
      message: newMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    addMessage(message);
    setNewMessage("");
    
    if(ws && ws.readyState === WebSocket.OPEN){
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
  console.log("Messages:", messages,localPeerId);
  for(let msg of messages){
    console.log(msg.peerId,localPeerId,msg.peerId === localPeerId);
  }
  return (
    <aside className="w-full lg:w-80 xl:w-96 shrink-0">
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md shadow-xl p-4 h-[calc(100vh-13rem)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-white/80">
            <MessageSquare size={16} />
            <span>Chat</span>
          </div>
          <Badge variant="outline" className="text-[10px]">{messages.length} messages</Badge>
        </div>

        {/* Messages Container */}
        <div className="space-y-4 overflow-y-auto h-[calc(100%-6rem)] mb-4 pr-2">
          {messages.map((message,index) => (
            <div
              key={index}
              className={`flex flex-col ${
                message.peerId === localPeerId ? "items-end" : "items-start"
              }`}
            >
              <div className={`max-w-[85%] ${
                message.peerId === localPeerId
                  ? "bg-indigo-500/20 border-indigo-500/30"
                  : "bg-slate-800/80 border-white/10"
                } border rounded-xl px-3 py-2`}
              >
                <div className="text-xs text-white/50 mb-1">
                  {message.peerId=== localPeerId ? "You" : message.peerId}
                </div>
                <div className="text-sm text-white/90">{message.message}</div>
                <div className="text-xs text-white/40 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
            ))}
        </div>

        {/* Message Input */}
        <div className="flex items-center gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message..."
            className="bg-slate-800/80 border-white/10 text-white"
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
      </div>
    </aside>
  );
}
