import { Room } from "./room";

type RoomData = {
    users: Set<string>;
    room: Room;
}

class RoomManager {
    private rooms = new Map<string, RoomData>();
    private static instance: RoomManager;

    constructor() {
        if (!RoomManager.instance) {
            RoomManager.instance = this;
        }
        return RoomManager.instance;
    }

    createRoom(roomId: string): Room {
        if (this.roomExists(roomId)) {
            throw new Error(`Room with ID ${roomId} already exists`);
        }
        const room = new Room();
        this.rooms.set(roomId, { users: new Set(), room });
        return room;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId)?.room;
    }

    addUserToRoom(roomId: string, userId: string): void {
        const roomData = this.rooms.get(roomId);
        if (!roomData) {
            const newRoom = this.createRoom(roomId);
            this.rooms.set(roomId, { users: new Set([userId]), room: newRoom });
        } else {
            roomData.users.add(userId);
            this.rooms.set(roomId, roomData);
        }
    }

    removeUserFromRoom(roomId: string, userId: string): void {
        const roomData = this.rooms.get(roomId);
        if (!roomData) {
            throw new Error(`Room with ID ${roomId} does not exist`);
        }
        roomData.users.delete(userId);
        if (roomData.users.size === 0) {
            this.deleteRoom(roomId);
        }
    }

    deleteRoom(roomId: string): void {
        const roomData = this.rooms.get(roomId);
        if (!roomData) {
            throw new Error(`Room with ID ${roomId} does not exist`);
        }
        this.rooms.delete(roomId);
    }

    getUsersInRoom(roomId: string): Set<string> | undefined {
        return this.rooms.get(roomId)?.users;
    }

    roomExists(roomId: string): boolean {
        return this.rooms.has(roomId);
    }

    getAllRooms(): Map<string, Room> {
        const roomMap = new Map<string, Room>();
        for (const [roomId, roomData] of this.rooms.entries()) {
            roomMap.set(roomId, roomData.room);
        }
        return roomMap;
    }

    static getInstance(): RoomManager {
        if (!RoomManager.instance) {
            RoomManager.instance = new RoomManager();
        }
        return RoomManager.instance;
    }
}

export const roomManager = RoomManager.getInstance();