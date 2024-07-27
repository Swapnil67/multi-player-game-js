import { WebSocket } from "ws";
import * as common from "./common.mjs";
import type { Hello, Player, AmmaMoving, Direction } from "./common.mjs";

const EPS = 10;
const BOT_FPS = 30;

// * Create a new ws connection
const url = `ws://localhost:${common.SERVER_PORT}`;
const ws = new WebSocket(url);

let me: Player | undefined = undefined;
let goalX = common.WORLD_WIDTH * 0.5;
let goalY = common.WORLD_HEIGHT * 0.5;
let timeoutBeforeTurn: undefined | number = undefined;

function turn() {
  if (me !== undefined) {
    let direction: Direction;
    for (direction in me.moving) {
      if (me.moving[direction]) {
        me.moving[direction] = false;
        common.sendMessage<AmmaMoving>(ws, {
          kind: "AmmaMoving",
          start: false,
          direction,
        });
      }
    }

    timeoutBeforeTurn = undefined;
    do {
      const dx = goalX - me.x;
      const dy = goalY - me.y;
      if (Math.abs(dx) > EPS) {
        if (dx > 0) {
          // * Move to right
          me.moving["right"] = true;
          common.sendMessage<AmmaMoving>(ws, {
            kind: "AmmaMoving",
            start: true,
            direction: "right",
          });
        } else {
          // * Move to left
          me.moving["left"] = true;
          common.sendMessage<AmmaMoving>(ws, {
            kind: "AmmaMoving",
            start: true,
            direction: "left",
          });
        }
        // * Time took to travel
        // * time = distance / speed
        timeoutBeforeTurn = Math.abs(dx) / common.PLAYER_SPEED;
      } else if (Math.abs(dy) > EPS) {
        if (dy > 0) {
          // * Move to down
          common.sendMessage<AmmaMoving>(ws, {
            kind: "AmmaMoving",
            start: true,
            direction: "down",
          });
        } else {
          // * Move to up
          common.sendMessage<AmmaMoving>(ws, {
            kind: "AmmaMoving",
            start: true,
            direction: "up",
          });
        }
        timeoutBeforeTurn = Math.abs(dy) / common.PLAYER_SPEED;
      }
      if (timeoutBeforeTurn === undefined) {
        goalX = Math.random() * common.WORLD_WIDTH;
        goalY = Math.random() * common.WORLD_HEIGHT;
      }
    } while (timeoutBeforeTurn === undefined);
  }
}

ws.addEventListener("message", (event) => {
  if (me === undefined) {
    const message = JSON.parse(event.data.toString());
    console.log("message ", message);

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
      turn();
      console.log("Connected as player ", me.id);
    } else {
      console.log("Received bogus message from server ", message);
      ws.close();
    }
  }
   else {
    const message = JSON.parse(event.data.toString());
    if (common.isPlayerMoving(message)) {
      if (message.id === me.id) {
        me.x = message.x;
        me.y = message.y;
        me.moving[message.direction] = message.start;
      }
    }
  }
});

function tick() {
  const deltaTime = 1 / BOT_FPS;

  // * We are moving somewhere
  if (timeoutBeforeTurn !== undefined) {
    timeoutBeforeTurn -= deltaTime;
    if (timeoutBeforeTurn <= 0) turn();
  }
  if (me !== undefined) {
    common.updatePlayer(me, deltaTime);
  }

  setTimeout(tick, 1000 / BOT_FPS);
}

setTimeout(tick, 1000 / BOT_FPS);
