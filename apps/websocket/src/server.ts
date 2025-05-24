import { WebSocket, WebSocketServer } from "ws";
import {
  generatePeerId,
  getRouter,
  startRouter,
  startWorker,
} from "./mediasoup-config";
import { EventTypes } from "@repo/types";
import {
  Consumer,
  Producer,
  Router,
  Transport,
  WebRtcTransport,
} from "mediasoup/types";
import { get, IncomingMessage } from "http";
const wss = new WebSocketServer({ port: 8080 });
wss.on("listening", () => {
  console.log("WebSocket server is now running on 8080");
});
export type Peer = {
  ws: WebSocket;
  transports: {
    sendTransport: Transport;
    recvTransport: Transport;
  };
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};
const peers = new Map<string, Peer>();
(async () => {
  await startWorker();
  await startRouter();
  console.log("Server initialized, ready for connections");
})();
wss.on(
  "connection",
  async function connection(ws: WebSocket, req: IncomingMessage) {
    console.log("connected");

    const peerId = generatePeerId();
    peers.set(peerId, {
      ws,
      transports: {
        sendTransport: {} as Transport,
        recvTransport: {} as Transport,
      },
      producers: new Map(),
      consumers: new Map(),
    });
    ws.send(
      JSON.stringify({
        type: EventTypes.WELCOME,
        peerId,
      })
    );
    const router = getRouter();
    ws.on("message", async (message) => {
      console.log(message.toString(), "message");
      const parsedData = JSON.parse(message.toString());
      if (parsedData.type === EventTypes.GET_ROUTER_RTP_CAPABILITIES) {
        handleGetRouterRtpCapabilities(ws, router);
      } else if (parsedData.type === EventTypes.CREATE_WEBRTC_TRANSPORT) {
        if (parsedData.direction === "send") {
          await handleCreateWebRtcTransport(parsedData, ws, router, peerId);
        } else {
          await handleCreateWebRtcTransport(parsedData, ws, router, peerId);
          setTimeout(() => {
            notifyNewPeerOfExistingProducers(peerId, ws);
          }, 100);
        }
      } else if (parsedData.type === EventTypes.CONNECT_PRODUCER_TRANSPORT) {
        await handleProducerConsumerConnectTransport(parsedData, peerId);
      } else if (parsedData.type === EventTypes.CONNECT_CONSUMER_TRANSPORT) {
        await handleProducerConsumerConnectTransport(parsedData, peerId);
      } else if (parsedData.type === EventTypes.PRODUCE) {
        await handleProduce(parsedData, ws, peerId);
      } else if (parsedData.type === EventTypes.CONSUME) {
        await handleConsume(parsedData, ws, router, peerId);
      }
    });
    ws.on("error", console.error);
    ws.on("close", () => {
      console.log("Peer disconnected ");
      console.log(`Peer disconnected: ${peerId}`);
      const peer = peers.get(peerId);
      if (peer) {
        peer.producers.forEach((producer) => producer.close());
        peer.consumers.forEach((consumer) => consumer.close());
        peer.transports.sendTransport?.close?.();
        peer.transports.recvTransport?.close?.();
        peers.delete(peerId);
      }
    });
  }
);

const handleCreateWebRtcTransport = async (
  data: any,
  socket: WebSocket,
  router: Router,
  peerId: string
) => {
  const { direction } = data;
  try {
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
    });
    console.log("Transport created");
    console.log(transport, "transport");

    const peer = peers.get(peerId);
    if (direction === "send") {
      peer!.transports.sendTransport = transport;
    } else {
      peer!.transports.recvTransport = transport;
    }
    transport.on("dtlsstatechange", (dtlsState: string) => {
      if (dtlsState === "closed") {
        transport.close();
      }
    });
    transport.on("@close", () => {
      console.log("Transport closed");
    });
    socket.send(
      JSON.stringify({
        type: EventTypes.WEBRTC_TRANSPORT_CREATED,
        direction,
        transportId: transport.id,
        iceCandidates: transport.iceCandidates,
        iceParameters: transport.iceParameters,
        dtlsParameters: transport.dtlsParameters,
      })
    );
    return transport;
  } catch (error) {
    console.log("Error Creating Webrtc Transport");
  }
};
const handleGetRouterRtpCapabilities = (socket: WebSocket, router: Router) => {
  socket.send(
    JSON.stringify({
      type: EventTypes.ROUTER_RTP_CAPABILITIES,
      rtpCapabilities: router.rtpCapabilities,
    })
  );
};
const handleProducerConsumerConnectTransport = async (
  data: any,
  peerId: string
) => {
  const peer = peers.get(peerId);
  const { transportId, dtlsParameters, direction } = data;
  const transport =
    peer?.transports[`${direction}Transport` as keyof Peer["transports"]];
  if (!transport || transport.id !== transportId) {
    console.error(
      `No transport found for direction: ${direction} with ID: ${transportId}`
    );
    return;
  }
  try {
    await transport?.connect({ dtlsParameters });
  } catch (error) {
    console.error("Error connecting producer transport:", error);
  }
};
const handleProduce = async (data: any, socket: WebSocket, peerId: string) => {
  const peer = peers.get(peerId);
  const { kind, rtpParameters } = data;
  const transport = peer?.transports.sendTransport;
  if (!transport) {
    console.error("No transport found");
    return;
  }
  try {
    const producer = await transport?.produce({ kind, rtpParameters });
    peer?.producers.set(producer.id, producer);
    producer.on("transportclose", () => {
      console.log("Producer transport closed");
      producer.close();
    });
    socket.send(
      JSON.stringify({
        type: EventTypes.PRODUCED,
        id: producer.id,
        kind: producer.kind,
        rtpParameters: producer.rtpParameters,
        // paused: producer.paused,
      })
    );
    for (const [otherPeerId, otherPeer] of peers.entries()) {
      if (otherPeerId !== peerId) {
        otherPeer.ws.send(
          JSON.stringify({
            type: EventTypes.NEW_PRODUCER,
            producerId: producer.id,
            kind: producer.kind,
            peerId,
          })
        );
      }
    }
  } catch (error) {
    console.error("Error producing:", error);
  }
};
const handleConsume = async (
  data: any,
  socket: WebSocket,
  router: Router,
  peerId: string
) => {
  const { producerId, rtpCapabilities } = data;
  const peer = peers.get(peerId);
  const producer = getProducerById(producerId);
  if (!producer) {
    console.error("Producer not found");
    return;
  }
  if (!router.canConsume({ producerId, rtpCapabilities })) {
    console.error("Cannot consume this producer with given rtpCapabilities");
    return;
  }
  console.log("ha can consume");
  const consumerTransport = peer?.transports.recvTransport;
  if (!consumerTransport) {
    console.error("No receiving transport found for peer");
    return;
  }
  try {
    const consumer = await consumerTransport?.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });
    peer.consumers.set(consumer.id, consumer);
    consumer?.on("transportclose", () => {
      console.log("Consumer transport closed");
      peer.consumers.delete(consumer.id);
    });
    consumer.on("producerclose", () => {
      console.log("Producer closed");
      socket.send(
        JSON.stringify({
          type: EventTypes.PRODUCER_CLOSED,
          consumerId: consumer.id,
        })
      );
      consumer.close();
      peer.consumers.delete(consumer.id);
    });
    socket.send(
      JSON.stringify({
        type: EventTypes.CONSUMED,
        consumerId: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      })
    );
  } catch (error) {
    console.error(
      "Consume failed:",
      error instanceof Error ? error.stack : error
    );
    socket.send(
      JSON.stringify({
        type: EventTypes.ERROR,
        msg: `Failed to consume: ${(error as Error).message}`,
      })
    );
  }
};
function getProducerById(producerId: string): Producer | undefined {
  for (const peer of peers.values()) {
    if (peer.producers.has(producerId)) {
      return peer.producers.get(producerId);
    }
  }
  return undefined;
}
const notifyNewPeerOfExistingProducers = (
  newPeerId: string,
  newPeerWs: WebSocket
) => {
  for (const [existingPeerId, existingPeer] of peers.entries()) {
    if (existingPeerId !== newPeerId) {
      existingPeer.producers.forEach((producer, producerId) => {
        newPeerWs.send(
          JSON.stringify({
            type: EventTypes.NEW_PRODUCER,
            producerId: producer.id,
            kind: producer.kind,
            peerId: existingPeerId,
          })
        );
      });
    }
  }
};
