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
    speakingUsers: string[]
    setSpeakingUsers: (currentSpeakingUsers:string[]) => void
    remoteUsers: Map<string, RemoteUser>
    setRemoteUsers: (
    users:
      | Map<string, RemoteUser>
      | ((prev: Map<string, RemoteUser>) => Map<string, RemoteUser>)
  ) => void;
}
export const useUIStore = create<UIState>((set)=>({
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
}))