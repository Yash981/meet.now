import { MicOff, VideoOff } from "lucide-react";
import { memo, useEffect } from "react";

interface LocalVideoProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isSpeaking: boolean;
  orderLast?: boolean;
  videoStream: MediaStream | null
}

export const LocalVideo = memo(({ isAudioEnabled, isVideoEnabled, isSpeaking, orderLast,videoStream }: LocalVideoProps) => {
  useEffect(()=>{
    const localVideoEl = document.getElementById("local-video") as HTMLVideoElement;
      if (localVideoEl && isVideoEnabled && videoStream) {
        localVideoEl.srcObject = videoStream;
      }
  },[isVideoEnabled])
  return (
    <div className={`relative ${orderLast ? 'order-last' : ''}`}>
      <div className={`relative overflow-hidden rounded-2xl bg-muted aspect-video shadow-xl md:shadow-2xl border border-border/50 ${isSpeaking ? "ring-2 ring-green-500/70 animate-blink" : "ring-0"
        }`}>
        {isVideoEnabled &&
        <video
          id="local-video"
          className="w-full h-full object-cover"
          autoPlay
          muted
          playsInline
        />} 
        {!isVideoEnabled && 
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <span className="text-primary-foreground text-xl font-bold">{"U"}</span>
            </div>
          </div>
        }
        <div className="absolute bottom-3 left-3">
          <span className="text-foreground text-xs md:text-sm font-medium bg-background/40 backdrop-blur-sm px-2 py-1 rounded-lg border border-border/20">
            You
          </span>
        </div>
        <div className="absolute bottom-3 right-3 flex items-center space-x-1">
          {!isAudioEnabled && (
            <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center border border-red-500/30">
              <MicOff size={12} className="text-white" />
            </div>
          )}
          {!isVideoEnabled && (
            <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center border border-red-500/30">
              <VideoOff size={12} className="text-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}); 
LocalVideo.displayName = "LocalVideo"