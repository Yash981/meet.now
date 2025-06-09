import { useRef, useCallback } from 'react';
import { Device } from 'mediasoup-client';
import { Consumer, Producer, RtpCapabilities, Transport } from 'mediasoup-client/types';
import { EventTypes } from '@repo/types';

interface MediaSoupState {
  peerId: string;
  device: Device | null;
  sendTransport: Transport | null;
  recvTransport: Transport | null;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  rtpCapabilities: RtpCapabilities | null;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
}

export const useMediaSoup = () => {
  const state = useRef<MediaSoupState>({
    peerId: "",
    device: null,
    sendTransport: null,
    recvTransport: null,
    producers: new Map(),
    consumers: new Map(),
    localStream: null,
    rtpCapabilities: null,
    screenStream: null,
  });

  const createDevice = useCallback(async (rtpCapabilities: RtpCapabilities) => {
    try {
      console.log("Creating device...");
      state.current.device = new Device();
      await state.current.device.load({ routerRtpCapabilities: rtpCapabilities });
      state.current.rtpCapabilities = rtpCapabilities;
      return true;
    } catch (error) {
      console.error("Error creating device:", error);
      return false;
    }
  }, []);

  const setupProducerTransport = useCallback(async (transportData: any) => {
    try {
      if (!state.current.device) {
        console.error("Device not initialized");
        return null;
      }

      const transport = state.current.device.createSendTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters
      });

      if (!transport) return null;

      state.current.sendTransport = transport;
      return transport;
    } catch (error) {
      console.error("Error setting up producer transport:", error);
      return null;
    }
  }, []);

  const setupConsumerTransport = useCallback(async (transportData: any) => {
    try {
      if (!state.current.device) {
        throw new Error("Device not initialized");
      }

      const transport = state.current.device.createRecvTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters
      });

      if (!transport) return null;
      state.current.recvTransport = transport;
      return transport;
    } catch (error) {
      console.error("Error setting up consumer transport:", error);
      return null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (state.current.localStream) {
      state.current.localStream.getTracks().forEach(track => track.stop());
      state.current.localStream = null;
    }
    if (state.current.screenStream) {
      state.current.screenStream.getTracks().forEach(track => track.stop());
      state.current.screenStream = null;
    }
    state.current.producers.forEach(producer => producer.close());
    state.current.consumers.forEach(consumer => consumer.close());
    state.current.producers.clear();
    state.current.consumers.clear();
  }, []);

  return {
    state,
    createDevice,
    setupProducerTransport,
    setupConsumerTransport,
    cleanup,
  };
}; 