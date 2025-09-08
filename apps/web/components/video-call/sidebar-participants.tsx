"use client";
import { useMemo } from "react";
import { Users, Mic, MicOff, Video, VideoOff, MonitorUp } from "lucide-react";
import { useUIStore, RemoteUser } from "@/store";
import { Badge } from "@/components/ui/badge";

export function SidebarParticipants({ localPeerId }: { localPeerId: string }) {
  const { remoteUsers, speakingUsers } = useUIStore();

  const participants = useMemo(() => Array.from(remoteUsers.values()), [remoteUsers]);

  return (
    <aside className="w-full lg:w-80 xl:w-96 shrink-0">
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-white/80">
            <Users size={16} />
            <span>Participants</span>
          </div>
          <Badge variant="outline" className="text-[10px]">{participants.length + (localPeerId ? 1 : 0)} total</Badge>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {/* Local user */}
          <ParticipantRow
            id={localPeerId}
            name="You"
            audioEnabled={true}
            videoEnabled={true}
            screenEnabled={false}
            isSpeaking={speakingUsers?.includes(localPeerId)}
            isLocal
          />
          {participants.map((u) => (
            <ParticipantRow
              key={u.id}
              id={u.id}
              name={u.name || `User ${u.id}`}
              audioEnabled={u.audioEnabled}
              videoEnabled={u.videoEnabled}
              screenEnabled={u.screenEnabled}
              isSpeaking={speakingUsers?.includes(u.id)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function ParticipantRow({
  id,
  name,
  audioEnabled,
  videoEnabled,
  screenEnabled,
  isSpeaking,
  isLocal,
}: {
  id: string;
  name: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenEnabled: boolean;
  isSpeaking?: boolean;
  isLocal?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 bg-slate-900/40 ${isSpeaking ? "ring-1 ring-green-400/60" : ""}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold">
          {(name?.charAt(0) || id?.charAt(0) || "U").toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-white/90 truncate">{name}</div>
          <div className="text-[10px] text-white/50">{isLocal ? "Local" : id}</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {screenEnabled && (
          <Badge variant="secondary" className="h-6 text-[10px] gap-1"><MonitorUp size={12}/> Share</Badge>
        )}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${audioEnabled ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-rose-600/20 border border-rose-600/30"}`}>
          {audioEnabled ? <Mic size={12} className="text-emerald-300"/> : <MicOff size={12} className="text-rose-300"/>}
        </div>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${videoEnabled ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-rose-600/20 border border-rose-600/30"}`}>
          {videoEnabled ? <Video size={12} className="text-emerald-300"/> : <VideoOff size={12} className="text-rose-300"/>}
        </div>
      </div>
    </div>
  );
}


