import { RemoteUser } from "@/store";
import { LocalVideo } from "./local-video";
import RemoteUserCard from "@/components/remote-user-card";

interface VideoGridProps {
  remoteUsers: Map<string, RemoteUser>;
  speakingUsers: string[];
  localPeerId: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  videoStream:any;
}

export const VideoGrid = ({
  remoteUsers,
  speakingUsers,
  localPeerId,
  isAudioEnabled,
  isVideoEnabled,
  videoStream
}: VideoGridProps) => {
  const getGridClass = () => {
    const userCount = remoteUsers.size;
    const hasScreenShare = Array.from(remoteUsers.values()).some(user => user.screenEnabled);
    if (hasScreenShare) {
      return "grid-cols-1 lg:grid-cols-4";
    }
    if (userCount === 0) return "grid-cols-1";
    if (userCount === 1) return "grid-cols-1 md:grid-cols-2";
    if (userCount <= 4) return "grid-cols-2";
    if (userCount <= 6) return "grid-cols-2 md:grid-cols-3";
    return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  };

  return (
    <div className={`grid ${getGridClass()} gap-4`}>
      {<LocalVideo
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isSpeaking={speakingUsers?.includes(localPeerId)}
        orderLast={remoteUsers.size > 0}
        videoStream={videoStream}
      />}

      {Array.from(remoteUsers.values()).map((user) => {
        if (!user.stream) return null;
        return (
          <RemoteUserCard
            key={user.id}
            user={user}
            speakingUsers={speakingUsers}
          />
        );
      })}
    </div>
  );
}; 