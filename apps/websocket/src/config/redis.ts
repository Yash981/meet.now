import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const pubClient = new Redis(redisUrl);
export const subClient = new Redis(redisUrl);

pubClient.on("error", (err) => {
    console.error("Redis Pub Client Error:", err);
    process.exit(1);
});
subClient.on("error", (err) => {
    console.error("Redis Sub Client Error:", err);
    process.exit(1);
});
pubClient.on("connect", () => {
    console.log("Redis Pub Client connected");
});
subClient.on("connect", () => {
    console.log("Redis Sub Client connected");
});
