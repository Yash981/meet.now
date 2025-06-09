import { Phone } from "lucide-react";
import { FeatureHighlights } from "./feature-highlights";

interface PreCallScreenProps {
  status: string;
  onStartCall: () => void;
}

export const PreCallScreen = ({ status, onStartCall }: PreCallScreenProps) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh]">
    <div className="text-center mb-8">
      <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
        Ready to Connect?
      </h2>
      <p className="text-gray-400 text-lg">
        Join the conversation with crystal clear video and audio
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mb-8">
      {/* Local preview */}
      <div className="relative">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 aspect-video shadow-2xl border border-slate-700/50">
          <video
            id="local-video"
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
          />
          <div className="absolute bottom-4 left-4">
            <span className="text-white text-sm font-medium bg-black/40 backdrop-blur-sm px-3 py-1 rounded-lg">
              You
            </span>
          </div>
        </div>
      </div>

      <FeatureHighlights />
    </div>

    <button
      onClick={onStartCall}
      disabled={status !== 'Ready' && status !== 'Connected'}
      className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl font-semibold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
    >
      <div className="flex items-center space-x-3">
        <Phone size={24} />
        <span>Start Call</span>
      </div>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600/50 to-blue-600/50 opacity-0 group-hover:opacity-100 transition-opacity blur-xl"></div>
    </button>
    {status !== 'Ready' && status !== "Connected" && (
      <p className="text-white mt-4">Please refresh the page</p>
    )}
  </div>
); 