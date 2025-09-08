export enum EventTypes {
  GET_ROUTER_RTP_CAPABILITIES = "GET_ROUTER_RTP_CAPABILITIES",
  CREATE_WEBRTC_TRANSPORT = "CREATE_WEBRTC_TRANSPORT",
  PRODUCE = "PRODUCE",
  CONSUME = "CONSUME",
  WELCOME = "WELCOME",
  ROUTER_RTP_CAPABILITIES = "ROUTER_RTP_CAPABILITIES",
  WEBRTC_TRANSPORT_CREATED = "WEBRTC_TRANSPORT_CREATED",
  PRODUCED = "PRODUCED",
  CONSUMED = "CONSUMED",
  NEW_PRODUCER = "NEW_PRODUCER",
  ERROR = "ERROR",
  PRODUCER_CLOSED = "PRODUCER_CLOSED",
  RESUME_PAUSED_CONSUMER = "RESUME_PAUSED_CONSUMER",
  CONNECT_CONSUMER_TRANSPORT = "CONNECT_CONSUMER_TRANSPORT",
  CONNECT_PRODUCER_TRANSPORT = "CONNECT_PRODUCER_TRANSPORT",
  RESUME_CONSUMER = "RESUME_CONSUMER",
  PEER_DISCONNECTED = "PEER_DISCONNECTED",
  PRODUCER_CLOSED_NOTIFICATION = "PRODUCER_CLOSED_NOTIFICATION",
  SPEAKING_USERS = "SPEAKING_USERS",
  JOIN_ROOM = "JOIN_ROOM",
  LOCAL_USER_MEDIA_TOGGLED="LOCAL_USER_MEDIA_TOGGLED",
  REMOTE_USER_MEDIA_TOGGLED="REMOTE_USER_MEDIA_TOGGLED",
  SEND_CHAT_MESSAGE = "SEND_CHAT_MESSAGE",
  RECEIVE_CHAT_MESSAGE = "RECEIVE_CHAT_MESSAGE",
}

export interface AppData {
  type: "camera" | "screen" | "microphone";
  userId?: string;
  [key: string]: any;
}
export type KindType = "audio" | "video" | "screen"
export interface EventPayloadMap {
  [EventTypes.GET_ROUTER_RTP_CAPABILITIES]: { roomId: string };
  [EventTypes.CREATE_WEBRTC_TRANSPORT]: {
    direction: "send" | "recv";
    roomId: string;
  };
  [EventTypes.PRODUCE]: {
    rtpParameters: any;
    kind: KindType;
    appData: AppData;
    roomId: string;
  };
  [EventTypes.CONSUME]: {
    producerId: string;
    rtpCapabilities: any;
    peerId: string;
    appData: AppData;
    roomId: string;
    kind:KindType
  };
  [EventTypes.WELCOME]: { peerId: string,roomId:string };
  [EventTypes.ROUTER_RTP_CAPABILITIES]: { rtpCapabilities: any };
  [EventTypes.WEBRTC_TRANSPORT_CREATED]: {
    direction: "send" | "recv";
    iceParameters: any;
    dtlsParameters: any;
    transportId: string;
    iceCandidates: any;
    userId: string;
  };
  [EventTypes.PRODUCED]: { id: string; kind: KindType; rtpParameters: any };
  [EventTypes.CONSUMED]: {
    consumerId: string;
    producerId: string;
    kind?: Omit<KindType,"screen">;
    rtpParameters: any;
    producerPeerId: string;
    appData: AppData;
  };
  [EventTypes.NEW_PRODUCER]: {
    producerId: string;
    kind: KindType;
    peerId: string;
    appData: AppData;
  };
  [EventTypes.ERROR]: { msg: string };
  [EventTypes.PRODUCER_CLOSED]: {
    producerId: string;
    kind: KindType;
    roomId: string;
  };
  [EventTypes.RESUME_PAUSED_CONSUMER]: { consumerId: string };
  [EventTypes.CONNECT_CONSUMER_TRANSPORT]: {
    dtlsParameters: any;
    transportId: any;
    direction: "send" | "recv";
    roomId: string;
  };
  [EventTypes.CONNECT_PRODUCER_TRANSPORT]: {
    dtlsParameters: any;
    transportId: any;
    direction: "send" | "recv";
    roomId: string;
  };
  [EventTypes.RESUME_CONSUMER]: { consumerId: string; roomId: string };
  [EventTypes.PEER_DISCONNECTED]: { peerId: string };
  [EventTypes.PRODUCER_CLOSED_NOTIFICATION]: {
    producerId: string;
    peerId: string;
    kind: KindType;
    appData: AppData;
  };
  [EventTypes.SPEAKING_USERS]: { speakingUsers: string[] };
  [EventTypes.JOIN_ROOM]: { roomId: string };
  [EventTypes.LOCAL_USER_MEDIA_TOGGLED]: {roomId:string,peerId:string,type: Omit<KindType,"screen">,enable:boolean};
  [EventTypes.REMOTE_USER_MEDIA_TOGGLED]:{roomId:string,peerId:string,type: Omit<KindType,"screen">,enable:boolean};
  [EventTypes.SEND_CHAT_MESSAGE]: {roomId:string,peerId:string,peerName:string,message:string,timestamp:string};
  [EventTypes.RECEIVE_CHAT_MESSAGE]: {roomId:string,peerId:string,peerName:string,message:string,timestamp:string};
}

export type EventMessage<T extends EventTypes = EventTypes> = {
    type: T;
    message: EventPayloadMap[T];
};


export function createMessage<T extends EventTypes>(
  type: T,
  message: EventPayloadMap[T]
): EventMessage<T> {
  return { type, message };
}
