"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Device } from "mediasoup-client";
import { EventTypes } from "@repo/types";
import { Consumer, Producer, RtpCapabilities, Transport } from "mediasoup-client/types";
import { Users, Video, VideoOff, Mic, MicOff, Phone, PhoneOff, Settings, Maximize2, Volume2, MonitorUp, MonitorX } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner"
import { RemoteUser, useUIStore } from "@/store";
import RemoteUserCard from "@/components/remote-user-card";

type PeerClientState = {
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

export default function VideoCall() {
  const { remoteUsers, setRemoteUsers, speakingUsers, setSpeakingUsers } = useUIStore()
  const mediaSoupClientState = useRef<PeerClientState>({
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

  const wsRef = useRef<WebSocket>(null);
  const [status, setStatus] = useState("Disconnected");
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isInCall, setIsInCall] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        remoteUsers.forEach((user) => {
          user.stream?.getTracks().forEach((track) => track.stop());
          user.screenStream?.getTracks().forEach((track) => track.stop());
        });
        setRemoteUsers(new Map());
      }
    };
  }, []);

  const handleWebSocketMessage = async (event: any) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case EventTypes.WELCOME:
        mediaSoupClientState.current.peerId = data.peerId
        setStatus("Connected");
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
        handleNewProducer(data);
        break;

      case EventTypes.ERROR:
        console.log("Server error:", data.msg);
        setStatus(`Error: ${data.msg}`);
        break;
      case EventTypes.PEER_DISCONNECTED:
        console.log("Peer disconnected:", data.peerId);
        handlePeerDisconnected(data);
        break
      case EventTypes.PRODUCER_CLOSED_NOTIFICATION:
        handlePrdoucerClosedScreenShareNotification(data);
        break
      case EventTypes.SPEAKING_USERS:
        handleSpeakerUsers(data);
        break

    }
  };
  const toggleScreenShare = async (browserStopSharing?: boolean) => {
    console.log("Toggle screen sharing:", isScreenSharing, browserStopSharing);
    if (isScreenSharing || browserStopSharing === true) {
      console.log('Stopping screen sharing...');
      try {
        if (mediaSoupClientState.current.screenStream) {
          mediaSoupClientState.current.screenStream.getTracks().forEach(track => track.stop());
          mediaSoupClientState.current.screenStream = null;
        }
        // Find and close screen producer
        const screenProducer = Array.from(mediaSoupClientState.current.producers.values())
          .find(producer => producer.appData?.type === 'screen');
        if (screenProducer) {
          screenProducer.close();
          mediaSoupClientState.current.producers.delete(screenProducer.id);

          // Notify server to remove screen producer
          wsRef.current?.send(JSON.stringify({
            type: EventTypes.PRODUCER_CLOSED,
            producerId: screenProducer.id,
            kind: "screen",
            roomId: "123"
          }));
        }
        setIsScreenSharing(false);
        setStatus("In call");
        toast.success("Screen sharing stopped", {
          duration: 3000,
          position: "top-center",
          style: {
            backgroundColor: "#ffffff",
            color: "#000000",
          }
        });
      } catch (error) {
        console.error("Error stopping screen sharing:", error);
        setStatus("Error stopping screen sharing");
        toast.error("Error stopping screen sharing", {
          duration: 3000,
          position: "top-center",
          style: {
            backgroundColor: "#ffffff",
            color: "#000000",
          }
        });
      }
    } else {
      
      console.log('Starting screen sharing...');
      // Start screen sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 15, max: 30 }
          }
        })
        mediaSoupClientState.current.screenStream = screenStream;

        screenStream.getVideoTracks()[0]?.addEventListener("ended", async () => {
          console.log('Screen sharing ended by user');
          await toggleScreenShare(true)
        })


        if (mediaSoupClientState.current.sendTransport) {
          const videoTrack = screenStream.getVideoTracks()[0];
          if (videoTrack) {
            setIsScreenSharing(true);
            const screenProducer = await mediaSoupClientState.current.sendTransport.produce({
              track: videoTrack,
              encodings: [
                { rid: "r0", maxBitrate: 500000, scalabilityMode: "S1T3" },
                { rid: "r1", maxBitrate: 1000000, scalabilityMode: "S1T3" },
                { rid: "r2", maxBitrate: 2000000, scalabilityMode: "S1T3" }
              ],
              codecOptions: { videoGoogleStartBitrate: 1000 },
              appData: { type: "screen" }
            })
            if (screenProducer) {
              mediaSoupClientState.current.producers.set(screenProducer.id, screenProducer);
            }
          }
          setStatus("Screen Sharing active");
          toast.success("Screen Sharing Started", {
            duration: 3000,
            position: "top-center",
            style: {
              backgroundColor: "#ffffff",
              color: "#000000",
            }
          })
        }
      } catch (error) {
        console.error("Error starting screen share:", error);
        setIsScreenSharing(false);
        toast.error("Failed to start screen sharing", {
          duration: 3000,
          position: "top-center",
          style: {
            backgroundColor: "#ffffff",
            color: "#000000",
          }
        });
      }
    }

  }

  const connectWebSocket = () => {
    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setStatus("Connected");
      ws.send(JSON.stringify({
        type: EventTypes.JOIN_ROOM,
        roomId: "123"
      }))
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
      type: EventTypes.GET_ROUTER_RTP_CAPABILITIES,
      roomId: "123"
    }));
  };

  const createDevice = async (rtpCapabilities: RtpCapabilities) => {
    try {
      console.log("Creating device...");
      mediaSoupClientState.current.device = new Device();
      await mediaSoupClientState.current.device.load({ routerRtpCapabilities: rtpCapabilities });
      mediaSoupClientState.current.rtpCapabilities = rtpCapabilities;
      setStatus("Ready");
      console.log("Device created:", mediaSoupClientState.current.device);
    } catch (error) {
      console.error("Error creating device:", error);
      setStatus("Error creating device");
    }
  };

  const startCall = async () => {
    try {
      setStatus("Starting call...");
      setIsInCall(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoEnabled,
        audio: isAudioEnabled ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false,
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
        direction: "send",
        roomId: "123"
      }));
      wsRef.current.send(JSON.stringify({
        type: EventTypes.CREATE_WEBRTC_TRANSPORT,
        direction: "recv",
        roomId: "123"
      }));
    } catch (error) {
      console.error("Error starting call:", error);
      setStatus("Error accessing camera");
      setIsInCall(false);
    }
  };

  const endCall = () => {
    setIsInCall(false);
    setStatus("Call ended");
    setRemoteUsers(new Map());
    setParticipantCount(0);

    // Stop local stream
    if (mediaSoupClientState.current.localStream) {
      mediaSoupClientState.current.localStream.getTracks().forEach(track => track.stop());
      mediaSoupClientState.current.localStream = null;
    }
    if (mediaSoupClientState.current.screenStream) {
      mediaSoupClientState.current.screenStream.getTracks().forEach(track => track.stop());
      mediaSoupClientState.current.screenStream = null;
    }
    setIsScreenSharing(false)
    // Clear video elements
    const localVideoEl = document.getElementById("local-video") as HTMLVideoElement;
    if (localVideoEl) localVideoEl.srcObject = null;
  };

  const toggleVideo = async () => {
    if (mediaSoupClientState.current.localStream) {
      const videoTrack = mediaSoupClientState.current.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const toggleAudio = async () => {
    if (mediaSoupClientState.current.localStream) {
      const audioTrack = mediaSoupClientState.current.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };
  const handlePrdoucerClosedScreenShareNotification = (data: any) => {
    const { peerId, producerId, kind, appData } = data;
    toast.info(`Peer ${peerId} stopped screen sharing`, {
      duration: 3000,
      position: "top-center",
      style: {
        backgroundColor: "#ffffff",
        color: "#000000",
      }

    });
    useUIStore.getState().setRemoteUsers((prev)=>{
      const newUsers = new Map(prev);
      const existingUser = newUsers.get(peerId);
      if (existingUser) {
        if (appData?.type === "screen") {
          existingUser.screenEnabled = false;
          existingUser.screenConsumer = undefined;
          existingUser.screenStream?.getTracks().forEach(track => track.stop());
          existingUser.screenStream = undefined;
        } else if (kind === "video") {
          existingUser.videoEnabled = false;
          existingUser.videoConsumer = undefined;
        } else if (kind === "audio") {
          existingUser.audioEnabled = false;
          existingUser.audioConsumer = undefined;
        }
        newUsers.set(peerId, existingUser);
      }
      return newUsers
    })
  }
  const handlePeerDisconnected = (data: any) => {
    const { peerId } = data
    toast.info(`Peer ${peerId} disconnected`, {
      duration: 3000,
      position: "top-center",
      style: {
        backgroundColor: "#ffffff",
        color: "#000000",
      }

    });
    useUIStore.getState().setRemoteUsers((prev)=>{
      const newUsers = new Map(prev);
      newUsers.delete(peerId);
      return newUsers
    })
  }
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
      });

      if (!transport) return;

      mediaSoupClientState.current.sendTransport = transport;

      transport?.on("connect", async ({ dtlsParameters }, callback, errback) => {
        try {
          wsRef?.current?.send(JSON.stringify({
            type: EventTypes.CONNECT_PRODUCER_TRANSPORT,
            direction: "send",
            transportId: transport.id,
            dtlsParameters,
            roomId: "123"
          }));
          callback();
        } catch (error: any) {
          errback(error);
        }
      });

      transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
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
            rtpParameters,
            appData,
            roomId: "123"
          }));
        } catch (error: any) {
          errback(error);
        }
      });

      if (isVideoEnabled) {
        const videoTrack = mediaSoupClientState.current.localStream?.getVideoTracks()[0];
        if (videoTrack) {
          const producer = await transport.produce({
            track: videoTrack,
            encodings: [
              { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" },
              { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" },
              { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" }
            ],
            codecOptions: { videoGoogleStartBitrate: 1000 },
            appData: { type: 'camera' }
          });
          if (producer) {
            mediaSoupClientState.current.producers.set(producer.id, producer);
          }
        }
      }

      // Produce audio if enabled
      if (isAudioEnabled) {
        const audioTrack = mediaSoupClientState.current.localStream?.getAudioTracks()[0];
        if (audioTrack) {
          const audioProducer = await transport.produce({
            track: audioTrack, appData: { type: 'microphone', userId: transportData.userId }
          });
          if (audioProducer) {
            mediaSoupClientState.current.producers.set(audioProducer.id, audioProducer);
          }
        }
      }

      setStatus("In call");
    } catch (error) {
      console.error("Error setting up producer transport:", error);
      setStatus("Error setting up producer");
    }
  };

  const handleNewProducer = async (data: any) => {
    try {
      const { producerId, kind, peerId, appData } = data;
      wsRef.current?.send(JSON.stringify({
        type: EventTypes.CONSUME,
        producerId,
        peerId,
        kind,
        appData,
        rtpCapabilities: mediaSoupClientState.current?.device?.rtpCapabilities,
        roomId: "123"
      }));
    } catch (error) {
      console.error("Error handling new producer:", error);
    }
  };

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
            transportId: transport.id,
            roomId: "123"
          }));
          callback();
        } catch (error: any) {
          errback(error);
        }
      });

      transport.on("connectionstatechange", (state) => {
        console.log("Consumer transport connection state:", state);
      });
    } catch (error) {
      console.error("Error setting up consumer transport:", error);
    }
  };

  const handleConsumed = async (data: any) => {
    try {
      const consumer = await mediaSoupClientState.current.recvTransport?.consume({
        id: data.consumerId,
        producerId: data.producerId,
        kind: data.kind,
        rtpParameters: data.rtpParameters,
        appData: data.appData,
      });

      if (!consumer) return;

      mediaSoupClientState.current.consumers.set(consumer.id, consumer);
      const userId = data.producerPeerId;
      const isScreenShare = data.appData?.type === "screen";

      useUIStore.getState().setRemoteUsers((prev:Map<string, RemoteUser>) => {
        const newUsers = new Map(prev);
        const existingUser = newUsers.get(userId) || {
          id: userId,
          name: "",
          videoEnabled: false,
          audioEnabled: false,
          screenEnabled: false,
        } as RemoteUser;

        if (isScreenShare) {
          if (!existingUser.screenStream) {
            existingUser.screenStream = new MediaStream([consumer.track]);
          } else {
            existingUser.screenStream.addTrack(consumer.track);
          }
          existingUser.screenConsumer = consumer;
          existingUser.screenEnabled = true;
        } else {
          if (!existingUser.stream) {
            existingUser.stream = new MediaStream([consumer.track]);
          } else {
            existingUser.stream.addTrack(consumer.track);
          }

          if (data.kind === "video") {
            existingUser.videoConsumer = consumer;
            existingUser.videoEnabled = true;
          } else if (data.kind === "audio") {
            existingUser.audioConsumer = consumer;
            existingUser.audioEnabled = true;
          }
        }

        newUsers.set(userId, existingUser);
        return newUsers;
      });


      wsRef.current?.send(
        JSON.stringify({
          type: EventTypes.RESUME_CONSUMER,
          consumerId: consumer.id,
          peerId: data.producerPeerId,
          roomId: "123"
        })
      );
      consumer.on("trackended", () => {
        useUIStore.getState().setRemoteUsers((prev)=>{
          const newUsers = new Map(prev);
          const user = newUsers.get(userId);
          if (user) {
            if (isScreenShare) {
              user.screenEnabled = false;
              user.screenConsumer = undefined;
            } else if (data.kind === "video") {
              user.videoEnabled = false;
              user.videoConsumer = undefined;
            } else if (data.kind === "audio") {
              user.audioEnabled = false;
              user.audioConsumer = undefined;
            }
            newUsers.set(userId, user);
          }
          return newUsers
        })
      });
    } catch (error) {
      console.error(`Error handling consumed ${data.kind}:`, error);
    }
  };
  const handleSpeakerUsers = (data: any) => {
    const { speakingUsers: currentSpeakingUsers }: { speakingUsers: Array<string> } = data;
    setSpeakingUsers(currentSpeakingUsers)

  }
  useEffect(() => {
    setParticipantCount(remoteUsers.size);
  }, [remoteUsers]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
      </div>

      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <Video className="text-white" size={24} />
            </div>
            <div>
              <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                Meet Now
              </Link>
              <div className="flex items-center space-x-4 text-sm text-gray-400">
                <span className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${status === 'Connected' || status === 'Ready' || status === 'In call' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                  <span>{status}</span>
                </span>
                {isInCall && (
                  <span className="flex items-center space-x-1">
                    <Users size={14} />
                    <span>{participantCount + 1} participants</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {isInCall && (
            <div className="flex items-center space-x-2">
              <button className="p-2 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 transition-all">
                <Settings size={20} />
              </button>
              <button className="p-2 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 transition-all">
                <Maximize2 size={20} />
              </button>
            </div>
          )}
        </div>

        {!isInCall ? (
          // Pre-call screen
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Ready to Connect?
              </h2>
              <p className="text-gray-400 text-lg">
                Join the conversation with crystal clear video and audio
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mb-8">
              {/* Local preview */}
              <div className="relative">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 aspect-video shadow-2xl border border-slate-700/50">
                  <video
                    id="local-video"
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    playsInline
                  />
                  <div className="absolute bottom-4 left-4">
                    <span className="text-white text-sm font-medium bg-black/40 backdrop-blur-sm px-3 py-1 rounded-lg">
                      You
                    </span>
                  </div>
                </div>
              </div>

              {/* Feature highlights */}
              <div className="flex flex-col justify-center space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <Video className="text-green-400" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">HD Video Quality</h3>
                    <p className="text-gray-400">Crystal clear video with adaptive bitrate</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Users className="text-blue-400" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Multiple Participants</h3>
                    <p className="text-gray-400">Connect with multiple people simultaneously</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Volume2 className="text-purple-400" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Clear Audio</h3>
                    <p className="text-gray-400">Noise cancellation and echo reduction</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={startCall}
              disabled={status !== 'Ready' && status !== 'Connected'}
              className="group relative px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl font-semibold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <div className="flex items-center space-x-3">
                <Phone size={24} />
                <span>Start Call</span>
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600/50 to-blue-600/50 opacity-0 group-hover:opacity-100 transition-opacity blur-xl"></div>
            </button>
            {status !== 'Ready' && status !== "Connected" && <p className="text-white">Please refresh the page </p>}
          </div>
        ) : (
          // In-call screen
          <div className="space-y-6">
            {/* Video grid */}
            <div className={`grid ${getGridClass()} gap-4`}>
              {/* Local video (smaller when others are present) */}
              <div className={`relative ${remoteUsers.size > 0 ? 'order-last' : ''}`}>
                <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 aspect-video shadow-2xl border-4 ${speakingUsers?.length > 0 &&
                  speakingUsers?.includes(mediaSoupClientState.current.peerId)
                  ? "border-green-500 ring-2 ring-green-300/70 animate-blink"
                  : "border-transparent"
                  }`}>
                  <video
                    id="local-video"
                    className={`w-full h-full object-cover `}
                    autoPlay
                    muted
                    playsInline

                  />
                  <div className="absolute bottom-3 left-3">
                    <span className="text-white text-sm font-medium bg-black/40 backdrop-blur-sm px-2 py-1 rounded-lg">
                      You
                    </span>
                  </div>
                  <div className="absolute bottom-3 right-3 flex items-center space-x-1">
                    {!isAudioEnabled && (
                      <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center">
                        <MicOff size={12} className="text-white" />
                      </div>
                    )}
                    {!isVideoEnabled && (
                      <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center">
                        <VideoOff size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Remote users */}
              {Array.from(remoteUsers.values()).map((user) => {
                if (!user.stream) return null;
                return (
                  <RemoteUserCard key={user.id} user={user} speakingUsers={speakingUsers} />

                )
              })}
            </div>

            {/* Controls */}
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2">
              <div className="flex items-center space-x-4 bg-slate-800/80 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-slate-700/50">
                <button
                  onClick={toggleAudio}
                  className={`p-3 rounded-xl transition-all ${isAudioEnabled
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                    }`}
                >
                  {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </button>

                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-xl transition-all ${isVideoEnabled
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                    }`}
                >
                  {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
                <button onClick={() => toggleScreenShare()} className={`p-3 rounded-xl ${!isScreenSharing
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
                  } transition-all`}>
                  {isScreenSharing ? <MonitorX size={20} /> : <MonitorUp size={20} />}
                </button>
                <button
                  onClick={endCall}
                  className="p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all"
                >
                  <PhoneOff size={20} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}