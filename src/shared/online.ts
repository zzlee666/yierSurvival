export const ONLINE_PROTOCOL_VERSION = 1;
export const ONLINE_DEFAULT_WS_URL = "ws://127.0.0.1:3000";

export type BearId = "yier" | "bubu";

export interface OnlineInputMessage {
  type: "input";
  protocol: typeof ONLINE_PROTOCOL_VERSION;
  seq: number;
  moveX: number;
  moveY: number;
}

export interface OnlineBearSnapshot {
  id: BearId;
  x: number;
  y: number;
  facing: -1 | 1;
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
}

export interface OnlineWelcomeMessage {
  type: "welcome";
  protocol: typeof ONLINE_PROTOCOL_VERSION;
  clientId: string;
  bearId?: BearId;
  serverTime: number;
}

export interface OnlineStateMessage {
  type: "state";
  protocol: typeof ONLINE_PROTOCOL_VERSION;
  serverTime: number;
  connectedCount: number;
  bears: Record<BearId, OnlineBearSnapshot>;
}

export interface OnlineErrorMessage {
  type: "error";
  protocol: typeof ONLINE_PROTOCOL_VERSION;
  message: string;
}

export type OnlineServerMessage = OnlineWelcomeMessage | OnlineStateMessage | OnlineErrorMessage;
