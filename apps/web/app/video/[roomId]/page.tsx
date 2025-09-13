"use client";
import { useEffect, useRef, useState } from "react";
import { Device } from "mediasoup-client";
import { EventMessage, EventPayloadMap, EventTypes } from "@repo/types";
import { RtpCapabilities } from "mediasoup-client/types";
import { toast } from "sonner"
import { RemoteUser, useUIStore } from "@/store";
import { Header } from "@/components/video-call/header";
import { Background } from "@/components/video-call/background";
import { VideoGrid } from "@/components/video-call/video-grid";
import { CallControls } from "@/components/video-call/call-controls";
import { decodeBinaryMessage, encodeBinaryMessage } from "@repo/utils"
import { useRecording } from ".././hooks/useRecording";
import { useScreenShare } from ".././hooks/useScreenShare";
import type { PeerClientState } from ".././types";
import { SidebarParticipants } from "@/components/video-call/sidebar-participants";
import { ChatSidebar } from "@/components/video-call/chat-sidebar";
import { useParams, useRouter } from "next/navigation";

export type { PeerClientState };

export default function VideoCall() {
  const { roomId } = useParams<{ roomId: string }>();

  const pathname = `${process.env.NEXT_PUBLIC_BASE_URL}/video/${roomId}`
  const router = useRouter();
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
  const { isScreenSharing, toggleScreenShare } = useScreenShare(mediaSoupClientState as any, wsRef as any, setStatus, roomId);
  const { isRecording, handleToggleRecording } = useRecording(mediaSoupClientState as any);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const hasConnected = useRef(false);
  const handleWebSocketMessage = async (event: MessageEvent) => {
    const decodedData = decodeBinaryMessage(event.data)
    const data = JSON.parse(decodedData) as EventMessage;
    switch (data.type) {
      case EventTypes.WELCOME: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.WELCOME]
        mediaSoupClientState.current.peerId = payload.peerId
        setStatus("Connected");
        await initializeDevice();
        if (!isInCall) {
          startCall();
        }
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
        handleProdoucerClosedScreenShareNotification(payload);
        break;
      }
      case EventTypes.SPEAKING_USERS: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.SPEAKING_USERS]
        handleSpeakingUsers(payload);
        break
      }
      case EventTypes.REMOTE_USER_MEDIA_TOGGLED: {
        const payload = data.message as EventPayloadMap[typeof EventTypes.REMOTE_USER_MEDIA_TOGGLED]
        handleRemoteUserVideoOff(payload)
        break;
      }

    }
  };
  const connectWebSocket = () => {
    if (hasConnected.current) return; // ✅ Prevent 2nd call
    hasConnected.current = true;
    if (wsRef.current) return;
    const ws = new WebSocket("ws://localhost:8080");
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setStatus("Connected");
      ws.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.JOIN_ROOM,
        message: {
          roomId: roomId || "123"
        }
      })))
    };

    ws.onmessage = handleWebSocketMessage;

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setStatus("Disconnected");
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("Connection error");
      console.error('[WS] error', error);
    };
  };
  const initializeDevice = async () => {
    if (!wsRef || !wsRef.current) return;
    wsRef.current.send(encodeBinaryMessage(JSON.stringify({
      type: EventTypes.GET_ROUTER_RTP_CAPABILITIES,
      message: {
        roomId: roomId || "123"
      }
    })));
  };


  const createDevice = async (rtpCapabilities: RtpCapabilities) => {
    try {


      mediaSoupClientState.current.device = new Device();



      // Load device with router capabilities
      await mediaSoupClientState.current.device.load({ routerRtpCapabilities: rtpCapabilities });

      // Store capabilities
      mediaSoupClientState.current.rtpCapabilities = rtpCapabilities;



      setStatus("Ready");
    } catch (error) {
      console.error("Error creating device:", error);
      setStatus("Error creating device");
      throw error;
    }
  };

  const startCall = async () => {
    try {
      setStatus("Starting call...");
      setIsInCall(true);
      // const audioContext = new AudioContext()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoEnabled,
        audio: isAudioEnabled
        // ? {
        //   echoCancellation: false,
        //   noiseSuppression: true,
        //   autoGainControl: false
        // } : false,

      });
      // if(isAudioEnabled){
      //   let finalStream: MediaStream;
      //   const rawAudioTrack = stream.getAudioTracks()[0];
      //   if (!rawAudioTrack) {
      //     finalStream = stream;
      //   } else {
      //     const micSourceNode = audioContext.createMediaStreamSource(new MediaStream([rawAudioTrack]));
      //     const highpassFilter = audioContext.createBiquadFilter();
      //     highpassFilter.type = "highpass";
      //     highpassFilter.frequency.value = 300; 
      //     const destinationNode = audioContext.createMediaStreamDestination();
      //     micSourceNode.connect(highpassFilter);
      //     highpassFilter.connect(destinationNode);
      //     finalStream = new MediaStream();
      //     const filteredAudioTrack = destinationNode.stream.getAudioTracks()[0];
      //     if (filteredAudioTrack) {
      //       finalStream.addTrack(filteredAudioTrack);
      //     }

      //   if (isVideoEnabled) {
      //     const rawVideoTrack = stream.getVideoTracks()[0];
      //     if (rawVideoTrack) {
      //       finalStream.addTrack(rawVideoTrack);
      //     }
      //   }
      // }

      //   mediaSoupClientState.current.localStream = finalStream;

      // } else{
      mediaSoupClientState.current.localStream = stream;
      // }
      const localVideoEl = document.getElementById("local-video") as HTMLVideoElement;
      if (localVideoEl) {
        localVideoEl.srcObject = stream;
        localVideoEl.play();
      }

      if (!wsRef || !wsRef.current) return;
      wsRef.current.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.CREATE_WEBRTC_TRANSPORT,
        message: {
          direction: "send",
          roomId: roomId || "123"
        }
      })));
      wsRef.current.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.CREATE_WEBRTC_TRANSPORT,
        message: {
          direction: "recv",
          roomId: roomId || "123"
        }
      })));
    } catch (error: any) {
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
  };
  const endCall = () => {
    setIsInCall(false);
    setStatus("Ready");
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
    // screen share state is handled by the hook
    // Clear video elements
    const localVideoEl = document.getElementById("local-video") as HTMLVideoElement;
    if (localVideoEl) localVideoEl.srcObject = null;
    router.push('/video');
  };
  useEffect(() => {
    if (wsRef.current) return;
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // cleanup users
      useUIStore.getState().remoteUsers.forEach((user) => {
        user.stream?.getTracks().forEach((t) => t.stop());
        user.screenStream?.getTracks().forEach((t) => t.stop());
      });
      hasConnected.current = false; // ✅ Reset flag
      setRemoteUsers(new Map());
    };
    //eslint-disable-next-line
  }, [roomId]);

  const toggleVideo = async () => {
    if (mediaSoupClientState.current.localStream) {
      const videoTrack = mediaSoupClientState.current.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);


      }
      wsRef?.current?.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.LOCAL_USER_MEDIA_TOGGLED,
        message: {
          peerId: mediaSoupClientState.current.peerId,
          roomId: roomId || "123",
          type: "video",
          enable: !isVideoEnabled
        }

      } as EventMessage)))
    }
  };

  const toggleAudio = async () => {
    if (mediaSoupClientState.current.localStream) {
      const audioTrack = mediaSoupClientState.current.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
      wsRef?.current?.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.LOCAL_USER_MEDIA_TOGGLED,
        message: {
          peerId: mediaSoupClientState.current.peerId,
          roomId: roomId || "123",
          type: "audio",
          enable: !isAudioEnabled
        }

      } as EventMessage)))
    }
  };
  const handleRemoteUserVideoOff = (data: EventPayloadMap[typeof EventTypes.REMOTE_USER_MEDIA_TOGGLED]) => {
    const { peerId: remotePeerId, type, enable } = data
    useUIStore.getState().setRemoteUsers((prev: Map<string, RemoteUser>) => {
      const newUsers = new Map(prev);
      const existingUser = newUsers.get(remotePeerId)
      console.log(existingUser)
      if (existingUser) {
        if (type === "video") {
          existingUser.videoEnabled = enable
        }
        if (type === "audio") {
          existingUser.audioEnabled = enable
        }
        newUsers.set(remotePeerId, existingUser)
      }
      return newUsers
    })
    console.log('done')
  }
  const handleProdoucerClosedScreenShareNotification = (data: any) => {
    const { peerId, _producerId, kind, appData } = data;
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
    useUIStore.getState().setRemoteUsers((prev) => {
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
          wsRef?.current?.send(encodeBinaryMessage(JSON.stringify({
            type: EventTypes.CONNECT_PRODUCER_TRANSPORT,
            message: {
              direction: "send",
              transportId: transport.id,
              dtlsParameters,
              roomId: roomId || "123"
            }
          })));
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
          wsRef.current.send(encodeBinaryMessage(JSON.stringify({
            type: EventTypes.PRODUCE,
            message: {
              kind,
              rtpParameters,
              appData,
              roomId: roomId || "123"
            }
          })));
        } catch (error: any) {
          errback(error);
        }
      });

      if (isVideoEnabled) {
        const videoTrack = mediaSoupClientState.current.localStream?.getVideoTracks()[0];
        try {
          if (videoTrack) {
            const producerOptions = {
              track: videoTrack,
              appData: { type: 'camera' },
              encodings: [
                {
                  maxBitrate: 500000,
                  scaleResolutionDownBy: 1,
                }
              ]
            };

            console.log("Attempting to produce with options:", producerOptions);
            const producer = await transport.produce(producerOptions);
            if (producer) {
              mediaSoupClientState.current.producers.set(producer.id, producer);
            }
          }
        } catch (error) {
          console.error("errorr", error)
        }
      }

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
      wsRef.current?.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.CONSUME,
        message: {
          producerId,
          peerId,
          kind,
          appData,
          rtpCapabilities: mediaSoupClientState.current?.device?.rtpCapabilities,
          roomId: roomId || "123"
        }
      })));
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
          wsRef.current.send(encodeBinaryMessage(JSON.stringify({
            type: EventTypes.CONNECT_CONSUMER_TRANSPORT,
            message: {
              direction: "recv",
              dtlsParameters,
              transportId: transport.id,
              roomId: roomId || "123"
            }
          })));
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

  const handleConsumed = async (data: EventPayloadMap[typeof EventTypes.CONSUMED]) => {
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


      wsRef.current?.send(
        encodeBinaryMessage(JSON.stringify({
          type: EventTypes.RESUME_CONSUMER,
          message: {
            consumerId: consumer.id,
            peerId: data.producerPeerId,
            roomId: roomId || "123"
          }
        }))
      );
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
  };
  const handleSpeakingUsers = (data: any) => {
    const { speakingUsers: currentSpeakingUsers }: { speakingUsers: Array<string> } = data;
    setSpeakingUsers(currentSpeakingUsers)

  }
  useEffect(() => {
    setParticipantCount(remoteUsers.size);
  }, [remoteUsers]);


  return (

    <div className="min-h-screen  text-white relative overflow-hidden">
      <Background />
      <div className="relative z-10 p-4 md:p-6 max-w-[1400px] mx-auto">
        <Header
          status={status}
          isInCall={isInCall}
          participantCount={participantCount}
          onCopyLink={async () => {
            await navigator.clipboard.writeText(pathname);
            toast.success("Room link copied to clipboard", {
              duration: 3000,
              position: "top-center",
              style: {
                backgroundColor: "#ffffff",
                color: "#000000",
              }
            });
          }}
          onInvite={async () => await navigator.clipboard.writeText(window.location.href)}
          onToggleSidebar={() => setShowSidebar((v) => !v)}
          showSidebar={showSidebar}
        />

        {!isInCall ? (
          <div className="mt-20">
            <p>Joining room...</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 flex flex-col p-2 md:p-4 gap-4 min-h-0">
              <div className="flex-1 min-h-0">
                <VideoGrid
                  remoteUsers={remoteUsers}
                  speakingUsers={speakingUsers}
                  localPeerId={mediaSoupClientState.current.peerId}
                  isAudioEnabled={isAudioEnabled}
                  isVideoEnabled={isVideoEnabled}
                  videoStream={mediaSoupClientState.current.localStream ?? null}
                />
              </div>
              <div className="flex-shrink-0">
                <CallControls
                  isAudioEnabled={isAudioEnabled}
                  isVideoEnabled={isVideoEnabled}
                  isScreenSharing={isScreenSharing}
                  onToggleAudio={toggleAudio}
                  onToggleVideo={toggleVideo}
                  onToggleScreenShare={toggleScreenShare}
                  onEndCall={endCall}
                  onToggleRecording={handleToggleRecording}
                  isRecording={isRecording}
                  showChat={showChat}
                  onToggleChat={() => setShowChat(v => !v)}
                />
              </div>
            </div>
            {(showSidebar || showChat) && <div className="flex flex-col gap-4 lg:w-[300px] xl:w-[350px] 2xl:w-[400px] flex-shrink-0">
              {showSidebar && <SidebarParticipants localPeerId={mediaSoupClientState.current.peerId} />}
              {showChat && (
                <ChatSidebar
                  localPeerId={mediaSoupClientState.current.peerId}
                  roomId={roomId || "123"}
                  ws={wsRef.current}
                  localUserName={`${`User-${mediaSoupClientState.current.peerId?.slice(0, 4)}`}`}
                />
              )}
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}