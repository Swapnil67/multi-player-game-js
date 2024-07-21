export const SERVER_PORT = 6970;
export const WORLD_WIDTH = 600;
export const WORLD_HEIGHT = 800;
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 500;

export type Direction = "left" | "right" | "up" | "down";
export type Vector2 = { x: number; y: number };
export type Moving = {
  [k in Direction]: Boolean;
};

export function isNumber(arg: any): arg is number {
  return typeof arg === "number";
}

export function isBoolean(arg: any): arg is Boolean {
  return typeof arg === "boolean";
}

export function isDirection(arg: any): arg is Direction {
  return DIRECTION_VECTORS[arg as Direction] != undefined;
}

export const DIRECTION_VECTORS: { [key in Direction]: Vector2 } = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};


export interface Player {
  id: number;
  x: number;
  y: number;
  moving: Moving;
}

export interface Hello {
  kind: "Hello";
  id: number;
}

export function isHello(arg: any): arg is Hello {
  return arg && arg.kind == "Hello" && isNumber(arg.id);
}

export interface PlayerJoined {
  kind: "PlayerJoined";
  id: number;
  x: number;
  y: number;
}

export function isPlayerJoined(arg: any): arg is PlayerJoined {
  return (
    arg &&
    arg.kind == "PlayerJoined" &&
    isNumber(arg.id) &&
    isNumber(arg.x) &&
    isNumber(arg.y)
  );
}

export interface PlayerLeft {
  kind: "PlayerLeft";
  id: number;
}

export function isPlayerLeft(arg: any): arg is PlayerLeft {
  return arg && arg.kind == "PlayerLeft" && isNumber(arg.id);
}

// * Clients sends to server when it starts moving
export interface AmmaMoving {
  kind: "AmmaMoving";
  start: boolean;
  direction: Direction;
}

export function isAmmaMoving(arg: any): arg is AmmaMoving {
  return (
    arg &&
    arg.kind == "AmmaMoving" &&
    isBoolean(arg.start) &&
    isDirection(arg.direction)
  );
}

// * Server sends to other connected clients with x & y values
export interface PlayerMoving {
  kind: "PlayerMoving";
  id: number;
  x: number;
  y: number;
  start: boolean;
  direction: Direction;
}

export function isPlayerMoving(arg: any): arg is PlayerMoving {
  return (
    arg &&
    arg.kind == "PlayerMoving" &&
    isNumber(arg.id) &&
    isNumber(arg.x) &&
    isNumber(arg.y) &&
    isBoolean(arg.start) &&
    isDirection(arg.direction)
  );
}

export function updatePlayer(player: Player, deltaTime: number) {
  let dir: Direction;
  let dx = 0,
    dy = 0;
  for (dir in DIRECTION_VECTORS) {
    if (player.moving[dir]) {
      dx += DIRECTION_VECTORS[dir].x;
      dy += DIRECTION_VECTORS[dir].y;
    }
  }
  player.x += dx * PLAYER_SPEED * deltaTime;
  player.y += dy * PLAYER_SPEED * deltaTime;
}

export type Events = PlayerJoined | PlayerLeft | PlayerMoving;
