import { WebSocket } from "ws";
import * as common from "./common.mjs";
import type { Hello, Player, AmmaMoving, Direction } from "./common.mjs";

const EPS = 10;
const BOT_FPS = 30;

// * Create a new ws connection
const url = `ws://localhost:${common.SERVER_PORT}`;

interface Bot {
  ws: WebSocket;
  me: Player | undefined;
  goalX: number;
  goalY: number;
  timeoutBeforeTurn: undefined | number;
}

function createBot(): Bot {
  const bot: Bot = {
    ws: new WebSocket(url),
    me: undefined,
    goalX: common.WORLD_WIDTH * 0.5,
    goalY: common.WORLD_HEIGHT * 0.5,
    timeoutBeforeTurn: undefined,
  };
  bot.ws.binaryType = "arraybuffer";
  bot.ws.addEventListener("message", (event) => {
    if (bot.me === undefined) {
      if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if (
          common.HelloStruct.size === view.byteLength &&
          common.HelloStruct.kind.read(view, 0) === common.MessageKind.Hello
        ) {
          bot.me = {
            id: common.HelloStruct.id.read(view, 0),
            x: common.HelloStruct.x.read(view, 0),
            y: common.HelloStruct.y.read(view, 0),
            moving: {
              left: false,
              right: false,
              up: false,
              down: false,
            },
            hue: (common.HelloStruct.hue.read(view, 0) / 256) * 360,
          };
          turn();
          setTimeout(tick, 1000 / BOT_FPS);
          console.log("Connected as player ", bot.me.id);
        } else {
          console.error(
            "Received bogus message from server. Incorrect `Hello` message ",
            view
          );
          bot.ws.close();
        }
      } else {
        console.error(
          "Received bogus message from server. Expected binary data ",
          event
        );
        bot.ws.close();
      }
    } else {
      if (event.data instanceof ArrayBuffer) {
        // * PlayerJoined Buffer
      } else {
        const message = JSON.parse(event.data.toString());
        if (common.isPlayerMoving(message)) {
          if (message.id === bot.me.id) {
            bot.me.x = message.x;
            bot.me.y = message.y;
            bot.me.moving[message.direction] = message.start;
          }
        }
      }
    }
  });

  function turn() {
    if (bot.me !== undefined) {
      let direction: Direction;
      for (direction in bot.me.moving) {
        if (bot.me.moving[direction]) {
          bot.me.moving[direction] = false;
          common.sendMessage<AmmaMoving>(bot.ws, {
            kind: "AmmaMoving",
            start: false,
            direction,
          });
        }
      }

      bot.timeoutBeforeTurn = undefined;
      do {
        const dx = bot.goalX - bot.me.x;
        const dy = bot.goalY - bot.me.y;
        if (Math.abs(dx) > EPS) {
          if (dx > 0) {
            // * Move to right
            bot.me.moving["right"] = true;
            common.sendMessage<AmmaMoving>(bot.ws, {
              kind: "AmmaMoving",
              start: true,
              direction: "right",
            });
          } else {
            // * Move to left
            bot.me.moving["left"] = true;
            common.sendMessage<AmmaMoving>(bot.ws, {
              kind: "AmmaMoving",
              start: true,
              direction: "left",
            });
          }
          // * Time took to travel
          // * time = distance / speed
          bot.timeoutBeforeTurn = Math.abs(dx) / common.PLAYER_SPEED;
        } else if (Math.abs(dy) > EPS) {
          if (dy > 0) {
            // * Move to down
            common.sendMessage<AmmaMoving>(bot.ws, {
              kind: "AmmaMoving",
              start: true,
              direction: "down",
            });
          } else {
            // * Move to up
            common.sendMessage<AmmaMoving>(bot.ws, {
              kind: "AmmaMoving",
              start: true,
              direction: "up",
            });
          }
          bot.timeoutBeforeTurn = Math.abs(dy) / common.PLAYER_SPEED;
        }
        if (bot.timeoutBeforeTurn === undefined) {
          bot.goalX = Math.random() * common.WORLD_WIDTH;
          bot.goalY = Math.random() * common.WORLD_HEIGHT;
        }
      } while (bot.timeoutBeforeTurn === undefined);
    }
  }

  function tick() {
    const deltaTime = 1 / BOT_FPS;
    // * We are moving somewhere
    if (bot.timeoutBeforeTurn !== undefined) {
      bot.timeoutBeforeTurn -= deltaTime;
      if (bot.timeoutBeforeTurn <= 0) turn();
    }
    if (bot.me !== undefined) {
      common.updatePlayer(bot.me, deltaTime);
    }
    setTimeout(tick, 1000 / BOT_FPS);
  }

  setTimeout(tick, 1000 / BOT_FPS);
  return bot;
}

let bots: Array<Bot> = [];
for (let i = 0; i < 10; ++i) {
  bots.push(createBot());
}
