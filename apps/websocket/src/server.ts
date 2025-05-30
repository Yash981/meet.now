import { WebSocket, WebSocketServer } from "ws";
import {
  audioLevelObserver,
  generatePeerId,
  getRouter,
  startRouter,
  startWorker,
} from "./mediasoup-config";
import { EventTypes } from "@repo/types";
import { Consumer, Producer, Router, Transport } from "mediasoup/types";
import { IncomingMessage } from "http";
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
export const peers = new Map<string, Peer>();
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
      } else if (parsedData.type === EventTypes.RESUME_CONSUMER) {
        await handleResumeConsumer(parsedData, ws, peerId);
      } else if (parsedData.type === EventTypes.PRODUCER_CLOSED) {
        await handleProducerClosed(parsedData, ws, peerId);
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
      for (const [otherPeerId, otherPeer] of peers.entries()) {
        if (otherPeerId !== peerId) {
          otherPeer.ws.send(
            JSON.stringify({
              type: EventTypes.PEER_DISCONNECTED,
              peerId,
            })
          );
        }
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
        userId: peerId,
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
  const { kind, rtpParameters, appData } = data;
  const transport = peer?.transports.sendTransport;
  if (!transport) {
    console.error("No transport found");
    return;
  }
  try {
    const producer = await transport?.produce({ kind, rtpParameters, appData });
    peer?.producers.set(producer.id, producer);
    console.log(
      `Producer created: ${producer.id}, kind: ${kind}`,
      audioLevelObserver
    );
    if (producer.kind === "audio" && audioLevelObserver) {
      console.log("going to add producer to active speaker observer");
      await audioLevelObserver.addProducer({ producerId: producer.id });
      // getActiveSpeakerObserver();
    }
    producer.on("transportclose", () => {
      console.log("Producer transport closed");
      if (audioLevelObserver) {
        try {
          audioLevelObserver.removeProducer({ producerId: producer.id });
        } catch (err) {
          console.warn("Producer already removed from ActiveSpeakerObserver");
        }
      }

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
            appData: producer.appData,
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
  const { producerId, rtpCapabilities, peerId: producerPeerId, appData } = data;
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
  const consumerTransport = peer?.transports.recvTransport;
  if (!consumerTransport) {
    console.error("No receiving transport found for peer");
    return;
  }
  try {
    const consumer = await consumerTransport?.consume({
      producerId,
      rtpCapabilities,
      paused: true,
      appData: appData,
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
        producerPeerId: producerPeerId,
        appData: consumer.appData,
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
            appData: producer.appData,
          })
        );
      });
    }
  }
};

const handleResumeConsumer = async (
  data: any,
  socket: WebSocket,
  peerId: string
) => {
  const peer = peers.get(peerId);
  const consumer = peer?.consumers.get(data.consumerId);
  if (consumer) {
    await consumer.resume();
    socket.send(
      JSON.stringify({
        type: EventTypes.RESUME_PAUSED_CONSUMER,
        consumerId: consumer.id,
      })
    );
  } else {
    console.error("Consumer not found for resume");
  }
};
// setInterval(() => {
//   const currentTime = new Date().toISOString();
//   console.log(`Current time: ${currentTime}, Connected peers: ${peers.size}`);
// }, 10000); // Log every 10 seconds

const getPeerStats = () => {
  const stats = Array.from(peers.entries()).map(([peerId, peer]) => ({
    peerId,
    producerCount: peer.producers.size,
    consumerCount: peer.consumers.size,
    hasTransports: {
      send: !!peer.transports.sendTransport,
      recv: !!peer.transports.recvTransport,
    },
  }));
  return stats;
};
// setInterval(() => {
//   const stats = getPeerStats();
//   console.log("Peer Stats:", JSON.stringify(stats, null, 2));
// }, 10000); // Log every 30 seconds

// function monitorAllPeerConsumers() {
//   setInterval(() => {
//     console.log('--- Checking all peer consumers ---');

//     for (const [peerId, peer] of peers.entries()) {
//       console.log(`Peer: ${peerId}`);

//       for (const [consumerId, consumer] of peer.consumers.entries()) {
//         const isReceiving = !consumer.paused && !consumer.producerPaused;

//         console.log(`  Consumer ID: ${consumerId}`);
//         console.log(`    Kind: ${consumer.kind}`);
//         console.log(`    Paused: ${consumer.paused}`);
//         console.log(`    Producer Paused: ${consumer.producerPaused}`);
//         console.log(`    Actively Receiving: ${isReceiving}`);
//       }
//     }

//   }, 5000); // Every 5 seconds
// }
// monitorAllPeerConsumers();

const handleProducerClosed = async (
  data: any,
  socket: WebSocket,
  peerId: string
) => {
  const { producerId, kind } = data;
  try {
    const peer = peers.get(peerId);

    if (!peer) {
      console.error(`Peer ${peerId} not found`);
      return;
    }

    // Find and close the producer
    const producer = peer.producers.get(producerId);
    if (producer) {
      // Close the producer
      producer.close();
      peer.producers.delete(producerId);

      console.log(`Producer ${producerId} (${kind}) closed for peer ${peerId}`);

      // Notify all other peers about the producer closure
      const notificationMessage = {
        type: EventTypes.PRODUCER_CLOSED_NOTIFICATION,
        peerId: peerId,
        producerId: producerId,
        kind: kind,
        appData: producer.appData, //( type: 'screen')
      };

      peers.forEach((otherPeer, otherPeerId) => {
        if (
          otherPeerId !== peerId &&
          otherPeer.ws.readyState === WebSocket.OPEN
        ) {
          otherPeer.ws.send(JSON.stringify(notificationMessage));
        }
      });
    }
  } catch (error) {
    console.error(
      `Error closing producer ${producerId} for peer ${peerId}:`,
      error
    );
    socket.send(
      JSON.stringify({
        type: EventTypes.ERROR,
        msg: `Failed to close producer: ${(error as Error).message}`,
      })
    );
  }
};
// let isObserverInitialized = false;
// export const getActiveSpeakerObserver = () => {
//   if (!activeSpeakerObserver) return;
//   // isObserverInitialized = true;
//   activeSpeakerObserver.on("dominantspeaker", ({ producer }) => {
//     try {
//       if (!producer || !producer.id) {
//         console.error("No producer found for dominant speaker event");
//         return;
//       }
//       const dominantSpeakerId = producer?.appData?.userId as string;
//       if (!dominantSpeakerId) {
//         console.error("No dominant speaker found");
//         return;
//       }
//       console.log(`Dominant speaker changed: ${dominantSpeakerId}`);
//       if (dominantSpeakerId) {
//         console.log(`Dominant speaker changed: ${dominantSpeakerId}`);
//         peers.forEach((peer) => {
//           peer.ws.send(
//             JSON.stringify({
//               type: EventTypes.DOMINANT_SPEAKER,
//               dominantSpeakerId,
//             })
//           );
//         });
//       }
//     } catch (error) {
//       console.log(error);
//     }
//   });
// };
