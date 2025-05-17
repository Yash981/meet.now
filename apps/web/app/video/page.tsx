'use client';

import { useEffect, useRef, useState } from 'react';
import {Device,
    Transport,
    Producer,
    Consumer,
    RtpCapabilities,
    RtpParameters,
    DtlsParameters,
    IceCandidate,
    IceParameters} from "mediasoup-client/types";
import {EventTypes} from "@repo/types"
import * as mediasoupClient from 'mediasoup-client';
interface ProducerInfo {
    id: string;
    producerId: string;
    producerPeerId: string;
    kind: 'audio' | 'video';
  }
function getSessionId() {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }
export default function VideoChat() {
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [remoteProducers, setRemoteProducers] = useState<ProducerInfo[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const receiveTransportRef = useRef<Transport |null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const producerIdsRef = useRef<string[]>([]);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideosRef = useRef<HTMLDivElement>(null);
  const producerCallbackRef = useRef<((id: string) => void) | null>(null);
    
  useEffect(() => {
    
    const loadMediasoupClient = async () => {
      try {
        initializeWebSocket();
      } catch (error) {
        console.error('Failed to load mediasoup-client', error);
      }
    };

    loadMediasoupClient();

    return () => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const initializeWebSocket = () => {
    const sessionId = getSessionId();
    const socket = new WebSocket(`ws://localhost:8080?sessionId=${sessionId}`);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('Connected to WebSocket server');
      setIsConnected(true);
    };

    socket.onclose = () => {
      console.log('Disconnected from WebSocket server');
      setIsConnected(false);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message.type);
        
        switch (message.type) {
          case EventTypes.WELCOME:
            setPeerId(message.peerId);
            socket.send(JSON.stringify({
              type: EventTypes.GET_ROUTER_RTP_CAPABILITIES
            }));
            break;
            
          case EventTypes.ROUTER_RTP_CAPABILITIES:
            await initializeDevice(message.rtpCapabilities);
            break;
            
          case EventTypes.WEBRTC_TRANSPORT_CREATED:
            handleTransportCreated(message);
            break;
            
          case EventTypes.TRANSPORT_CONNECTED:
            handleTransportConnected(message);
            break;
            
          case EventTypes.PRODUCED:
            if (producerCallbackRef.current) {
              producerCallbackRef.current(message.producerId);
              producerCallbackRef.current = null;
            }
            producerIdsRef.current.push(message.producerId);
            console.log(`Producer created with ID: ${message.producerId}`);
            break;
            
          case EventTypes.CONSUMED:
            await handleConsumed(message);
            break;
            
          case EventTypes.PRODUCERS:
            handleProducersList(message.producers);
            break;
            
          case EventTypes.NEW_PRODUCER:
            handleNewProducer(message);
            break;
            
          case EventTypes.PEER_CLOSED:
            handlePeerClosed(message.peerId);
            break;
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };
  };

  const initializeDevice = async (routerRtpCapabilities: RtpCapabilities) => {
    try {
      const device = new mediasoupClient.Device();
      
      await device.load({ routerRtpCapabilities });
      deviceRef.current = device;
      
      //  send transport
      if (socketRef.current) {
        socketRef.current.send(JSON.stringify({
          type: EventTypes.CREATE_WEBRTC_TRANSPORT,
          direction: 'send'
        }));
        
        //  receive transport
        socketRef.current.send(JSON.stringify({
          type: EventTypes.CREATE_WEBRTC_TRANSPORT,
          direction: 'recv'
        }));
      }
    } catch (error) {
      console.error('Failed to initialize device', error);
    }
  };

  const handleTransportCreated = (data: {
    direction: 'send' | 'recv';
    transportId: string;
    iceCandidates: IceCandidate[];
    iceParameters: IceParameters;
    dtlsParameters: DtlsParameters;
  }) => {
    const { direction, transportId, iceCandidates, iceParameters, dtlsParameters } = data;
    
    try {
      if (!deviceRef.current) {
        console.error('Device not initialized');
        return;
      }
      
      if (direction === 'send') {
        const transport = deviceRef.current.createSendTransport({
          id: transportId,
          iceCandidates,
          iceParameters,
          dtlsParameters
        });
        
        transport.on('connect', ({ dtlsParameters }, callback, errback) => {
          if (socketRef.current) {
            socketRef.current.send(JSON.stringify({
              type: EventTypes.CONNECT_TRANSPORT,
              transportId,
              dtlsParameters
            }));
          }
          callback();
        });
        
        transport.on('produce', ({ kind, rtpParameters }, callback) => {
          if (socketRef.current) {
            socketRef.current.send(JSON.stringify({
              type: EventTypes.PRODUCE,
              transportId,
              kind,
              rtpParameters
            }));
          }
          producerCallbackRef.current = (id: string) => callback({id});
        });
        
        sendTransportRef.current = transport;
        
        if (receiveTransportRef.current) {
          setIsReady(true);
        }
      } else if (direction === 'recv') {
        const transport = deviceRef.current.createRecvTransport({
          id: transportId,
          iceCandidates,
          iceParameters,
          dtlsParameters
        });
        
        transport.on('connect', ({ dtlsParameters }, callback) => {
          if (socketRef.current) {
            socketRef.current.send(JSON.stringify({
              type: EventTypes.CONNECT_TRANSPORT,
              transportId,
              dtlsParameters
            }));
          }
          callback();
        });
        
        receiveTransportRef.current = transport;
        
        if (sendTransportRef.current) {
          setIsReady(true);
        }
      }
    } catch (error) {
      console.error('Failed to create transport', error);
    }
  };

  const handleTransportConnected = (data: any) => {
    console.log(`Transport ${data.transportId} connected`);
  };

  const startLocalMedia = async () => {
    try {
      if (!sendTransportRef.current) {
        console.error('Send transport not ready');
        return;
      }
      console.log('okayyy')
      const stream = (await navigator.mediaDevices.getUserMedia({ audio: true, video: true }));
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        const videoElement = document.createElement('video');
        videoElement.srcObject = stream;
        videoElement.autoplay = true;
        videoElement.muted = true;
        videoElement.className = 'w-full h-full object-cover rounded-lg';
        localVideoRef.current.innerHTML = '';
        localVideoRef.current.appendChild(videoElement);
      }
      
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await sendTransportRef.current.produce({ track: audioTrack });
        console.log('Audio producer created', audioProducer.id);
      }
      
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const videoProducer = await sendTransportRef.current.produce({ track: videoTrack,encodings: [
            { maxBitrate: 100000, scaleResolutionDownBy: 4 },
            { maxBitrate: 300000, scaleResolutionDownBy: 2 },
            { maxBitrate: 900000 }
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000
          } });
        console.log('Video producer created', videoProducer.id);
      }
      
      if (socketRef.current) {
        socketRef.current.send(JSON.stringify({
          type: EventTypes.GET_PRODUCERS
        }));
      }
    } catch (error) {
      console.error('Failed to get local media', error);
    }
  };

  const handleConsumed = async (data: {
    consumerId: string;
    producerId: string;
    kind: 'audio' | 'video';
    rtpParameters: RtpParameters;
  }) => {
    const { consumerId, producerId, kind, rtpParameters } = data;
    
    try {
      if (!receiveTransportRef.current) {
        console.error('Receive transport not ready');
        return;
      }
      
      const consumer = await receiveTransportRef.current.consume({
        id: consumerId,
        producerId,
        kind,
        rtpParameters
      });
      
      if (kind === 'video' && remoteVideosRef.current) {
        const videoElement = document.createElement('video');
        videoElement.srcObject = new MediaStream([consumer.track]);
        videoElement.autoplay = true;
        videoElement.className = 'w-60 h-44 object-cover rounded-lg m-2';
        videoElement.setAttribute('data-producer-id', producerId);
        remoteVideosRef.current.appendChild(videoElement);
      } else if (kind === 'audio') {
        const audioElement = document.createElement('audio');
        audioElement.srcObject = new MediaStream([consumer.track]);
        audioElement.autoplay = true;
        audioElement.setAttribute('data-producer-id', producerId);
        document.body.appendChild(audioElement);
      }
      
      consumer.resume();
    } catch (error) {
      console.error('Failed to consume', error);
    }
  };

  const handleProducersList = (producers: ProducerInfo[]) => {
    setRemoteProducers(producers);
    
    for (const producer of producers) {
      consumeProducer(producer);
    }
  };

  const handleNewProducer = (data: ProducerInfo) => {
    setRemoteProducers(prev => [...prev, data]);
    consumeProducer(data);
  };

  const consumeProducer = (producer: ProducerInfo) => {
    if (!socketRef.current || !deviceRef.current || !receiveTransportRef.current) {
      console.error('Not ready to consume');
      return;
    }
    console.log(producer,'produceee')
    socketRef.current.send(JSON.stringify({
      type: EventTypes.CONSUME,
      transportId: receiveTransportRef.current.id,
      producerId: producer.producerId,
      rtpCapabilities: deviceRef.current.rtpCapabilities
    }));
  };

  const handlePeerClosed = (closedPeerId: string) => {
    console.log(`Peer ${closedPeerId} left`);
    
    if (remoteVideosRef.current) {
      const elements = remoteVideosRef.current.querySelectorAll(`[data-peer-id="${closedPeerId}"]`);
      elements.forEach(element => element.remove());
    }
    
    setRemoteProducers(prev => prev.filter(p => p.producerPeerId !== closedPeerId));
  };
  console.log(remoteVideosRef,'remote')
  return (
    <div className="flex flex-col h-screen bg-gray-100 p-6">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4">MediaSoup Video Chat</h1>
        
        <div className="mb-4">
          <div className="flex items-center mb-2">
            <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          
          {peerId && (
            <div className="text-sm text-gray-600">
              Your ID: {peerId}
            </div>
          )}
        </div>
        
        <button
          onClick={startLocalMedia}
          disabled={!isReady}
          className={`px-4 py-2 rounded-md ${
            isReady 
              ? 'bg-blue-500 hover:bg-blue-600 text-white' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Start Camera
        </button>
      </div>
      
      <div className="flex flex-1 gap-6">
        <div className="w-1/3 bg-white rounded-lg shadow-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Your Video</h2>
          <div 
            ref={localVideoRef} 
            className="bg-gray-200 rounded-lg w-full h-64 overflow-hidden"
          >
            {!isReady && (
              <div className="flex items-center justify-center h-full text-gray-500">
                Waiting for connection...
              </div>
            )}
          </div>
        </div>
        
        <div className="w-2/3 bg-white rounded-lg shadow-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Remote Videos</h2>
          <div 
            ref={remoteVideosRef}
            className="flex flex-wrap gap-2 min-h-64"
          >
            {remoteProducers.length === 0 && (
              <div className="flex items-center justify-center w-full h-64 text-gray-500">
                No remote videos yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}