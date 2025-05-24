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
        console.log("Server error:", data.msg);
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
        audio: true
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
      const audioTrack = mediaSoupClientState.current.localStream?.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await transport.produce({ track: audioTrack });
        mediaSoupClientState.current.producers.set(audioProducer.id, audioProducer);

        audioProducer.on("trackended", () => console.log("Audio track ended"));
        audioProducer.on("transportclose", () => console.log("Audio producer transport closed"));
      } else {
        console.warn("No audio track found in local stream");
      }
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
      if (data.kind === "video") {
        const remoteVideoEl = document.getElementById("remote-video") as HTMLVideoElement;
        if (!remoteVideoEl) {
          console.error("Remote video element not found");
          return;
        }
        remoteVideoRef.current = remoteVideoEl;
        remoteVideoRef.current.srcObject = stream;
        console.log("Consumer created, paused:", consumer.paused);
        console.log("Consumer track:", consumer.track);
        console.log("Track readyState:", consumer.track.readyState);
        // await remoteVideoRef.current.play();
      }

      if (data.kind === "audio") {
        const remoteAudioEl = document.getElementById("remote-audio") as HTMLAudioElement;
        if (!remoteAudioEl) {
          console.error("Remote audio element not found");
          return;
        }
        remoteAudioEl.srcObject = stream;
        // await remoteAudioEl.play();
      }

      wsRef.current?.send(
        JSON.stringify({
          type: EventTypes.RESUME_CONSUMER,
          consumerId: consumer.id
        })
      );
      console.log(`Consumer resumed for ${data.kind}, paused:`, consumer.paused);

      consumer.on("trackended", () => {
        console.log(`${data.kind} track ended`);
        if (data.kind === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
        if (data.kind === "audio") {
          const remoteAudioEl = document.getElementById("remote-audio") as HTMLAudioElement;
          if (remoteAudioEl) remoteAudioEl.srcObject = null;
        }
      });

      consumer.on("transportclose", () => {
        console.log(`${data.kind} consumer transport closed`);
      });

      setStatus(`Call active - Receiving ${data.kind}`);
    } catch (error) {
      console.error(`Error handling consumed ${data.kind}:`, error);
      setStatus(`Error receiving ${data.kind}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-100 to-white px-4 py-8">
      <h1 className="text-3xl font-bold text-indigo-700 mb-4">MediaSoup Video Call</h1>

      <div className="mb-2 text-sm text-gray-600">Status:
        <span className="ml-2 font-semibold text-indigo-600">{status}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 w-full max-w-4xl">
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-semibold mb-2 text-gray-700">Your Video</h2>
          <video
            id="local-video"
            className="w-full h-64 rounded-xl border-2 border-indigo-300 shadow-md object-cover"
            autoPlay
            muted
            playsInline
          />
        </div>

        <div className="flex flex-col items-center">
          <h2 className="text-lg font-semibold mb-2 text-gray-700">Remote Video</h2>
          <video
            id="remote-video"
            ref={remoteVideoRef}
            className="w-full h-64 rounded-xl border-2 border-pink-300 shadow-md object-cover"
            autoPlay
            playsInline
          />
        </div>
      </div>

      <audio id="remote-audio" autoPlay className="hidden" />

      <button
        onClick={startCall}
        className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all"
      >
        Start Call
      </button>
    </div>
  );
}