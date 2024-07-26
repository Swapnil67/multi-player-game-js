import { WebSocket } from "ws";
import * as common from "./common.mjs";
import {
  type Hello,
  Player,
  AmmaMoving,
  Direction,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  PLAYER_SIZE,
} from "./common.mjs";

// * Create a new ws connection
const url = `ws://localhost:${common.SERVER_PORT}`;
const ws = new WebSocket(url);
const players = new Map<number, Player>();

let me: Player | undefined = undefined;
ws.addEventListener("message", (event) => {
  // console.log("WEBSOCKET MESSAGE ", event);
  if (me === undefined) {
    const message = JSON.parse(event.data.toString()) as Hello;
    if (common.isHello(message)) {
      // * You
      me = {
        id: message.id,
        x: message.x,
        y: message.y,
        style: message.style,
        moving: {
          left: false,
          right: false,
          up: false,
          down: false,
        },
      };
    } else {
      console.log("Received bogus message from server ", message);
      ws.close();
    }
    // console.log("WEBSOCKET MESSAGE ", message, myId);
  } else {
    const message = JSON.parse(event.data.toString());
    if (common.isPlayerJoined(message)) {
      // * new player
      const newPlayer = {
        id: message.id,
        x: message.x,
        y: message.y,
        moving: {
          left: false,
          right: false,
          up: false,
          down: false,
        },
        style: message.style,
      };
      players.set(newPlayer.id, newPlayer);

      common.sendMessage<AmmaMoving>(ws, {
        kind: "AmmaMoving",
        start: true,
        direction: "right",
      });
    } else if (common.isPlayerLeft(message)) {
      players.delete(message.id);
    } else if (common.isPlayerMoving(message)) {
      console.log("Player Moving ", message);
      const player = players.get(message.id);
      if (player === undefined) {
        console.log(
          `Received bogus message from server. We don't know anything about player with the id ${message.id} `,
          message
        );
        ws.close();
        return;
      }
      player.moving[message.direction] = message.start;
      // * Synchronize the moving player positions
      player.x = message.x;
      player.y = message.y;
    } else {
      console.log("Received bogus message from server ", message);
      ws.close();
    }
  }
});
