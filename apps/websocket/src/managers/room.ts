import {
  AppData,
  AudioLevelObserver,
  Consumer,
  Producer,
  Router,
  RtpCapabilities,
  Transport,
  WebRtcTransport,
} from "mediasoup/types";
import WorkerManager from "./worker-manager";
import { mediaCodecs } from "../utils";
import { createMessage, EventMessage, EventPayloadMap, EventTypes } from "@repo/types";
import { WebSocket } from "ws";

export type Peer = {
  ws: WebSocket;
  transports: {
    sendTransport: Transport;
    recvTransport: Transport;
  };
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};

export class Room {
  public router: Router | undefined;
  private audioLevelObserver: AudioLevelObserver | undefined;
  private peers: Map<string, Peer> = new Map();

  constructor() {
    this.initRouter();
  }

  addPeer(peerId: string, ws: WebSocket): Peer {
    if (this.peers.has(peerId)) {
      throw new Error(`Peer with ID ${peerId} already exists`);
    }
    const peer: Peer = {
      ws,
      transports: {
        sendTransport: null as unknown as Transport,
        recvTransport: null as unknown as Transport,
      },
      producers: new Map(),
      consumers: new Map(),
    };
    this.peers.set(peerId, peer);
    return peer;
  }

  getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  removePeer(peerId: string): void {
    if (!this.peers.has(peerId)) {
      throw new Error(`Peer with ID ${peerId} does not exist`);
    }
    this.peers.delete(peerId);
  }

  getPeers(): Map<string, Peer> {
    return this.peers;
  }

  hasPeer(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  clearPeers(): void {
    this.peers.clear();
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  broadcast(message: any, excludePeerId: string): void {
    for (const [otherPeerId, otherPeer] of this.peers.entries()) {
      if (
        otherPeerId !== excludePeerId &&
        otherPeer.ws.readyState === WebSocket.OPEN
      ) {
        try {
          otherPeer.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Error sending message to peer ${otherPeerId}:`, error);
        }
      }
    }
  }

  async createTransport(
    peerId: string,
    type: "send" | "recv"
  ): Promise<WebRtcTransport<AppData>> {
    if (!this.router) {
      throw new Error("Router is not initialized");
    }
    try {
      const transport = await this.router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1000000,
      });
      const peer = this.peers.get(peerId);
      if (!peer) {
        throw new Error(`Peer with ID ${peerId} does not exist`);
      }
      if (type === "send") {
        peer.transports.sendTransport = transport;
      } else if (type === "recv") {
        peer.transports.recvTransport = transport;
      }
      transport.on("dtlsstatechange", (dtlsState: string) => {
        if (dtlsState === "closed"  && !transport.closed) {
          transport.close();
        }
      });
      transport.on("@close", () => {
        console.log("Transport closed");

      });
      return transport;
    } catch (error) {
      console.error("Error creating transport:", error);
      throw new Error("Failed to create transport");
    }
  }

  createProducer(peerId: string, producer: Producer): void {
    const peer = this.getPeer(peerId);
    if (!peer) {
      throw new Error(`Peer with ID ${peerId} does not exist`);
    }
    if (peer.producers.has(producer.id)) {
      throw new Error(
        `Producer with ID ${producer.id} already exists for peer ${peerId}`
      );
    }
    peer.producers.set(producer.id, producer);
  }

  createConsumer(peerId: string, consumer: Consumer): void {
    const peer = this.getPeer(peerId);
    if (!peer) {
      throw new Error(`Peer with ID ${peerId} does not exist`);
    }
    if (peer.consumers.has(consumer.id)) {
      throw new Error(
        `Consumer with ID ${consumer.id} already exists for peer ${peerId}`
      );
    }
    peer.consumers.set(consumer.id, consumer);
  }

  getRouterRtpCapabilities(): RtpCapabilities {
    if (!this.router) {
      throw new Error("Router is not initialized");
    }
    return this.router.rtpCapabilities;
  }

  private async initRouter(): Promise<void> {
    const worker = WorkerManager.getInstance();
    const workerInstance = worker.getWorker();
    if (!workerInstance) {
      throw new Error("Worker is not initialized");
    }
    this.router = await workerInstance.createRouter({
      mediaCodecs: mediaCodecs,
    });
    this.createAudioLevelObserver();
    console.log("Router initialized with media codecs:", mediaCodecs);
  }

  getRouter(): Router | undefined {
    return this.router;
  }

  closeRouter(): void {
    if (this.router) {
      this.router.close();
      console.log("Router closed");
    } else {
      throw new Error("Router is not initialized");
    }
  }

  async createWebRTCTransport(
    data: { direction: "send" | "recv" },
    socket: WebSocket,
    peerId: string
  ): Promise<void> {
    const direction = data.direction;
    if (!this.router) {
      throw new Error("Router is not initialized");
    }
    let transport: WebRtcTransport<AppData>;
    if (direction === "send") {
      transport = await this.createTransport(peerId, direction);
    } else if (direction === "recv") {
      transport = await this.createTransport(peerId, direction);
      setTimeout(() => {
        this.notifyNewPeerOfExistingProducers(peerId, socket);
      }, 100);
    } else {
      throw new Error(`Invalid transport direction: ${direction}`);
    }
    socket.send(
      JSON.stringify({
        type: EventTypes.WEBRTC_TRANSPORT_CREATED,
        message:{
          direction,
          transportId: transport.id,
          iceCandidates: transport.iceCandidates,
          iceParameters: transport.iceParameters,
          dtlsParameters: transport.dtlsParameters,
          userId: peerId,
        }
      })
    );
  }

  async producerAndConsumerConnectTotransport(
    data: any,
    peerId: string
  ): Promise<void> {
    const peer = this.getPeer(peerId);
    if (!peer) {
      throw new Error(`Peer with ID ${peerId} does not exist`);
    }
    const { transportId, dtlsParameters, direction } = data;
    const transport =
      peer?.transports[`${direction}Transport` as keyof Peer["transports"]];
    if (!transport || transport.id !== transportId) {
      throw new Error(
        `Transport with ID ${transportId} does not exist for peer ${peerId}`
      );
    }
    try {
      await transport.connect({ dtlsParameters });
    } catch (error) {
      console.error("Error connecting transport:", error);
      throw new Error("Failed to connect transport");
    }
  }

  async handleProduce(data: any, socket: WebSocket, peerId: string) {
    const peer = this.getPeer(peerId);
    if (!peer) {
      throw new Error(`Peer with ID ${peerId} does not exist`);
    }
    const { kind, rtpParameters, appData } = data;
    const producerTransport = peer.transports.sendTransport;
    if (!producerTransport) {
      throw new Error(`Send transport for peer ${peerId} does not exist`);
    }
    try {
      const producer = await producerTransport.produce({
        kind,
        rtpParameters,
        appData,
      });
      this.createProducer(peerId, producer);
      if (producer.kind === "audio" && this.audioLevelObserver) {
        console.log("going to add producer to active speaker observer");
        await this.audioLevelObserver.addProducer({ producerId: producer.id });
      }
      producer.on("transportclose", () => {
        console.log("Producer transport closed");
        if (this.audioLevelObserver && !producer.closed) {
          try {
            this.audioLevelObserver.removeProducer({ producerId: producer.id });
          } catch (err) {
            console.warn("Producer already removed from ActiveSpeakerObserver");
          }
        }
        producer.close();
      });
      socket.send(
        JSON.stringify({
          type: EventTypes.PRODUCED,
          message:{
            id: producer.id,
            kind: producer.kind,
            rtpParameters: producer.rtpParameters,
          }
        })
      );
      this.broadcast(
        {
          type: EventTypes.NEW_PRODUCER,
          message: {
            producerId: producer.id,
            kind: producer.kind,
            peerId,
            appData: producer.appData,
          },
        },
        peerId
      );
    } catch (error) {
      console.error("Error producing:", error);
      throw new Error("Failed to produce");
    }
  }

  getProducerById(producerId: string): Producer | undefined {
    for (const peer of this.peers.values()) {
      if (peer.producers.has(producerId)) {
        return peer.producers.get(producerId);
      }
    }
    return undefined;
  }

  canRouterConsume({
    producerId,
    rtpCapabilities,
  }: {
    producerId: string;
    rtpCapabilities: RtpCapabilities;
  }): boolean {
    if (!this.router) {
      throw new Error("Router is not initialized");
    }
    return this.router.canConsume({
      producerId,
      rtpCapabilities,
    });
  }

  async handleConsume(
    data: EventPayloadMap[typeof EventTypes.CONSUME],
    socket: WebSocket,
    peerId: string
  ): Promise<void> {
    const {
      producerId,
      rtpCapabilities,
      peerId: producerPeerId,
      appData,
    } = data;
    const peer = this.getPeer(peerId);
    if (!peer) {
      throw new Error(`Peer with ID ${peerId} does not exist`);
    }
    const producer = this.getProducerById(producerId);
    if (!producer) {
      throw new Error(`Producer with ID ${producerId} does not exist`);
    }
    if (!this.canRouterConsume({ producerId, rtpCapabilities })) {
      throw new Error(
        `Router cannot consume from producer ${producerId} with given RTP capabilities`
      );
    }
    const consumerTransport = peer.transports.recvTransport;
    if (!consumerTransport) {
      throw new Error(`Receive transport for peer ${peerId} does not exist`);
    }
    try {
      const consumer = await consumerTransport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
        appData: appData,
      });
      this.createConsumer(peerId, consumer);
      consumer.on("transportclose", () => {
        console.log(`Consumer transport closed for peer ${peerId}`);
        peer.consumers.delete(consumer.id);
      });
      consumer.on("producerclose", () => {
        console.log(`Producer closed for consumer ${consumer.id}`);
        peer.consumers.delete(consumer.id);
        socket.send(
          JSON.stringify({
            type: EventTypes.PRODUCER_CLOSED,
            message:{
              producerId: consumer.producerId,
            }
          })
        );
        consumer.close();
        peer.consumers.delete(consumer.id);
      });
      socket.send(
        JSON.stringify(createMessage(EventTypes.CONSUMED,{
            consumerId: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            appData: consumer.appData,
            producerPeerId: producerPeerId,
          })
      ))
    } catch (error) {
      console.error("Error consuming:", error);
      socket.send(
        JSON.stringify({
          type: EventTypes.ERROR,
          message:{
            msg: `Failed to consume: ${(error as Error).message}`,
          }
        })
      );
      throw new Error("Failed to consume");
    }
  }

  notifyNewPeerOfExistingProducers(
    newPeerId: string,
    newPeerWs: WebSocket
  ): void {
    for (const [existingPeerId, existingPeer] of this.peers.entries()) {
      if (existingPeerId !== newPeerId) {
        existingPeer.producers.forEach((producer, producerId) => {
          newPeerWs.send(
            JSON.stringify({
              type: EventTypes.NEW_PRODUCER,
              message:{
                producerId: producer.id,
                kind: producer.kind,
                peerId: existingPeerId,
                appData: producer.appData,
              }
            })
          );
        });
      }
    }
  }

  async handleProducerClosed(
    data:EventPayloadMap[typeof EventTypes.PRODUCER_CLOSED],
    socket: WebSocket,
    peerId: string
  ): Promise<void> {
    const { producerId, kind } = data;
    try {
      const peer = this.getPeer(peerId);
      if (!peer) {
        throw new Error(`Peer with ID ${peerId} does not exist`);
      }
      const producer = peer.producers.get(producerId);
      if (!producer) {
        throw new Error(`Producer with ID ${producerId} does not exist`);
      }
      if (producer) {
        producer.close();
        peer.producers.delete(producerId);
        const notificationMsg = {
          type: EventTypes.PRODUCER_CLOSED_NOTIFICATION,
          message: {
            producerId,
            peerId,
            kind,
            appData: producer.appData,
          },
        };
        this.broadcast(notificationMsg, peerId);
      }
    } catch (error) {
      console.error("Error handling producer closed:", error);
      socket.send(
        JSON.stringify({
          type: EventTypes.ERROR,
          message:{
            msg: `Failed to handle producer closed: ${(error as Error).message}`,
          }
        })
      );
      throw new Error("Failed to handle producer closed");
    }
  }

  async createAudioLevelObserver(): Promise<void> {
    if (!this.router) {
      throw new Error("Router is not initialized");
    }
    if (this.audioLevelObserver) {
      console.log("Audio level observer already exists");
      return;
    }
    this.audioLevelObserver = await this.router.createAudioLevelObserver({
      interval: 1000,
      threshold: -60,
      maxEntries: 2,
    });
    this.audioLevelObserver.on("volumes", (volumes) => {
      const speakingUsers = volumes.map(
        ({ producer }) => producer.appData.userId
      );
      console.log(volumes,'volumes')
      if (!speakingUsers) return;
      this.broadcast(
        {
          type: EventTypes.SPEAKING_USERS,
          message: { speakingUsers: speakingUsers },
        },
        ""
      );
    });
    this.audioLevelObserver.on("silence", () => {
      this.broadcast(
        {
          type: EventTypes.SPEAKING_USERS,
          message:{
            speakingUsers: [],
          }
        },
        ""
      );
    });
  }
  async handleResumeConsumer(
    data: EventPayloadMap[typeof EventTypes.RESUME_CONSUMER],
    socket: WebSocket,
    peerId: string
  ): Promise<void> {
    const { consumerId } = data;
    const peer = this.getPeer(peerId);
    if (!peer) {
      throw new Error(`Peer with ID ${peerId} does not exist`);
    }
    const consumer = peer.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`Consumer with ID ${consumerId} does not exist`);
    }
    try {
      await consumer.resume();
      socket.send(
        JSON.stringify({
          type: EventTypes.RESUME_PAUSED_CONSUMER,
          message:{
            consumerId: consumer.id,
          }
        } as EventMessage)
      );
    } catch (error) {
      console.error("Error resuming consumer:", error);
      socket.send(
        JSON.stringify({
          type: EventTypes.ERROR,
          message:{
            msg: `Failed to resume consumer: ${(error as Error).message}`,
          }
        })
      );
    }
  }
  handleLocalUserVideoOff(data:EventPayloadMap[typeof EventTypes.LOCAL_USER_VIDEO_AUDIO_OFF],ws:WebSocket,peerId:string){
    const message = {
      roomId:data.roomId,
      peerId:data.peerId,
      type:data.type
    }
    this.broadcast({
      type:EventTypes.REMOTE_USER_VIDEO_AUDIO_OFF,
      message:message
    },peerId)
  }
}
