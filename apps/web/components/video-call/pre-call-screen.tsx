"use client";

import { Plus, LogIn, Video, Users, Volume2, Camera, Mic, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export const PreCallScreen = () => {
  const [roomId, setRoomId] = useState("");
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const router = useRouter();
  
  const [isPending, startTransition] = useTransition();
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoEnabled,
          audio: isAudioEnabled,
        });
        
        streamRef.current = stream;
        
        const videoElement = document.getElementById("local-video") as HTMLVideoElement;
        if (videoElement) {
          videoElement.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    initializeMedia();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
    //eslint-disable-next-line
  }, []);

  const handleCreateRoom = () => {
    const newRoomId = crypto.randomUUID();
    startTransition(() => {
    router.push(`/video/${newRoomId}`);
    });
  };

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      startTransition(() => {
      router.push(`/video/${roomId.trim()}`);
      });
    }
  };

  const toggleVideo = () => {
    const videoTrack = streamRef.current
    ?.getVideoTracks()
    ?.find((track) => track.kind === "video");
  if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
  setIsVideoEnabled((prev) => !prev);
  };

  const toggleAudio = () => {
    const audioTrack = streamRef.current
    ?.getAudioTracks()
    ?.find((track) => track.kind === "audio");
  if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
  setIsAudioEnabled((prev) => !prev);
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 border-b">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center gap-1">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Start Your Meeting
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Connect with video and audio. Join a room or create one instantly.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full px-4">
          <div className="grid lg:grid-cols-3 gap-4 h-full py-4">
            {/* Video Preview Section */}
            <div className="lg:col-span-2 min-h-0">
              <Card className="overflow-hidden border-border/50 aspect-video">
                <CardContent className="p-0 aspect-video">
                  <div className="relative aspect-video shadow-xl md:shadow-2xl border border-border/50 bg-muted rounded-lg">
                    <video
                      id="local-video"
                      className="w-full h-full object-cover"
                      autoPlay
                      muted
                      playsInline
                    />

                    {/* Video Controls Overlay */}
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                            <Camera className="w-3 h-3 mr-1" />
                            {isVideoEnabled ? "Camera On" : "Camera Off"}
                          </Badge>
                          <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
                            <Mic className="w-3 h-3 mr-1" />
                            {isAudioEnabled ? "Mic On" : "Mic Off"}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant={isVideoEnabled ? "default" : "destructive"}
                            onClick={toggleVideo}
                            className="w-9 h-9 rounded-full"
                          >
                            <Camera className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant={isAudioEnabled ? "default" : "destructive"}
                            onClick={toggleAudio}
                            className="w-9 h-9 rounded-full"
                          >
                            <Mic className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4 min-h-0 overflow-hidden">
              {/* Join Room */}
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Join a Room
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <Input
                        type="text"
                        placeholder="Enter Room ID"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="mb-2"
                      />
                    </div>
                    <Button
                      onClick={handleJoinRoom}
                      disabled={!roomId.trim() || isPending}
                      className="w-full"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Join Room
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Create Room */}
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create New Room
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Start a new meeting and invite others to join
                  </p>
                  <Button
                    onClick={handleCreateRoom}
                    disabled={isPending}
                    className="w-full "
                    variant="secondary"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Meeting
                  </Button>
                </CardContent>
              </Card>

              {/* Features */}
              <Card className="border-border/50 min-h-0">
                <CardContent className="p-4 overflow-auto max-h-[calc(100%-0px)]">
                  <h3 className="font-semibold text-base mb-3">Features</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-green-500/20 flex items-center justify-center">
                        <Video className="w-4 h-4 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">HD Video</p>
                        <p className="text-xs text-muted-foreground">Crystal clear quality</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-blue-500/20 flex items-center justify-center">
                        <Users className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Multi-user</p>
                        <p className="text-xs text-muted-foreground">Up to 50 participants</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center">
                        <Volume2 className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Clear Audio</p>
                        <p className="text-xs text-muted-foreground">Noise cancellation</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isPending && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="p-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 animate-spin rounded-full border-4 border-muted border-t-primary"></div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground">Setting up your meeting...</h3>
                <p className="text-sm text-muted-foreground">Please wait while we prepare everything</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};