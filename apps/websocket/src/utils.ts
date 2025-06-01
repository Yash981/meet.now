import { RtpCodecCapability, WorkerSettings } from "mediasoup/types";

export const workerSettings = {
    logLevel: 'debug',
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logTags: ['dtls', 'ice', 'rtcp', 'rtp', 'info', 'sctp'],
} as WorkerSettings;

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
export function generateRandomId(){
  return Math.random().toString(36).substring(2, 15);
}