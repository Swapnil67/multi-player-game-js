import { WebSocket, WebSocketServer } from "ws";

export const SERVER_PORT = 6970;
export const WORLD_WIDTH = 600;
export const WORLD_HEIGHT = 800;
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 500;

const UINT8_SIZE = 1;
const UINT32_SIZE = 4;
const FLOAT32_SIZE = 4;

// export type Direction = "left" | "right" | "up" | "down";
export enum Direction {
  Left = 0,
  Right,
  Up,
  Down,
  Count,
}
export type Vector2 = { x: number; y: number };
export const DIRECTION_VECTORS: Vector2[] = (() => {
  console.assert(
    Direction.Count == 4,
    "The definition of Direction have changed"
  );
  const vectors = Array(Direction.Count);
  vectors[Direction.Left] = { x: -1, y: 0 };
  vectors[Direction.Right] = { x: 1, y: 0 };
  vectors[Direction.Up] = { x: 0, y: -1 };
  vectors[Direction.Down] = { x: 0, y: 1 };
  return vectors;
})();
export type Moving = {
  [k in Direction]: Boolean;
};

export interface Player {
  id: number;
  x: number;
  y: number;
  moving: number;
  hue: number;
}

export enum MessageKind {
  Hello,
  PlayerJoined,
  PlayerLeft,
  AmmaMoving,
  PlayerMoving,
}

interface Field {
  offset: number;
  size: number;
  read(view: DataView, baseOffset: number): number;
  write(view: DataView, baseOffset: number, value: number): void;
}

function allocUint8Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = UINT8_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view, baseOffset) => view.getUint8(baseOffset + offset),
    write: (view, baseOffset, value) =>
      view.setUint8(baseOffset + offset, value),
  };
}

function allocUint32Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = UINT32_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view, baseOffset) => view.getUint32(baseOffset + offset, true),
    write: (view, baseOffset, value) =>
      view.setUint32(baseOffset + offset, value, true),
  };
}

function allocFloat32Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = FLOAT32_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view, baseOffset) => view.getFloat32(baseOffset + offset, true),
    write: (view, baseOffset, value) =>
      view.setFloat32(baseOffset + offset, value, true),
  };
}

// * Hello Message

export interface Hello {
  kind: "Hello";
  id: number;
  x: number;
  y: number;
  hue: number;
}

// * Definition of structure in javascript
// * [kind: Uint8] [id: Uint32] [x: Float32] [y: Float32] [hue: Uint8]
export const HelloStruct = (() => {
  const allocator = { iota: 0 };
  return {
    kind: allocUint8Field(allocator),
    id: allocUint32Field(allocator),
    x: allocFloat32Field(allocator),
    y: allocFloat32Field(allocator),
    hue: allocUint8Field(allocator),
    moving: allocUint8Field(allocator),
    size: allocator.iota,
  };
})();

// * Player Joined Message

export const PlayerJoinedStruct = (() => {
  const allocator = { iota: 0 };
  return {
    kind: allocUint8Field(allocator),
    id: allocUint32Field(allocator),
    x: allocFloat32Field(allocator),
    y: allocFloat32Field(allocator),
    hue: allocUint8Field(allocator),
    moving: allocUint8Field(allocator),
    size: allocator.iota,
  };
})();

// * Player Left Message

export const PlayerLeftStruct = (() => {
  const allocator = { iota: 0 };
  return {
    kind: allocUint8Field(allocator),
    id: allocUint32Field(allocator),
    size: allocator.iota,
  };
})();

// * Amma Moving Message

export const AmmaMovingStruct = (() => {
  const allocator = { iota: 0 };
  const kind = allocUint8Field(allocator);
  const direction = allocUint8Field(allocator);
  const start = allocUint8Field(allocator);
  const size = allocator.iota;
  return {
    kind,
    direction,
    start,
    size,
  };
})();

// * Player Moving

export const PlayerMovingStruct = (() => {
  const allocator = { iota: 0 };
  return {
    kind: allocUint8Field(allocator),
    id: allocUint32Field(allocator),
    x: allocFloat32Field(allocator),
    y: allocFloat32Field(allocator),
    moving: allocUint8Field(allocator),
    size: allocator.iota,
  };
})();

function properMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function updatePlayer(player: Player, deltaTime: number) {
  let dir: Direction;
  let dx = 0,
    dy = 0;
  for (let dir = 0; dir < Direction.Count; dir++) {
    if ((player.moving >> dir) & 1) {
      dx += DIRECTION_VECTORS[dir].x;
      dy += DIRECTION_VECTORS[dir].y;
    }
  }
  const l = dx * dx + dy * dy;
  if (l !== 0) {
    dx /= l;
    dy /= l;
  }
  player.x = properMod(player.x + dx * PLAYER_SPEED * deltaTime, WORLD_WIDTH);
  player.y = properMod(player.y + dy * PLAYER_SPEED * deltaTime, WORLD_HEIGHT);
}

interface Message {
  kind: string;
}

export function sendMessage<T extends Message>(
  socket: WebSocket,
  message: T
): number {
  const text = JSON.stringify(message);
  socket.send(text);
  return text.length;
}
