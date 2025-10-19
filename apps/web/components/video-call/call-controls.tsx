"use client";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, PhoneOff, MessageSquare, Sparkles, Settings, Square, Circle } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";

interface CallControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isRecording?: boolean;
  showChat?: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleRecording: () => void;
  onToggleChat?: () => void;
  onEndCall: () => void;
}

export const CallControls = ({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onEndCall,
  isRecording,
  onToggleRecording,
  onToggleChat,
  showChat = false,
}: CallControlsProps) => {
    const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const ControlButton = ({ 
    onClick, 
    isActive, 
    isDestructive = false,
    children,
    id,
  }: {
    onClick: () => void;
    isActive?: boolean;
    isDestructive?: boolean;
    children: React.ReactNode;
    id: string;
  }) => (
    <Button
      onClick={onClick}
      onMouseEnter={() => setHoveredButton(id)}
      onMouseLeave={() => setHoveredButton(null)}
      size="icon"
      variant={isDestructive ? "destructive" : (isActive === false ? "destructive" : "secondary")}
      className={`
        relative w-10 h-10 md:w-12 md:h-12 !rounded-full transition-all duration-200 transform
        ${hoveredButton === id ? 'scale-110 cursor-pointer' : 'scale-100'}
        shadow-lg hover:shadow-xl
        ${isDestructive 
          ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' 
          : isActive === false 
            ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' 
            : 'bg-background text-foreground hover:bg-muted border'
        }
      `}
    >
      <div className="flex items-center justify-center w-full h-full">
        {children}
      </div>
    </Button>
  );
  return (
    <div className="fixed bottom-6 md:bottom-8 left-1/2 transform -translate-x-1/2 z-50">
      <div className="flex items-center space-x-2 md:space-x-3 bg-card/80 backdrop-blur-xl rounded-full p-3 md:p-4 shadow-2xl border border-border/50">
        
        {/* Audio Control */}
        <ControlButton
          onClick={onToggleAudio}
          isActive={isAudioEnabled}
          id="audio"
        >
          {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </ControlButton>

        {/* Video Control */}
        <ControlButton
          onClick={onToggleVideo}
          isActive={isVideoEnabled}
          id="video"
        >
          {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </ControlButton>

        {/* Screen Share Control */}
        <ControlButton
          onClick={onToggleScreenShare}
          isActive={!isScreenSharing}
          id="screen"
        >
          {isScreenSharing ? <MonitorX size={20} /> : <MonitorUp size={20} />}
        </ControlButton>

        {/* Chat/Messages */}
        <ControlButton
          onClick={() => onToggleChat?.()}
          isActive={!showChat}
          id="chat"
        >
          <MessageSquare size={20} />
        </ControlButton>

        {/* Effects/Filters */}
        <ControlButton
          onClick={() => {}}
          isActive={true}
          id="effects"
        >
          <Sparkles size={20} />
        </ControlButton>

        {/* Settings */}
        <ControlButton
          onClick={() => {}}
          isActive={true}
          id="settings"
        >
          <Settings size={20} />
        </ControlButton>

        {/* Record Control */}
        <ControlButton
          onClick={onToggleRecording}
          isActive={true}
          id="record"
        >
          {isRecording ? (
            <Square size={16} fill="currentColor" />
          ) : (
            <div className="relative">
              <Circle size={16} stroke="currentColor" fill="none" strokeWidth={2} />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-red-500 rounded-full"></div>
            </div>
          )}
        </ControlButton>

        {/* End Call Control */}
        <ControlButton
          onClick={onEndCall}
          isDestructive={true}
          id="end"
        >
          <PhoneOff size={20} />
        </ControlButton>
      </div>
    </div>
)
}; 