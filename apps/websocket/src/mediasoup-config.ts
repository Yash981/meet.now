import { createWorker } from "mediasoup";
import { Router, RtpCodecCapability, Worker, WorkerSettings } from "mediasoup/types";

const workerSettings = {
  logLevel: "debug",
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
  logTags:[
    "dtls",
    "ice",
    "rtcp",
    "rtp",
    "info",
    "srtp"
  ]
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

let worker:Worker;
let router:Router;

const createWorkerFn = async () => {
  const newWorker = await createWorker(workerSettings);
  console.log(`Worker process ID ${newWorker.pid}`);
  newWorker.on("died", () => {
    console.error("MediaSoup worker has died");
    setTimeout(() => {
        process.exit();
      }, 2000);
  });
  return newWorker
};
const startWorker = async () => {
  worker = await createWorkerFn();
}
const startRouter = async () => {
  router = await worker.createRouter({ mediaCodecs });
}
export { startWorker, startRouter,worker, router };
