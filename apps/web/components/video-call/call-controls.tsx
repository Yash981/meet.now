import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, PhoneOff } from "lucide-react";

interface CallControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onEndCall: () => void;
}

export const CallControls = ({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onEndCall
}: CallControlsProps) => (
  <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2">
    <div className="flex items-center space-x-4 bg-slate-800/80 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-slate-700/50">
      <button
        onClick={onToggleAudio}
        className={`p-3 rounded-xl transition-all ${
          isAudioEnabled
            ? 'bg-slate-700 hover:bg-slate-600 text-white'
            : 'bg-red-500 hover:bg-red-600 text-white'
        }`}
      >
        {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
      </button>

      <button
        onClick={onToggleVideo}
        className={`p-3 rounded-xl transition-all ${
          isVideoEnabled
            ? 'bg-slate-700 hover:bg-slate-600 text-white'
            : 'bg-red-500 hover:bg-red-600 text-white'
        }`}
      >
        {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
      </button>

      <button
        onClick={onToggleScreenShare}
        className={`p-3 rounded-xl ${
          !isScreenSharing
            ? 'bg-slate-700 hover:bg-slate-600 text-white'
            : 'bg-red-500 hover:bg-red-600 text-white'
        } transition-all`}
      >
        {isScreenSharing ? <MonitorX size={20} /> : <MonitorUp size={20} />}
      </button>

      <button
        onClick={onEndCall}
        className="p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all"
      >
        <PhoneOff size={20} />
      </button>
    </div>
  </div>
); 