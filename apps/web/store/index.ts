import { EventPayloadMap, EventTypes } from '@repo/types';
import { Consumer } from 'mediasoup-client/types';
import {create} from 'zustand';


export type RemoteUser = {
  id: string;
  name?: string;
  videoConsumer?: Consumer;
  audioConsumer?: Consumer;
  screenConsumer?: Consumer;
  videoEnabled: boolean;
  audioEnabled: boolean;
  screenEnabled: boolean;
  stream?: MediaStream;
  screenStream?: MediaStream;
};

interface UIState {
    messages: EventPayloadMap[typeof EventTypes.SEND_CHAT_MESSAGE][];
    addMessage: (message: EventPayloadMap[typeof EventTypes.SEND_CHAT_MESSAGE]) => void;
    typingUsers: Map<string, { name: string; timestamp: number }>;
    addTypingUser: (peerId: string, name: string) => void;
    removeTypingUser: (peerId: string) => void;
    speakingUsers: string[]
    setSpeakingUsers: (currentSpeakingUsers:string[]) => void
    remoteUsers: Map<string, RemoteUser>
    setRemoteUsers: (
    users:
      | Map<string, RemoteUser>
      | ((prev: Map<string, RemoteUser>) => Map<string, RemoteUser>)
  ) => void;
    isInCall: boolean;
    setIsInCall: (inCall: boolean) => void;
    status: string;
    setStatus: (status: string) => void;
    isVideoEnabled: boolean;
    setIsVideoEnabled: (enabled: boolean) => void;
    isAudioEnabled: boolean;
    setIsAudioEnabled: (enabled: boolean) => void;
    isScreenSharing: boolean;
    setIsScreenSharing: (enabled: boolean) => void;
    participantCount: number;
    setParticipantCount: (count: number) => void;
    error: string | null;
    setError: (err: string | null) => void;
    localStream: MediaStream | null;
    setLocalStream: (stream: MediaStream | null) => void;
}

export const useUIStore = create<UIState>((set)=>(
{
    messages: [],
    addMessage: (message) => {
        set((state) => ({ messages: [...state.messages, message] }))
    },
    typingUsers: new Map(),
    addTypingUser: (peerId, name) => {
        set((state) => {
            const newTypingUsers = new Map(state.typingUsers);
            newTypingUsers.set(peerId, { name, timestamp: Date.now() });
            return { typingUsers: newTypingUsers };
        });
    },
    removeTypingUser: (peerId) => {
        set((state) => {
            const newTypingUsers = new Map(state.typingUsers);
            newTypingUsers.delete(peerId);
            return { typingUsers: newTypingUsers };
        });
    },
    speakingUsers: [],
    setSpeakingUsers: (currentSpeakingUsers) => {
        set({ speakingUsers: currentSpeakingUsers })
    },
    remoteUsers: new Map(),
    setRemoteUsers: (usersOrUpdater) => {
    set((state) => ({
      remoteUsers:
        typeof usersOrUpdater === 'function'
          ? usersOrUpdater(state.remoteUsers)
          : usersOrUpdater,
    }));
  },
  isInCall: false,
  setIsInCall: (inCall) => set({ isInCall: inCall }),
  status: "Disconnected",
  setStatus: (status) => set({ status }),
  isVideoEnabled: true,
  setIsVideoEnabled: (enabled) => set({ isVideoEnabled: enabled }),
  isAudioEnabled: true,
  setIsAudioEnabled: (enabled) => set({ isAudioEnabled: enabled }),
  isScreenSharing: false,
  setIsScreenSharing: (enabled) => set({ isScreenSharing: enabled }),
  participantCount: 0,
  setParticipantCount: (count) => set({ participantCount: count }),
  error: null,
  setError: (err) => set({ error: err }),
  localStream: null,
  setLocalStream: (stream) => set({ localStream: stream }),
}
))

export const wsRef: { current: WebSocket | null } = { current: null };
