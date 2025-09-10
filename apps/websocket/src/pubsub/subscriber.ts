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
    if (parsedMessage.type === EventTypes.TYPING) {
      const typingPayload = parsedMessage.message;
      const typingRoom = roomManager.getRoom(typingPayload.roomId);
      if (typingRoom) {
        typingRoom.broadcast(
          {
            type: EventTypes.TYPING,
            message: {
              roomId: typingPayload.roomId,
              peerId: typingPayload.peerId,
            },
          },
          typingPayload.peerId
        );
      }
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }
};
