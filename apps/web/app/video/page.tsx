"use client";
import { useEffect, useRef, useState } from "react";
import { Device } from "mediasoup-client";
import { EventMessage, EventPayloadMap, EventTypes } from "@repo/types";
import { Consumer, Producer, RtpCapabilities, Transport } from "mediasoup-client/types";
import { toast } from "sonner"
import { RemoteUser, useUIStore } from "@/store";
import { Header } from "@/components/video-call/header";
import { Background } from "@/components/video-call/background";
import {  PreCallScreen } from "@/components/video-call/pre-call-screen";
import { VideoGrid } from "@/components/video-call/video-grid";
import { CallControls } from "@/components/video-call/call-controls";
import {decodeBinaryMessage,encodeBinaryMessage} from "@repo/utils"
import { abortMultipartUpload, completeMultipartUpload, getPresignedUrl, startMultipartUpload } from "@/lib/utils";

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
  
  // --- Recording State ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const uploadSessionRef = useRef<{ uploadId: string; key: string; parts: { PartNumber: number; ETag: string }[] }>({ uploadId: '', key: '', parts: [] });
  // const lastChunkTime = useRef(Date.now());
  const chunkCountRef = useRef(1);
  const SIZE_THRESHOLD = 5 * 1024 * 1024; // 5MB threshold for chunking
  const bufferedChunks = useRef<BlobPart[]>([]);
  const bufferedSizeRef = useRef(0);
  
  
  async function uploadChunkToS3(blob: Blob, partNumber: number) {
    setRecordingStatus(`Uploading chunk ${partNumber}...`);
    try {
      const { key, uploadId } = uploadSessionRef.current;
      if(!key || !uploadId || !partNumber) return;
      const { url } = await getPresignedUrl(key, uploadId, partNumber);
      const res = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'video/webm' }
      });
      if (!res.ok) throw new Error('Failed to upload chunk');
      const eTag = res.headers.get('ETag') || '';

      uploadSessionRef.current.parts.push({ PartNumber: partNumber, ETag: eTag });
      setUploadProgress((prev) => prev + 1);
    } catch (err) {
      console.log("Error uploading chunk",err)
      setRecordingStatus('Chunk upload failed');
    }
  }
  useEffect(() => {
    //eslint-disable-next-line 
    let stopped = false;
    async function startAutoRecording() {
      console.log(mediaSoupClientState.current.localStream,"localstream")
      if (!mediaSoupClientState.current.localStream) {
        setRecordingStatus('No local stream to record');
        setIsRecording(false);
        return;
      }
      setUploadProgress(0);
      setRecordingStatus('Starting...');
      setIsRecording(true);
      chunkCountRef.current = 1;
      uploadSessionRef.current = { uploadId: '', key: '', parts: [] };
      // Start multipart upload session
      const filename = `meeting-recording-${Date.now()}.webm`;
      try {
        const { uploadId, key } = await startMultipartUpload(filename, 'video/webm');
        uploadSessionRef.current.uploadId = uploadId;
        uploadSessionRef.current.key = key;
      } catch (err) {
        console.log("Error starting multipart upload",err)
        setRecordingStatus('Failed to start upload session');
        setIsRecording(false);
        return;
      }
      try {
        const recorder = new MediaRecorder(mediaSoupClientState.current.localStream!, { mimeType: 'video/webm; codecs=vp9,opus',videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 192_000 });
        recorder.ondataavailable = async (event) => {
          // const now = Date.now();
          // const ChunkdurationSec = ((now - lastChunkTime.current) / 1000).toFixed(2);
          // lastChunkTime.current = now;
          // const chunkSizeMB = (event.data.size / (1024 * 1024)).toFixed(2);
          // console.log(`Chunk Duration: ${ChunkdurationSec}s`);
          // console.log(`Chunk Size: ${chunkSizeMB} MB`);

          if (event.data && event.data.size > 0 && recorder.state === 'recording' && !stopped) {
            bufferedChunks.current.push(event.data);
            bufferedSizeRef.current += event.data.size;
            if(bufferedSizeRef.current >= SIZE_THRESHOLD) { // atleast 5MB 
              const bigBlob = new Blob(bufferedChunks.current, { type: event.data.type });
              await uploadChunkToS3(bigBlob, chunkCountRef.current++);
              bufferedChunks.current = [];
              bufferedSizeRef.current = 0; 
            };
          }
        }
        recorder.onstart = () => {console.log('▶️ MediaRecorder started');setRecordingStatus('Recording...')};
        recorder.onstop = async () => {
          console.log('🛑 onstop triggered!');
          setRecordingStatus('Finalizing...');
          if(bufferedChunks.current.length > 0) {
            const bigBlob = new Blob(bufferedChunks.current, { type: 'video/webm' });
            await uploadChunkToS3(bigBlob, chunkCountRef.current++);
            bufferedChunks.current = [];
            bufferedSizeRef.current = 0; 
          }
          const { key, uploadId, parts } = uploadSessionRef.current;
          try {
            console.log(key,uploadId,parts)

            if (key && uploadId && parts.length > 0) {
              await completeMultipartUpload(key, uploadId, parts);
              setRecordingStatus('Upload complete!');
            } else {
              console.warn('No parts uploaded, cannot finalize upload');
              setRecordingStatus('No parts uploaded');
            }
          } catch (err) {
            await abortMultipartUpload(key, uploadId);
            console.log(err,"error")
            setRecordingStatus('Failed to complete upload');
          }
          uploadSessionRef.current = { uploadId: '', key: '', parts: [] };
          chunkCountRef.current = 1;
          setIsRecording(false);
        };
        mediaRecorderRef.current = recorder;
        recorder.start(5000);
      } catch (err) {
        console.error('Error starting MediaRecorder:', err);
        setRecordingStatus('Failed to start recording');
        setIsRecording(false);
      }
    }
    console.log(isInCall,"isincall")
    if (isInCall) {
      startAutoRecording();
    } else {
      console.log(mediaRecorderRef.current?.state,"state")
      if (mediaRecorderRef.current) {
        try {
          console.log("going kya")
          mediaRecorderRef.current.stop(); 
        } catch (err) {
          console.warn('MediaRecorder already stopped:', err);
        }
      }
      setIsRecording(false);
      setRecordingStatus('');
    }
    return () => {
      stopped = true;
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInCall,mediaSoupClientState.current.localStream]);

  useEffect(()=>{
    toast.info(`Recording ${isRecording ? 'started' : 'stopped'}`,{
      duration: 3000,
      position: "top-center",
      style: {
        backgroundColor: "#ffffff",
        color: "#000000",
      }
    })
  },[isRecording])
  
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        useUIStore.getState().remoteUsers.forEach((user) => {
          user.stream?.getTracks().forEach((track) => track.stop());
          user.screenStream?.getTracks().forEach((track) => track.stop());
        });
        setRemoteUsers(new Map());
      }
    };
    //eslint-disable-next-line
  }, []);

  const handleWebSocketMessage = async (event: MessageEvent) => {
    const decodedData = decodeBinaryMessage(event.data)
    const data = JSON.parse(decodedData) as EventMessage;
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
        handleProdoucerClosedScreenShareNotification(payload);
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
          wsRef.current?.send(encodeBinaryMessage(JSON.stringify({
            type: EventTypes.PRODUCER_CLOSED,
            message: {
              producerId: screenProducer.id,
              kind: "screen",
              roomId: "123"
            }
          })));
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

  }

  const connectWebSocket = () => {
    const ws = new WebSocket("ws://localhost:8080");
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setStatus("Connected");
      ws.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.JOIN_ROOM,
        message: {
          roomId: "123"
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
    };
  };

  const initializeDevice = async () => {
    if (!wsRef || !wsRef.current) return;
    wsRef.current.send(encodeBinaryMessage(JSON.stringify({
      type: EventTypes.GET_ROUTER_RTP_CAPABILITIES,
      message: {
        roomId: "123"
      }
    })));
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

      //     if (isVideoEnabled) {
      //       const rawVideoTrack = stream.getVideoTracks()[0];
      //       if (rawVideoTrack) {
      //         finalStream.addTrack(rawVideoTrack);
      //       }
      //     }
      //   }

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
          roomId: "123"
        }
      })));
      wsRef.current.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.CREATE_WEBRTC_TRANSPORT,
        message: {
          direction: "recv",
          roomId: "123"
        }
      })));
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
      wsRef?.current?.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.LOCAL_USER_MEDIA_TOGGLED,
        message:{
          peerId:mediaSoupClientState.current.peerId,
          roomId:"123",
          type:"video",
          enable:!isVideoEnabled
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
        message:{
          peerId:mediaSoupClientState.current.peerId,
          roomId:"123",
          type:"audio",
          enable: !isAudioEnabled
        }

      } as EventMessage)))
    }
  };
  const handleRemoteUserVideoOff = (data:EventPayloadMap[typeof EventTypes.REMOTE_USER_MEDIA_TOGGLED]) => {
    const {peerId:remotePeerId,type,enable} = data
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
  }
  const handleProdoucerClosedScreenShareNotification = (data: any) => {
    const { peerId, producerId, kind, appData } = data;
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
              roomId: "123"
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
              roomId: "123"
            }
          })));
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
      wsRef.current?.send(encodeBinaryMessage(JSON.stringify({
        type: EventTypes.CONSUME,
        message: {
          producerId,
          peerId,
          kind,
          appData,
          rtpCapabilities: mediaSoupClientState.current?.device?.rtpCapabilities,
          roomId: "123"
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
              roomId: "123"
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
            roomId: "123"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white relative overflow-hidden">
      <Background />
      <div className="relative z-10 p-6">
        <Header
          status={status}
          isInCall={isInCall}
          participantCount={participantCount}
        />

        {/* Recording Status */}
        {isInCall && (
          <div className="mb-4 flex items-center gap-4">
            <span className="ml-4 text-lg font-mono ">{recordingStatus}</span>
            <span className="ml-4 text-sm">Chunks uploaded: {uploadProgress}</span>
          </div>
        )}

        {!isInCall ? (
          <PreCallScreen
            status={status}
            onStartCall={startCall}
          />
        ) : (
          <div className="space-y-6">
            <VideoGrid
              remoteUsers={remoteUsers}
              speakingUsers={speakingUsers}
              localPeerId={mediaSoupClientState.current.peerId}
              isAudioEnabled={isAudioEnabled}
              isVideoEnabled={isVideoEnabled}
              videoStream = {mediaSoupClientState.current.localStream}
            />

            <CallControls
              isAudioEnabled={isAudioEnabled}
              isVideoEnabled={isVideoEnabled}
              isScreenSharing={isScreenSharing}
              onToggleAudio={toggleAudio}
              onToggleVideo={toggleVideo}
              onToggleScreenShare={toggleScreenShare}
              onEndCall={endCall}
            />
          </div>
        )}
      </div>
    </div>
  );
}