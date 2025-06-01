import { WebSocket, WebSocketServer } from "ws";
import { roomManager } from "./managers/room-manager";
import { IncomingMessage } from "http";
import { EventTypes } from "@repo/types";
import { generateRandomId } from "./utils";

const wss = new WebSocketServer({ port: 8080 });

wss.on("listening", () => {
  console.log("WebSocket server is now running on 8080");
});

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log("New client connected");
    const peerId = generateRandomId();
    
    ws.on("message", async (message: string) => {
        console.log(`Received message: ${message}`);
        const data = JSON.parse(message);
        
        switch(data.type) {
            case EventTypes.JOIN_ROOM:
                try {
                    const room = roomManager.getRoom(data.roomId) || roomManager.createRoom(data.roomId);
                    roomManager.addUserToRoom(data.roomId, peerId);
                    const roomInstance = roomManager.getRoom(data.roomId);
                    if (roomInstance) {
                        roomInstance.addPeer(peerId, ws);
                        ws.send(JSON.stringify({
                            type: EventTypes.WELCOME,
                            peerId,
                            roomId: data.roomId
                        }));
                        roomInstance.notifyNewPeerOfExistingProducers(peerId, ws);
                    }
                } catch (error) {
                    console.error("Error joining room:", error);
                    ws.send(JSON.stringify({
                        type: EventTypes.ERROR,
                        msg: `Failed to join room: ${(error as Error).message}`
                    }));
                }
                break;

            case EventTypes.GET_ROUTER_RTP_CAPABILITIES:
                const room = roomManager.getRoom(data.roomId);
                if (room) {
                    ws.send(JSON.stringify({
                        type: EventTypes.ROUTER_RTP_CAPABILITIES,
                        rtpCapabilities: room.getRouterRtpCapabilities()
                    }));
                }
                break;

            case EventTypes.CREATE_WEBRTC_TRANSPORT:
                const transportRoom = roomManager.getRoom(data.roomId);
                if (transportRoom) {
                    await transportRoom.createWebRTCTransport(data, ws, peerId);
                }
                break;

            case EventTypes.CONNECT_PRODUCER_TRANSPORT:
            case EventTypes.CONNECT_CONSUMER_TRANSPORT:
                const connectRoom = roomManager.getRoom(data.roomId);
                if (connectRoom) {
                    await connectRoom.producerAndConsumerConnectTotransport(data, peerId);
                }
                break;

            case EventTypes.PRODUCE:
                const produceRoom = roomManager.getRoom(data.roomId);
                if (produceRoom) {
                    await produceRoom.handleProduce(data, ws, peerId);
                }
                break;

            case EventTypes.CONSUME:
                const consumeRoom = roomManager.getRoom(data.roomId);
                if (consumeRoom) {
                    await consumeRoom.handleConsume(data, ws, peerId);
                }
                break;

            case EventTypes.RESUME_CONSUMER:
                const resumeRoom = roomManager.getRoom(data.roomId);
                if (resumeRoom) {
                    await resumeRoom.handleResumeConsumer(data, ws, peerId);
                }
                break;

            case EventTypes.PRODUCER_CLOSED:
                const closeRoom = roomManager.getRoom(data.roomId);
                if (closeRoom) {
                    await closeRoom.handleProducerClosed(data, ws, peerId);
                }
                break;
        }
    });
    
    ws.on("close", () => {
        console.log("Client disconnected");
        for (const [roomId, room] of roomManager.getAllRooms()) {
            if (room.hasPeer(peerId)) {
                room.removePeer(peerId);
                roomManager.removeUserFromRoom(roomId, peerId);
                
                room.broadcast({
                    type: EventTypes.PEER_DISCONNECTED,
                    peerId
                }, peerId);
            }
        }
    });
});