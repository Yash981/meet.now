"use client"
import { RemoteUser } from '@/store'
import { MicOff, MonitorUp, VideoOff } from 'lucide-react';
import React, { useEffect, useMemo, useRef } from 'react'

const RemoteUserCard = React.memo(({ user, speakingUsers }: { user: RemoteUser, speakingUsers: string[] }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const screenRef = useRef<HTMLVideoElement>(null);
    const videoElement = useMemo(() => {
        if (user.videoEnabled && user.stream) {
            return (
                <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                    id={`remote-video-${user.id}`}
                    key={user.id}
                />
            );
        } else {
            return (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                    <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-primary-foreground text-xl font-bold">
                            {user.id?.charAt(0) || "U"}
                        </span>
                    </div>
                </div>
            );
        }
    }, [user.videoEnabled, user.stream, user.id]);
    useEffect(() => {
        const setupMedia = async () => {
            if (user.stream && videoRef.current && !user.screenEnabled) {
                videoRef.current.srcObject = user.stream
            }
            if (user.screenStream && screenRef.current) {
                screenRef.current.srcObject = user.screenStream;
            }
            if (user.audioConsumer && audioRef.current) {
                const audioStream = new MediaStream([user.audioConsumer.track]);
                audioRef.current.srcObject = audioStream;
            }
        };

        setupMedia();
    }, [user.stream, user.audioConsumer, user.screenStream,user.videoEnabled]);
    if (user.screenEnabled && user.screenStream) {
        return (
            <div className="col-span-full lg:col-span-3">
                <div className="relative group">
                    <div className="relative overflow-hidden rounded-2xl bg-muted aspect-video shadow-xl md:shadow-2xl border border-border/50">
                        <video
                            ref={screenRef}
                            className="w-full h-full object-contain bg-background"
                            autoPlay
                            playsInline
                        />

                        {/* Screen share indicator */}
                        <div className="absolute top-3 left-3">
                            <div className="flex items-center space-x-2 bg-primary/80 backdrop-blur-sm px-3 py-1 rounded-lg border">
                                <MonitorUp size={16} className="text-primary-foreground" />
                                <span className="text-primary-foreground text-sm font-medium">
                                    {user.name || `User ${user.id}`} is sharing screen
                                </span>
                            </div>
                        </div>

                        {/* Small video overlay */}
                        {/* <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden bg-slate-800 border border-slate-600">
                            {user.videoEnabled && user.stream ? (
                                <video
                                    ref={videoRef}
                                    className="w-full h-full object-cover"
                                    autoPlay
                                    playsInline
                                    muted
                                    id="screen-video"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                        <span className="text-white text-xs font-bold">
                                            {user.id?.charAt(0) || "U"}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div> */}
                    </div>
                    <audio ref={audioRef} autoPlay className="hidden" />
                </div>
            </div>
        )
    }
    return (
      <div className="relative group">
        <div className={`relative overflow-hidden rounded-2xl bg-muted aspect-video shadow-xl md:shadow-2xl border border-border/50 ${(speakingUsers?.length > 0 &&
          speakingUsers?.includes(user.id))
          ? "ring-2 ring-green-500/70 animate-blink"
          : "ring-0"
          }`}>
          {videoElement}
          {/* User controls overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-foreground text-xs md:text-sm font-medium bg-background/40 backdrop-blur-sm px-2 py-1 rounded-lg border border-border/20">
                {user.name || `User ${user.id}`}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              {!user.audioEnabled && (
                <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center border border-red-500/30">
                  <MicOff size={12} className="text-white" />
                </div>
              )}
              {!user.videoEnabled && (
                <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center border border-red-500/30">
                  <VideoOff size={12} className="text-white" />
                </div>
              )}
            </div>
          </div>

          {/* Connection indicator */}
          <div className="absolute top-3 right-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse border border-green-500/30"></div>
          </div>
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />
      </div>
    );
})
export default RemoteUserCard

RemoteUserCard.displayName = "RemoteUserCard"