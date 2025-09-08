"use client";
import { useState } from "react";
import { toast } from "sonner";
import { EventTypes } from "@repo/types";
import { encodeBinaryMessage } from "@repo/utils";
import type { PeerClientState } from "../types";

export function useScreenShare(
  mediaSoupClientState: React.MutableRefObject<PeerClientState>,
  wsRef: React.MutableRefObject<WebSocket | null>,
  setStatus: (s: string) => void
) {
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const toggleScreenShare = async (browserStopSharing?: boolean) => {
    if (isScreenSharing || browserStopSharing === true) {
      try {
        if (mediaSoupClientState.current.screenStream) {
          mediaSoupClientState.current.screenStream.getTracks().forEach(track => track.stop());
          mediaSoupClientState.current.screenStream = null;
        }
        const screenProducer = Array.from(mediaSoupClientState.current.producers.values())
          .find(producer => producer.appData?.type === 'screen');
        if (screenProducer) {
          screenProducer.close();
          mediaSoupClientState.current.producers.delete(screenProducer.id);
          wsRef.current?.send(encodeBinaryMessage(JSON.stringify({
            type: EventTypes.PRODUCER_CLOSED,
            message: { producerId: screenProducer.id, kind: "screen", roomId: "123" }
          })));
        }
        setIsScreenSharing(false);
        setStatus("In call");
        toast.success("Screen sharing stopped", { duration: 3000, position: "top-center", style: { backgroundColor: "#ffffff", color: "#000000" } });
      } catch (error) {
        setStatus("Error stopping screen sharing");
        toast.error("Error stopping screen sharing", { duration: 3000, position: "top-center", style: { backgroundColor: "#ffffff", color: "#000000" } });
      }
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 15, max: 30 } }
      });
      mediaSoupClientState.current.screenStream = screenStream;

      screenStream.getVideoTracks()[0]?.addEventListener("ended", async () => {
        await toggleScreenShare(true);
      });

      if (mediaSoupClientState.current.sendTransport) {
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
          setIsScreenSharing(true);
          const screenProducer = await mediaSoupClientState.current.sendTransport.produce({
            track: videoTrack,
            encodings: [
              { rid: "r0", maxBitrate: 500000, scalabilityMode: "S1T3" },
              { rid: "r1", maxBitrate: 1000000, scalabilityMode: "S1T3" },
              { rid: "r2", maxBitrate: 2000000, scalabilityMode: "S1T3" }
            ],
            codecOptions: { videoGoogleStartBitrate: 1000 },
            appData: { type: "screen" }
          });
          if (screenProducer) {
            mediaSoupClientState.current.producers.set(screenProducer.id, screenProducer);
          }
        }
        setStatus("Screen Sharing active");
        toast.success("Screen Sharing Started", { duration: 3000, position: "top-center", style: { backgroundColor: "#ffffff", color: "#000000" } });
      }
    } catch (error: any) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setIsScreenSharing(false);
        toast.error("Screen sharing was cancelled.", { duration: 3000, position: "top-center", style: { backgroundColor: "#ffffff", color: "#000000" } });
      } else {
        toast.error("Failed to start screen sharing", { duration: 3000, position: "top-center", style: { backgroundColor: "#ffffff", color: "#000000" } });
      }
    }
  };

  return { isScreenSharing, toggleScreenShare } as const;
}


