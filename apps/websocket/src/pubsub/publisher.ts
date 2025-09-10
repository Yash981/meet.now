import { pubClient } from "../config/redis";

export const publishMessage = async (channel: string, message: Record<string, unknown>) => {
    try {
        await pubClient.publish(channel, JSON.stringify(message));
        console.log(`Message published to channel ${channel}`);
    }
    catch (error) {
        console.error("Error publishing message:", error);
    }
};