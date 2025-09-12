"use client";
import { Background } from "@/components/video-call/background";
import { PreCallScreen } from "@/components/video-call/pre-call-screen";


export default function PreCallScreenPage() {
  return (
    <div className="min-h-screen  text-white relative overflow-hidden">
      <Background />
      <div className="relative z-10 p-4 md:p-6 max-w-[1400px] mx-auto">
          <PreCallScreen
            status={status}
          />
      </div>
    </div>
  );
}