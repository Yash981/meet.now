import { EventTypes } from "@repo/types";
import { subClient } from "../config/redis";
import { roomManager } from "../managers/room-manager";
export const subscribeToChannel = async () => {
  try {
    console.log("Subscribing to channels...");
    const subscribeCount = await subClient.psubscribe("room:*");
    console.log(`Subscribed to ${subscribeCount} channels`);
    subClient.on("pmessage", (pattern, channel, message) => {
      handleMessages(message, channel);
    });
  } catch (error) {
    console.error("Error subscribing to channel:", error);
    return;
  }
};

export const handleMessages = (message: string, channel: string) => {
  console.log(`Received message on channel ${channel}: ${message}`);
  try {
    const parsedMessage = JSON.parse(message);
    switch (parsedMessage.type) {
      case EventTypes.TYPING:
        const typingPayload = parsedMessage.message;
        const typingRoom = roomManager.getRoom(typingPayload.roomId);
        if (typingRoom) {
          typingRoom.broadcast(parsedMessage, typingPayload.peerId);
        }
        break;

      case EventTypes.RECEIVE_CHAT_MESSAGE:
        const chatMessagePayload = parsedMessage.message;
        const chatRoom = roomManager.getRoom(chatMessagePayload.roomId);
        if (chatRoom) {
          chatRoom.broadcast(parsedMessage, chatMessagePayload.peerId);
        }
        break;
      case EventTypes.LOCAL_USER_MEDIA_TOGGLED:
        const localUserVideoOffPayload = parsedMessage.message;
        const localUserVideoOffRoom = roomManager.getRoom(localUserVideoOffPayload.roomId);
        if (localUserVideoOffRoom) {
          localUserVideoOffRoom.handleLocalUserVideoOff(localUserVideoOffPayload, localUserVideoOffPayload.peerId);
        }
        break;
      default:
        console.warn("Unknown event type:", parsedMessage.type);
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }
};
