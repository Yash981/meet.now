import { Video, Users, Volume2 } from "lucide-react";

export const FeatureHighlights = () => (
  <div className="flex flex-col justify-center space-y-6">
    <div className="flex items-center space-x-4">
      <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
        <Video className="text-green-400" size={24} />
      </div>
      <div>
        <h3 className="font-semibold text-lg">HD Video Quality</h3>
        <p className="text-gray-400">Crystal clear video with adaptive bitrate</p>
      </div>
    </div>
    <div className="flex items-center space-x-4">
      <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
        <Users className="text-blue-400" size={24} />
      </div>
      <div>
        <h3 className="font-semibold text-lg">Multiple Participants</h3>
        <p className="text-gray-400">Connect with multiple people simultaneously</p>
      </div>
    </div>
    <div className="flex items-center space-x-4">
      <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
        <Volume2 className="text-purple-400" size={24} />
      </div>
      <div>
        <h3 className="font-semibold text-lg">Clear Audio</h3>
        <p className="text-gray-400">Noise cancellation and echo reduction</p>
      </div>
    </div>
  </div>
); 