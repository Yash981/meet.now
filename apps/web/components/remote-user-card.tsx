"use client"
import { RemoteUser, useUIStore } from '@/store'
import { MicOff, MonitorUp, VideoOff } from 'lucide-react';
import React, { useEffect, useMemo, useRef } from 'react'

const RemoteUserCard = React.memo(({ user, speakingUsers }: { user: RemoteUser, speakingUsers: string[] }) => {
    const {remoteUsers} = useUIStore()
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
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white text-xl font-bold">
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
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 aspect-video shadow-2xl border border-slate-700/50">
                        <video
                            ref={screenRef}
                            className="w-full h-full object-contain bg-black"
                            autoPlay
                            playsInline
                        />

                        {/* Screen share indicator */}
                        <div className="absolute top-3 left-3">
                            <div className="flex items-center space-x-2 bg-blue-500/80 backdrop-blur-sm px-3 py-1 rounded-lg">
                                <MonitorUp size={16} className="text-white" />
                                <span className="text-white text-sm font-medium">
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
        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 aspect-video shadow-2xl border-4 ${(speakingUsers?.length > 0 &&
          speakingUsers?.includes(user.id))
          ? "border-green-500 ring-2 ring-green-300/70 animate-blink"
          : "border-transparent"
          }`}>
          {videoElement}
          {/* User controls overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-white text-sm font-medium bg-black/40 backdrop-blur-sm px-2 py-1 rounded-lg">
                {user.name || `User ${user.id}`}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              {!user.audioEnabled && (
                <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center">
                  <MicOff size={12} className="text-white" />
                </div>
              )}
              {!user.videoEnabled && (
                <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center">
                  <VideoOff size={12} className="text-white" />
                </div>
              )}
            </div>
          </div>

          {/* Connection indicator */}
          <div className="absolute top-3 right-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
          </div>
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />
      </div>
    );
})
export default RemoteUserCard

RemoteUserCard.displayName = "RemoteUserCard"