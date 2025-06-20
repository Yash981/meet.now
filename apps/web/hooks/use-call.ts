import { useRef, useState, useCallback } from "react";
import { Device } from "mediasoup-client";
import { RtpCapabilities } from "mediasoup-client/types";
import { EventMessage, EventPayloadMap, EventTypes } from "@repo/types";
import { decodeBinaryMessage } from "@repo/utils";
import { RemoteUser, useUIStore } from "@/store";
import { PeerClientState } from "@/app/video/page";
import { useWebSocket } from "./use-websocket";
import { toast } from "sonner";

export type CallStatus = "Disconnected" | "Connected" | "In call" | "Error" | string;

export const useCall = () => {
  const { setRemoteUsers, setSpeakingUsers } = useUIStore();

  const [status, setStatus] = useState<CallStatus>("Disconnected");
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Mediasoup state
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

  const handleWebSocketMessage = useCallback(async (data: EventMessage) => {
    switch (data.type) {
      case EventTypes.WELCOME: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.WELCOME]
        mediaSoupClientState.current.peerId = payload.peerId
        setStatus("Connected");
        await initializeDevice();
        break;
      }

      case EventTypes.ROUTER_RTP_CAPABILITIES: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.ROUTER_RTP_CAPABILITIES]
        await createDevice(payload.rtpCapabilities);
        break;
      }
      case EventTypes.WEBRTC_TRANSPORT_CREATED: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.WEBRTC_TRANSPORT_CREATED]
        if (payload.direction === "send") {
          await setupProducerTransport(payload);
        } else {
          await setupConsumerTransport(payload);
        }
        break;
      }

      case EventTypes.CONSUMED: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.CONSUMED]
        console.log(payload, 'payload on consumed event')
        await handleConsumed(payload);
        break;
      }

      case EventTypes.NEW_PRODUCER: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.NEW_PRODUCER]
        handleNewProducer(payload);
        break;
      }

      case EventTypes.ERROR: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.ERROR]
        console.log("Server error:", payload.msg);
        setStatus(`Error: ${payload.msg}`);
        break;
      }
      case EventTypes.PEER_DISCONNECTED: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.PEER_DISCONNECTED]
        console.log("Peer disconnected:", payload.peerId);
        handlePeerDisconnected(payload);
        break
      }
      case EventTypes.PRODUCER_CLOSED_NOTIFICATION: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.PRODUCER_CLOSED_NOTIFICATION]
        handleProducerClosedScreenShareNotification(payload);
        break;
      }
      case EventTypes.SPEAKING_USERS: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.SPEAKING_USERS]
        handleSpeakingUsers(payload);
        break
      }
      case EventTypes.REMOTE_USER_MEDIA_TOGGLED:{
        const payload = data.message as EventPayloadMap[typeof EventTypes.REMOTE_USER_MEDIA_TOGGLED]
        handleRemoteUserVideoOff(payload)
        break
      }
    }
  }, []);

  const { sendMessage, wsRef } = useWebSocket({
    onMessage: handleWebSocketMessage,
    onStatusChange: (newStatus) => setStatus(newStatus as CallStatus)
  });

  const createDevice = useCallback(async (rtpCapabilities: RtpCapabilities) => {
    try {
        mediaSoupClientState.current.device = new Device();
        await mediaSoupClientState.current.device.load({ routerRtpCapabilities: rtpCapabilities });
        mediaSoupClientState.current.rtpCapabilities = rtpCapabilities;
        setStatus("Ready");
      } catch (error) {
        console.error("Error creating device:", error);
        setStatus("Error creating device");
      }
  }, []);

  const setupProducerTransport = useCallback(async (transportData: EventPayloadMap[typeof EventTypes.WEBRTC_TRANSPORT_CREATED]) => {
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
            sendMessage({
              type: EventTypes.CONNECT_PRODUCER_TRANSPORT,
              message: {
                direction: "send",
                transportId: transport.id,
                dtlsParameters,
                roomId: "123"
              }
            })
            callback();
          } catch (error: any) {
            errback(error);
          }
        });
  
        transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const handleProduced = (event: MessageEvent) => {
              const decoded = decodeBinaryMessage(event.data)
              const data = JSON.parse(decoded) as EventMessage;
              if (data.type === EventTypes.PRODUCED) {
                const payload = data.message as EventPayloadMap[typeof EventTypes.PRODUCED]
                callback({ id: payload.id });
                wsRef.current?.removeEventListener("message", handleProduced);
              }
            };
            wsRef.current?.addEventListener("message", handleProduced);
            if (!wsRef || !wsRef.current) return;
            sendMessage({
              type: EventTypes.PRODUCE,
              message: {
                kind,
                rtpParameters,
                appData,
                roomId: "123"
              }
            } as EventMessage);
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
  }, []);

  const setupConsumerTransport = useCallback(async (transportData: EventPayloadMap[typeof EventTypes.WEBRTC_TRANSPORT_CREATED]) => {
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
            sendMessage({
              type: EventTypes.CONNECT_CONSUMER_TRANSPORT,
              message: {
                direction: "recv",
                dtlsParameters,
                transportId: transport.id,
                roomId: "123"
              }
            });
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
  }, []);

  const handleConsumed = useCallback(async (data: EventPayloadMap[typeof EventTypes.CONSUMED]) => {
    try {
        const consumer = await mediaSoupClientState.current.recvTransport?.consume({
          id: data.consumerId,
          producerId: data.producerId,
          kind: data.kind as "audio" | "video" | undefined,
          rtpParameters: data.rtpParameters,
          appData: data.appData,
        });
  
        if (!consumer) return;
  
        mediaSoupClientState.current.consumers.set(consumer.id, consumer);
        const userId = data.producerPeerId;
        const isScreenShare = data.appData?.type === "screen";
  
        useUIStore.getState().setRemoteUsers((prev: Map<string, RemoteUser>) => {
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
  
  
        sendMessage({
            type: EventTypes.RESUME_CONSUMER,
            message: {
              consumerId: consumer.id,
              peerId: data.producerPeerId,
              roomId: "123"
            }
          });
        consumer.on("trackended", () => {
          useUIStore.getState().setRemoteUsers((prev) => {
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
  }, []);

  const handleNewProducer = useCallback((payload: EventPayloadMap[typeof EventTypes.NEW_PRODUCER]) => {
    try {
        const { producerId, kind, peerId, appData } = payload;
        sendMessage({
          type: EventTypes.CONSUME,
          message: {
            producerId,
            peerId,
            kind,
            appData,
            rtpCapabilities: mediaSoupClientState.current?.device?.rtpCapabilities,
            roomId: "123"
          }
        });
      } catch (error) {
        console.error("Error handling new producer:", error);
      }
  }, []);

  const handlePeerDisconnected = useCallback((payload: EventPayloadMap[typeof EventTypes.PEER_DISCONNECTED]) => {
    const { peerId } = payload
    toast.info(`Peer ${peerId} disconnected`, {
      duration: 3000,
      position: "top-center",
      style: {
        backgroundColor: "#ffffff",
        color: "#000000",
      }

    });
    useUIStore.getState().setRemoteUsers((prev) => {
      const newUsers = new Map(prev);
      newUsers.delete(peerId);
      return newUsers
    })
  }, []);

  const handleProducerClosedScreenShareNotification = useCallback((payload: EventPayloadMap[typeof EventTypes.PRODUCER_CLOSED_NOTIFICATION]) => {
    const { peerId, kind, appData } = payload;
    toast.info(`Peer ${peerId} stopped screen sharing`, {
      duration: 3000,
      position: "top-center",
      style: {
        backgroundColor: "#ffffff",
        color: "#000000",
      }

    });
    useUIStore.getState().setRemoteUsers((prev) => {
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
  }, []);

  const handleSpeakingUsers = useCallback((payload: EventPayloadMap[typeof EventTypes.SPEAKING_USERS]) => {
    const { speakingUsers: currentSpeakingUsers }: { speakingUsers: Array<string> } = payload;
    setSpeakingUsers(currentSpeakingUsers)
  }, [setSpeakingUsers]);

  const handleRemoteUserVideoOff = useCallback((payload: EventPayloadMap[typeof EventTypes.REMOTE_USER_MEDIA_TOGGLED]) => {
    const {peerId:remotePeerId,type,enable} = payload
    useUIStore.getState().setRemoteUsers((prev: Map<string, RemoteUser>)=>{
      const newUsers = new Map(prev);
      const existingUser = newUsers.get(remotePeerId)
      console.log(existingUser)
      if(existingUser){
        if(type==="video") {
          existingUser.videoEnabled = enable
        }
        if(type==="audio") {
          existingUser.audioEnabled = enable
        }
        newUsers.set(remotePeerId,existingUser)
      }
      return newUsers
    })
    console.log('done')
  }, []);

  const initializeDevice = useCallback(async () => {
    if (!wsRef || !wsRef.current) return;
    sendMessage({
      type: EventTypes.GET_ROUTER_RTP_CAPABILITIES,
      message: {
        roomId: "123"
      }
    });
    //eslint-disable-next-line
  }, []);

  const startCall = useCallback(async () => {
    try {
        setStatus("Starting call...");
        setIsInCall(true);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoEnabled,
          audio: isAudioEnabled
        });
        mediaSoupClientState.current.localStream = stream;
        const localVideoEl = document.getElementById("local-video") as HTMLVideoElement;
        if (localVideoEl) {
          localVideoEl.srcObject = stream;
          localVideoEl.play();
        }
  
        if (!wsRef || !wsRef.current) return;
        sendMessage({
          type: EventTypes.CREATE_WEBRTC_TRANSPORT,
          message: {
            direction: "send",
            roomId: "123"
          }
        });
        sendMessage({
          type: EventTypes.CREATE_WEBRTC_TRANSPORT,
          message: {
            direction: "recv",
            roomId: "123"
          }
        });
      } catch (error:any) {
        if (error.name === 'NotAllowedError') {
          setStatus('Camera access was denied. Please allow permission to continue.');
        } else if (error.name === 'NotFoundError') {
          setStatus('No camera device found.');
        } else if (error.name === 'NotReadableError') {
          setStatus('Camera is already in use by another application.');
        } else {
          setStatus('An unexpected error occurred: ' + error.message);
        }    
        setIsInCall(false);
      }
    //eslint-disable-next-line
  }, []);

  const endCall = useCallback(() => {
    setIsInCall(false);
    setStatus("Ready");
    setRemoteUsers(new Map());
    setParticipantCount(0);

    if (mediaSoupClientState.current.localStream) {
      mediaSoupClientState.current.localStream.getTracks().forEach(track => track.stop());
      mediaSoupClientState.current.localStream = null;
    }
    if (mediaSoupClientState.current.screenStream) {
      mediaSoupClientState.current.screenStream.getTracks().forEach(track => track.stop());
      mediaSoupClientState.current.screenStream = null;
    }
    setIsScreenSharing(false)
    const localVideoEl = document.getElementById("local-video") as HTMLVideoElement;
    if (localVideoEl) localVideoEl.srcObject = null;
    //eslint-disable-next-line
  }, []);

  const toggleVideo = useCallback(async () => {
    if (mediaSoupClientState.current.localStream) {
        const videoTrack = mediaSoupClientState.current.localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !isVideoEnabled;
          setIsVideoEnabled(!isVideoEnabled);
          
          
        }
        sendMessage({
          type: EventTypes.LOCAL_USER_MEDIA_TOGGLED,
          message:{
            peerId:mediaSoupClientState.current.peerId,
            roomId:"123",
            type:"video",
            enable:!isVideoEnabled
          }
  
        })
      }
    //eslint-disable-next-line
  }, []);

  const toggleAudio = useCallback(async () => {
    if (mediaSoupClientState.current.localStream) {
        const audioTrack = mediaSoupClientState.current.localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !isAudioEnabled;
          setIsAudioEnabled(!isAudioEnabled);
        }
        sendMessage({
          type: EventTypes.LOCAL_USER_MEDIA_TOGGLED,
          message:{
            peerId:mediaSoupClientState.current.peerId,
            roomId:"123",
            type:"audio",
            enable: !isAudioEnabled
          }
  
        })
      }
    //eslint-disable-next-line
  }, []);

  const toggleScreenShare = useCallback(async (browserStopSharing?:boolean) => {
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
            sendMessage({
              type: EventTypes.PRODUCER_CLOSED,
              message: {
                producerId: screenProducer.id,
                kind: "screen",
                roomId: "123"
              }
            });
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
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            setIsScreenSharing(false);
            toast.error("Screen sharing was cancelled.", {
              duration: 3000,
              position: "top-center",
              style: {
                backgroundColor: "#ffffff",
                color: "#000000",
              }
            });
          } else {
            console.error("Error starting screen share:", error);
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
    //eslint-disable-next-line
  }, []);

  const localStream = mediaSoupClientState.current.localStream;
  const screenStream = mediaSoupClientState.current.screenStream;

  return {
    // State
    status,
    isVideoEnabled,
    isAudioEnabled,
    isScreenSharing,
    isInCall,
    participantCount,
    error,
    // Streams
    localStream,
    screenStream,
    // Actions
    startCall,
    endCall,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    // Internal refs (for advanced usage)
    wsRef,
    mediaSoupClientState,
  };
}; 