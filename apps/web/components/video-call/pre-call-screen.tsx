"use client";

import { Plus, LogIn } from "lucide-react";
import { FeatureHighlights } from "./feature-highlights";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export const PreCallScreen = () => {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();


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

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="text-center mb-8">
        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
          Ready to Connect?
        </h2>
        <p className="text-gray-400 text-base md:text-lg">
          Join the conversation with crystal clear video and audio
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full max-w-5xl mb-8">
        {/* Local preview */}
        <div className="relative">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 aspect-video shadow-xl md:shadow-2xl border border-white/10">
            <video
              id="local-video"
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
            <div className="absolute bottom-4 left-4">
              <span className="text-white text-xs md:text-sm font-medium bg-black/40 backdrop-blur-sm px-3 py-1 rounded-lg">
                You
              </span>
            </div>
          </div>
        </div>

        <FeatureHighlights />
      </div>

      {/* Room Controls */}
      <div className="flex flex-col gap-4 w-full max-w-md mb-8">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="bg-slate-800/50 border-white/10"
          />
          <Button
            onClick={handleJoinRoom}
            disabled={!roomId.trim()}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-500"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Join Room
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-2 text-white/50">or</span>
          </div>
        </div>

        <Button
          onClick={handleCreateRoom}
          className="w-full bg-fuchsia-600 hover:bg-fuchsia-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create New Room
        </Button>
      </div>
      {isPending && (
        <div className="flex justify-center items-center mt-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"></div>
          <span className="ml-2">Please wait while we set up your call...</span>
        </div>
      )}
    </div>
  );
};