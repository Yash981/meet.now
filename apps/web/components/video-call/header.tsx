"use client";
import { useEffect, useState } from "react";
import { Video, Users, Settings, Maximize2, UserPlus, Link as LinkIcon, PanelsTopLeft, PanelRightOpen, Minimize2 } from "lucide-react";
import Link from "next/link";
import { ModeToggle } from "../toggle-mode";

interface HeaderProps {
  status?: string;
  isInCall?: boolean;
  participantCount?: number;
  onCopyLink?: () => void;
  onInvite?: () => void;
  onToggleSidebar?: () => void;
  showSidebar?: boolean;
  maximize: () => void;
  minimize: () => void;
}




export const Header = ({ status, isInCall, participantCount, onCopyLink, onInvite, onToggleSidebar, showSidebar = false,maximize,minimize }: HeaderProps) => {
  return (
    <div className="flex items-center justify-between mb-6 md:mb-8">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-indigo-900/30">
          <Video className="text-white" size={24} />
        </div>
        <div>
          <Link href="/" className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Meet Now
          </Link>
          {status && <div className="flex items-center space-x-4 text-sm text-gray-400">
            <span className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${status === 'Connected' || status === 'Ready' || status === 'In call' ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span>{status}</span>
            </span>
            {isInCall && (
              <span className="flex items-center space-x-1">
                <Users size={14} />
                <span>{(participantCount || 0) + 1} participants</span>
              </span>
            )}
          </div>}
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {isInCall && (
          <>
            <button onClick={onInvite} className="p-2 rounded-lg  hover:bg-slate-700/60 transition-all border border-white/10" aria-label="Invite">
              <UserPlus size={18} />
            </button>
            <button onClick={onCopyLink} className="p-2 rounded-lg  hover:bg-slate-700/60 transition-all border border-white/10 cursor-pointer" aria-label="Copy link">
              <LinkIcon size={18} />
            </button>
            <button onClick={onToggleSidebar} className="hidden lg:inline-flex p-2 rounded-lg  hover:bg-slate-700/60 transition-all border border-white/10" aria-label="Toggle sidebar">
              {showSidebar ? <PanelsTopLeft size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </>
        )}
        <ModeToggle />
        {isInCall && (
          <>
            <button className="p-2 rounded-lg  hover:bg-slate-700/60 transition-all border border-white/10" aria-label="Open settings">
              <Settings size={18} />
            </button>
            <FullscreenToggleButton maximize={maximize} minimize={minimize} />
          </>
        )}
      </div>
    </div>
  );
};
function FullscreenToggleButton({ maximize, minimize }: { maximize: () => void; minimize: () => void }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleChange);
    handleChange();
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const handleClick = () => {
    if (isFullscreen) {
      minimize();
    } else {
      maximize();
    }
  };

  return (
    <button
      className="p-2 rounded-lg  hover:bg-slate-700/60 transition-all border border-white/10"
      aria-label={isFullscreen ? "Minimize window" : "Maximize window"}
      onClick={handleClick}
    >
      {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
    </button>
  );
}