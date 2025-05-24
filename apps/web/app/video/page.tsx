"use client";
import { useEffect, useRef, useState } from "react";
import { Device } from "mediasoup-client";
import { EventTypes } from "@repo/types";
import { Consumer, Producer, RtpCapabilities, Transport } from "mediasoup-client/types";
type PeerClientState = {
  device: Device | null;
  sendTransport: Transport | null;
  recvTransport: Transport | null;
  producers: Map<string, Producer>;   // Your own outgoing media streams
  consumers: Map<string, Consumer>;   // Incoming media from others
  rtpCapabilities: RtpCapabilities | null;
  localStream: MediaStream | null;    // Local media stream
};

export default function VideoCall() {
  const mediaSoupClientState = useRef<PeerClientState>({
    device: null,
    sendTransport: null,
    recvTransport: null,
    producers: new Map(),
    consumers: new Map(),
    localStream: null,
    rtpCapabilities: null,
  });

  const wsRef = useRef<WebSocket>(null);

  const [status, setStatus] = useState("Disconnected");
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [])
  // Handle WebSocket messages
  const handleWebSocketMessage = async (event: any) => {
    const data = JSON.parse(event.data);
    console.log("Received message:", data);

    switch (data.type) {
      case EventTypes.WELCOME:
        setStatus("Connected - Ready to start call");
        await initializeDevice();
        break;

      case EventTypes.ROUTER_RTP_CAPABILITIES:
        await createDevice(data.rtpCapabilities);
        break;

      case EventTypes.WEBRTC_TRANSPORT_CREATED:
        if (data.direction === "send") {
          await setupProducerTransport(data);
        } else {
          await setupConsumerTransport(data);
        }
        break;
      case EventTypes.CONSUMED:
        await handleConsumed(data);
        break;
      case EventTypes.NEW_PRODUCER:
        console.log("New producer:", data);
        handleNewProducer(data);
        break;
      case EventTypes.ERROR:
        console.error("Server error:", data.msg);
        setStatus(`Error: ${data.msg}`);
        break;
    }
  };

  // Connect to WebSocket server
  const connectWebSocket = () => {
    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setStatus("Connecting...");
    };

    ws.onmessage = handleWebSocketMessage;

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setStatus("Disconnected");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("Connection error");
    };
  };

  const initializeDevice = async () => {
    if (!wsRef || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: EventTypes.GET_ROUTER_RTP_CAPABILITIES
    }));
  };

  const createDevice = async (rtpCapabilities: RtpCapabilities) => {
    try {
      console.log("Creating device...");
      mediaSoupClientState.current.device = new Device();

      await mediaSoupClientState.current.device.load({ routerRtpCapabilities: rtpCapabilities });
      mediaSoupClientState.current.rtpCapabilities = rtpCapabilities;
      setStatus("Device created - Ready to start call");
      console.log("Device created:", mediaSoupClientState.current.device);

    } catch (error) {
      console.error("Error creating device:", error);
      setStatus("Error creating device");
    }
  };

  const startCall = async () => {
    try {
      setStatus("Starting camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
      mediaSoupClientState.current.localStream = stream;
      const localVideoEl = document.getElementById("local-video") as HTMLVideoElement;
      if (localVideoEl) {
        localVideoEl.srcObject = stream;
        localVideoEl.play();
      }
      if (!wsRef || !wsRef.current) return;
      wsRef.current.send(JSON.stringify({
        type: EventTypes.CREATE_WEBRTC_TRANSPORT,
        direction: "send"
      }));
      wsRef.current.send(JSON.stringify({
        type: EventTypes.CREATE_WEBRTC_TRANSPORT,
        direction: "recv"
      }))
    } catch (error) {
      console.error("Error starting call:", error);
      setStatus("Error accessing camera");
    }
  };

  const setupProducerTransport = async (transportData: any) => {
    try {
      if (!mediaSoupClientState.current.device) {
        console.error("Device not initialized");
        return;
      }
      const transport = mediaSoupClientState.current.device.createSendTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters
      })
      if (!transport) return;


      mediaSoupClientState.current.sendTransport = transport;
      transport?.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          wsRef?.current?.send(JSON.stringify({
            type: EventTypes.CONNECT_PRODUCER_TRANSPORT,
            direction: "send",
            transportId: transport.id,
            dtlsParameters
          }));
          callback();
        } catch (error: any) {
          errback(error);
        }
      });
      transport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const handleProduced = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            if (data.type === EventTypes.PRODUCED) {
              callback({ id: data.id });
              wsRef.current?.removeEventListener("message", handleProduced);
            }
          };
          wsRef.current?.addEventListener("message", handleProduced);
          if (!wsRef || !wsRef.current) return;
          wsRef.current.send(JSON.stringify({
            type: EventTypes.PRODUCE,
            kind,
            rtpParameters
          }));
        } catch (error: any) {
          errback(error);
        }
      });

      const videoTrack = mediaSoupClientState.current.localStream?.getVideoTracks()[0];
      if (!videoTrack) {
        console.warn("No video track found in local stream");
        return;
      }
      const producer = await transport.produce({
        track: videoTrack,
        encodings: [
          { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" },
          { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" },
          { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" }
        ],
        codecOptions: { videoGoogleStartBitrate: 1000 }
      });
      if (!producer) return;
      mediaSoupClientState.current.producers.set(producer.id, producer);
      setStatus("Sending video...");

      producer.on("trackended", () => {
        console.log("Track ended");
      });

      producer.on("transportclose", () => {
        console.log("Producer transport closed");
      });

    } catch (error) {
      console.error("Error setting up producer transport:", error);
      setStatus("Error setting up producer");
    }
  };

  const handleNewProducer = async (data: any) => {
    try {
      const { producerId, kind, peerId } = data;
      wsRef.current?.send(JSON.stringify({
        type: EventTypes.CONSUME,
        producerId,
        rtpCapabilities: mediaSoupClientState.current?.device?.rtpCapabilities,
      }));
    } catch (error) {
      console.error("Error handling new producer:", error);
      setStatus("Error handling new producer");
    }
  }

  const setupConsumerTransport = async (transportData: any) => {
    try {
      if (!mediaSoupClientState.current.device) {
        throw new Error("Device not initialized");
      }
      const transport = mediaSoupClientState.current.device.createRecvTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters
      });
      if (!transport) return console.error("No transport found");
      mediaSoupClientState.current.recvTransport = transport;

      transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          if (!wsRef || !wsRef.current) return;
          wsRef.current.send(JSON.stringify({
            type: EventTypes.CONNECT_CONSUMER_TRANSPORT,
            direction: "recv",
            dtlsParameters,
            transportId: transport.id
          }));
          callback();
        } catch (error: any) {
          errback(error);
        }
      });
      transport.on("connectionstatechange", (state) => {
        console.log("Consumer transport connection state:", state);
        if (state === "connected") {
          setStatus("Consumer transport connected");
        } else if (state === "failed") {
          setStatus("Consumer transport failed");
        }
      });
      setStatus("Consumer transport created - Starting to receive...");

    } catch (error) {
      console.error("Error setting up consumer transport:", error);
      setStatus("Error setting up consumer");
    }
  };

  const handleConsumed = async (data: any) => {
    try {

      const consumer = await mediaSoupClientState.current.recvTransport?.consume({
        id: data.consumerId,
        producerId: data.producerId,
        kind: data.kind,
        rtpParameters: data.rtpParameters
      });
      if (!consumer) return;
      mediaSoupClientState.current.consumers.set(consumer.id, consumer);
      console.log("Consumer created:", consumer.id);
      const stream = new MediaStream([consumer.track]);
      const remoteVideoEl = document.getElementById("remote-video") as HTMLVideoElement;
      if (!remoteVideoEl) {
        console.error("Remote video element not found");
        return;
      }
      remoteVideoRef.current = remoteVideoEl;
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current.play();
      
      consumer.on("trackended", () => {
        console.log("Track ended");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      });
      consumer.on("transportclose", () => {
        console.log("Consumer transport closed");
      });

      
      setStatus("Call active - Receiving video");

    } catch (error) {
      console.error("Error handling consumed media:", error);
      setStatus("Error receiving video");
    }
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-center">Status</h3>
        <p className="text-center">{status}</p>
        <button
          onClick={startCall}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
        >
          Start Call
        </button>
      </div>
      {/* Local Video */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-center">Local Video</h3>
        <video
          id="local-video"
          autoPlay
          playsInline
          muted
          className="w-full h-64 bg-gray-200 rounded-lg object-cover"
        />
      </div>

      {/* Remote Video */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-center">Remote Video</h3>
        <video
          id="remote-video"
          autoPlay
          playsInline
          className="w-full h-64 bg-gray-200 rounded-lg object-cover"
        />
      </div>
    </div>

  );
}