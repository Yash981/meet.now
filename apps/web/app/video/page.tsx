"use client";
import { Background } from "@/components/video-call/background";
import { Header } from "@/components/video-call/header";
import { PreCallScreen } from "@/components/video-call/pre-call-screen";


export default function PreCallScreenPage() {
  return (
    <div className="min-h-screen text-foreground relative overflow-hidden">
      <Background />
      <div className="relative z-10 p-4 md:p-6 max-w-[1400px] mx-auto">
        <Header />
      </div>
      <div className="relative z-10 p-4 md:p-6 max-w-[1400px] mx-auto">
        <PreCallScreen />
      </div>
    </div>
  );
}