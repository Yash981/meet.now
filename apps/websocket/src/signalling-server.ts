import { RawData, WebSocket, WebSocketServer } from "ws";
import { roomManager } from "./managers/room-manager";
import { IncomingMessage } from "http";
import { EventMessage, EventPayloadMap, EventTypes } from "@repo/types";
import {  generateRandomId } from "./utils";
import {encodeBinaryMessage,decodeBinaryMessage} from "@repo/utils"
import WorkerManager from "./managers/worker-manager";

const wss = new WebSocketServer({ port: 8080 });

wss.on("listening", () => {
  console.log("WebSocket server is now running on 8080");
});
async function init() {
    const workerMngr = WorkerManager.getInstance();
    await workerMngr.init();
}
init();
wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log("New client connected");
    const peerId = generateRandomId();
    
    ws.on("message", async (message:Buffer | ArrayBuffer) => {
        const decoded = decodeBinaryMessage(message)
        const data = JSON.parse(decoded) as EventMessage;
        
        switch(data.type) {
            case EventTypes.JOIN_ROOM:
                try {
                    const payload = data.message as EventPayloadMap[typeof EventTypes.JOIN_ROOM]
                    const room = roomManager.getRoom(payload.roomId) || roomManager.createRoom(payload.roomId);
                    roomManager.addUserToRoom(payload.roomId, peerId);
                    const roomInstance = roomManager.getRoom(payload.roomId);
                    if (roomInstance) {
                        roomInstance.addPeer(peerId, ws);
                        ws.send(encodeBinaryMessage(JSON.stringify({
                            type: EventTypes.WELCOME,
                            message:{
                                peerId,
                                roomId: payload.roomId
                            }
                        })));
                    }
                } catch (error) {
                    console.error("Error joining room:", error);
                    ws.send(encodeBinaryMessage(JSON.stringify({
                        type: EventTypes.ERROR,
                        message: {msg:`Failed to join room: ${(error as Error).message}`}
                    })));
                }
                break;

            case EventTypes.GET_ROUTER_RTP_CAPABILITIES:
                const getRouterPayload = data.message as EventPayloadMap[typeof EventTypes.GET_ROUTER_RTP_CAPABILITIES]
                const room = roomManager.getRoom(getRouterPayload.roomId);
                if (room) {
                    ws.send(encodeBinaryMessage(JSON.stringify({
                        type: EventTypes.ROUTER_RTP_CAPABILITIES,
                        message: {
                            rtpCapabilities: room.getRouterRtpCapabilities()
                        }
                    })));
                }
                break;

            case EventTypes.CREATE_WEBRTC_TRANSPORT:
                const createWebrtcPayload = data.message as EventPayloadMap[typeof EventTypes.CREATE_WEBRTC_TRANSPORT]
                const transportRoom = roomManager.getRoom(createWebrtcPayload.roomId);
                if (transportRoom) {
                    await transportRoom.createWebRTCTransport(createWebrtcPayload, ws, peerId);
                }
                break;

            case EventTypes.CONNECT_PRODUCER_TRANSPORT:
            case EventTypes.CONNECT_CONSUMER_TRANSPORT:
                const producerConsumerConnectPayload = data.message as EventPayloadMap[typeof EventTypes.CONNECT_CONSUMER_TRANSPORT]
                const connectRoom = roomManager.getRoom(producerConsumerConnectPayload.roomId);
                if (connectRoom) {
                    await connectRoom.producerAndConsumerConnectTotransport(producerConsumerConnectPayload, peerId);
                }
                break;

            case EventTypes.PRODUCE:
                const producePayload = data.message as EventPayloadMap[typeof EventTypes.PRODUCE]
                const produceRoom = roomManager.getRoom(producePayload.roomId);
                if (produceRoom) {
                    await produceRoom.handleProduce(producePayload, ws, peerId);
                }
                break;

            case EventTypes.CONSUME:
                const consumePayload = data.message as EventPayloadMap[typeof EventTypes.CONSUME]
                const consumeRoom = roomManager.getRoom(consumePayload.roomId);
                if (consumeRoom) {
                    await consumeRoom.handleConsume(consumePayload, ws, peerId);
                }
                break;

            case EventTypes.RESUME_CONSUMER:
                const resumeConsumerPayload = data.message as EventPayloadMap[typeof EventTypes.RESUME_CONSUMER]
                const resumeRoom = roomManager.getRoom(resumeConsumerPayload.roomId);
                if (resumeRoom) {
                    await resumeRoom.handleResumeConsumer(resumeConsumerPayload, ws, peerId);
                }
                break;

            case EventTypes.PRODUCER_CLOSED:
                const producerClosedPayload = data.message as EventPayloadMap[typeof EventTypes.PRODUCER_CLOSED]
                const closeRoom = roomManager.getRoom(producerClosedPayload.roomId);
                if (closeRoom) {
                    await closeRoom.handleProducerClosed(producerClosedPayload, ws, peerId);
                }
                break;
            case EventTypes.LOCAL_USER_MEDIA_TOGGLED:
                const localUserVideoOff = data.message as EventPayloadMap[typeof EventTypes.LOCAL_USER_MEDIA_TOGGLED]
                const userRoom = roomManager.getRoom(localUserVideoOff.roomId);
                if(userRoom){
                    userRoom.handleLocalUserVideoOff(localUserVideoOff,ws,peerId)
                }
                break;
            case EventTypes.SEND_CHAT_MESSAGE:
                const chatMessagePayload = data.message as EventPayloadMap[typeof EventTypes.SEND_CHAT_MESSAGE]
                const chatRoom = roomManager.getRoom(chatMessagePayload.roomId);
                if(chatRoom){
                    chatRoom.broadcast({
                        type: EventTypes.RECEIVE_CHAT_MESSAGE,
                        message: {
                            roomId: chatMessagePayload.roomId,
                            peerId: chatMessagePayload.peerId,
                            peerName: chatMessagePayload.peerName,
                            message: chatMessagePayload.message,
                            timestamp: chatMessagePayload.timestamp,
                        }
                    }, peerId);
                }
                break;
            default:
                console.warn("Unknown event type:", data.type);
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
                    message:{
                        peerId
                    }
                }, peerId);
            }
        }
    });
});