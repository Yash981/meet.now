import { Device } from "mediasoup-client";
import type { Consumer, Producer, RtpCapabilities, Transport } from "mediasoup-client/types";

export type PeerClientState = {
  peerId: string;
  device: Device | null;
  sendTransport: Transport | null;
  recvTransport: Transport | null;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  rtpCapabilities: RtpCapabilities | null;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
};


