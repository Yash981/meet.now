import { WebSocket, WebSocketServer } from "ws";
import {  generatePeerId, router, startRouter, startWorker } from "./mediasoup-config";
import {EventTypes} from "@repo/types";
import { Consumer, Producer, Transport, WebRtcTransport } from "mediasoup/types";
import {IncomingMessage} from 'http'
const wss = new WebSocketServer({ port: 8080 });
wss.on("listening", () => {
  console.log("WebSocket server is now running on 8080");
});
export type Peer = {
  ws: WebSocket; 
  transports: Map<any, Transport>; 
  producers: Map<any, Producer>;
  consumers: Map<string, Consumer>;
}; 
const peers = new Map<string, Peer>();
startWorker()
wss.on("connection", async function connection(ws:WebSocket,req:IncomingMessage) {
  console.log("connected")
  await startRouter()
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  console.log(url,'url')
  const peerId = url.searchParams.get('sessionId') || generatePeerId();
  peers.set(peerId, {
    ws,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map()
  });
  ws.send(JSON.stringify({
    type: EventTypes.WELCOME,
    peerId
  }));
  ws.on("message", async (message) => {
    console.log(message.toString(),'message')
    const parsedData = JSON.parse(message.toString());
    if (parsedData.type === EventTypes.GET_ROUTER_RTP_CAPABILITIES) {
      handleGetRouterRtpCapabilities(ws);
    } else if (parsedData.type === EventTypes.CREATE_WEBRTC_TRANSPORT) {
      await handleCreateWebRtcTransport(parsedData, ws, peerId);
    } else if (parsedData.type === EventTypes.CONNECT_TRANSPORT) {
      await handleConnectTransport(parsedData,peerId)
    } else if (parsedData.type === EventTypes.PRODUCE) {
      await handleProduce(parsedData, ws, peerId);
    } else if (parsedData.type === EventTypes.CONSUME) {
      await handleConsume(parsedData,ws,peerId)

  }
    else if(parsedData.type === EventTypes.GET_PRODUCERS){
      handleGetProducers(ws, peerId);
    }
  });
  ws.on("error", console.error);
  ws.on("close", () => {
    console.log("Peer disconnected ");
    console.log(`Peer disconnected: ${peerId}`);
    const peer = peers.get(peerId);
    
    // Close all transports
    if (peer) {
      for (const transport of peer.transports.values()) {
        transport.close();
      }
      peers.delete(peerId);
    }
    
    // Notify other peers about this disconnection
    for (const otherPeer of peers.values()) {
      otherPeer.ws.send(JSON.stringify({
        type: EventTypes.PEER_CLOSED,
        peerId
      }));
    }
  });
});

const handleCreateWebRtcTransport = async (data:any,socket:WebSocket,peerId:string) => {
  const { direction } = data; 
  try {
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0",announcedIp:"127.0.0.1" }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000
    });
    const peer = peers.get(peerId);
    peer?.transports.set(transport.id,transport);
    socket.send(JSON.stringify({
      type: EventTypes.WEBRTC_TRANSPORT_CREATED,
      direction,
      transportId: transport.id,
      iceCandidates: transport.iceCandidates,
      iceParameters: transport.iceParameters,
      dtlsParameters: transport.dtlsParameters
    }));
    transport.on("dtlsstatechange", (dtlsState: string) => {
      if (dtlsState === "closed") {
        transport.close();
      }
    });

    transport.on("@close", () => {
      console.log("Transport closed");
    });

    return transport;
  } catch (error) {
    console.log("Error Creating Webrtc Transport");
  }
};
const handleGetRouterRtpCapabilities = (socket:WebSocket) => {
  socket.send(JSON.stringify({
    type: EventTypes.ROUTER_RTP_CAPABILITIES,
    rtpCapabilities: router.rtpCapabilities
  }));
}
async function handleConnectTransport(data:any, peerId:string) {
  const { transportId, dtlsParameters } = data;
  const peer = peers.get(peerId);
  const transport = peer?.transports.get(transportId);
  
  await transport?.connect({ dtlsParameters });
  
  peer?.ws.send(JSON.stringify({
    type: EventTypes.TRANSPORT_CONNECTED,
    transportId
  }));
}
async function handleProduce(data:any, socket:WebSocket, peerId:string) {
  const { transportId, kind, rtpParameters } = data;
  const peer = peers.get(peerId);
  const transport = peer?.transports.get(transportId);
  const producer = await transport?.produce({ kind, rtpParameters });
  if (!producer) {
    throw new Error('Failed to create producer');
  }
  peer?.producers.set(producer.id, producer);
  
  socket.send(JSON.stringify({
    type: EventTypes.PRODUCED,
    producerId: producer.id
  }));
  
  for (const [otherPeerId, otherPeer] of peers.entries()) {
    if (otherPeerId !== peerId) {
      otherPeer.ws.send(JSON.stringify({
        type: EventTypes.NEW_PRODUCER,
        producerId: producer.id,
        producerPeerId: peerId,
        kind
      }));
    }
  }
}
async function handleConsume(data:any, socket:WebSocket, peerId:string) {
  const { transportId, producerId, rtpCapabilities } = data;
  const peer = peers.get(peerId);
  const transport = peer?.transports.get(transportId);
  
  if (!router.canConsume({ producerId, rtpCapabilities })) {
    socket.send(JSON.stringify({
      type: EventTypes.CANNOT_CONSUME
    }));
    return;
  }
  console.log(producerId,'producerId',data)
  const consumer = await transport?.consume({
    producerId,
    rtpCapabilities,
    paused: true 
  });
  if(!consumer){
    throw new Error("Failed to create consumer")
  }
  peer?.consumers.set(consumer.id, consumer);
  
  socket.send(JSON.stringify({
    type: EventTypes.CONSUMED,
    consumerId: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters
  }));
}

function handleGetProducers(socket:WebSocket, peerId:string) {
  const producerList = [];
  
  for (const [otherPeerId, otherPeer] of peers.entries()) {
    if (otherPeerId !== peerId) {
      for (const [producerId, producer] of otherPeer.producers.entries()) {
        producerList.push({
          producerId,
          producerPeerId: otherPeerId,
          kind: producer.kind
        });
      }
    }
  }
  
  socket.send(JSON.stringify({
    type: EventTypes.PRODUCERS,
    producers: producerList
  }));
}