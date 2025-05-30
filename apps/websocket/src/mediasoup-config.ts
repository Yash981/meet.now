import { createWorker } from "mediasoup";
import {
  AudioLevelObserver,
  Router,
  RtpCodecCapability,
  Worker,
  WorkerSettings,
} from "mediasoup/types";
import { peers } from "./server";
import { EventTypes } from "@repo/types";

const workerSettings = {
  logLevel: "debug",
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
  logTags: ["dtls", "ice", "rtcp", "rtp", "info", "sctp"],
} as WorkerSettings;
export function generatePeerId() {
  return Math.random().toString(36).substring(2, 15);
}
export const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
  },
];

let worker: Worker;
let router: Router;
export let audioLevelObserver: AudioLevelObserver;

const createWorkerFn = async () => {
  const newWorker = await createWorker(workerSettings);
  console.log(`Worker process ID ${newWorker.pid}`);
  newWorker.on("died", () => {
    console.error("MediaSoup worker has died");
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  });
  return newWorker;
};
export const startWorker = async () => {
  worker = await createWorkerFn();
};
export const startRouter = async () => {
  if (!worker) throw new Error("Worker not initialized");
  if (!router) {
    console.log("Creating router");
    router = await worker.createRouter({ mediaCodecs });
    audioLevelObserver = await router.createAudioLevelObserver({
      interval: 1000,
      threshold: -60,
      maxEntries:2
    });
    audioLevelObserver.on("volumes", (volumes) => {
      const speakingUsers = volumes.map(
        ({ producer }) => producer.appData.userId
      );
      if (!speakingUsers) return;
      peers.forEach((peer) => {
        peer.ws.send(
          JSON.stringify({
            type: EventTypes.SPEAKING_USERS,
            speakingUsers: speakingUsers,
          })
        );
      });
    });
    audioLevelObserver.on("silence", () => {
      peers.forEach((peer) => {
        peer.ws.send(
          JSON.stringify({
            type: EventTypes.SPEAKING_USERS,
            speakingUsers: [],
          })
        );
      });
    });
  } else {
    console.log("Router already exists");
  }
};
export const getWorker = () => worker;
export const getRouter = () => router;
