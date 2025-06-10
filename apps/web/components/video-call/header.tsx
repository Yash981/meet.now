import { Video, Users, Settings, Maximize2 } from "lucide-react";
import Link from "next/link";

interface HeaderProps {
  status: string;
  isInCall: boolean;
  participantCount: number;
}

export const Header = ({ status, isInCall, participantCount }: HeaderProps) => (
  <div className="flex items-center justify-between mb-8">
    <div className="flex items-center space-x-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
        <Video className="text-white" size={24} />
      </div>
      <div>
        <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
          Meet Now
        </Link>
        <div className="flex items-center space-x-4 text-sm text-gray-400">
          <span className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${status === 'Connected' || status === 'Ready' || status === 'In call' ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span>{status}</span>
          </span>
          {isInCall && (
            <span className="flex items-center space-x-1">
              <Users size={14} />
              <span>{participantCount + 1} participants</span>
            </span>
          )}
        </div>
      </div>
    </div>

    {isInCall && (
      <div className="flex items-center space-x-2">
        <button className="p-2 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 transition-all" aria-label="Open settings">
          <Settings size={20} />
        </button>
        <button className="p-2 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 transition-all" aria-label="Maximize window">
          <Maximize2 size={20} />
        </button>
      </div>
    )}
  </div>
); 