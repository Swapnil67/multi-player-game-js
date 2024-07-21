import { WebSocket, WebSocketServer } from "ws";
import * as common from "./common.mjs";
import { type Player, Events } from "./common.mjs";

const SERVER_FPS = 30;

interface PlayerWithSocket extends Player {
  ws: WebSocket;
}

const eventQueue: Array<Events> = [];

// * Map websocket to player
const players = new Map<number, PlayerWithSocket>();
let idCounter = 0;

const wss = new WebSocketServer({
  port: common.SERVER_PORT,
});

wss.on("connection", (ws) => {
  const id = idCounter++;
  const x = Math.random() * common.WORLD_WIDTH;
  const y = Math.random() * common.WORLD_WIDTH;
  const player = { ws, id, x, y };
  players.set(id, player);
  console.log(`Player ${id} Connected!`);
  eventQueue.push({ kind: "PlayerJoined", id, x, y });

  ws.on("message", () => {});

  ws.on("close", () => {
    console.log(`Player ${id} disconnected!`);
    players.delete(id);
    eventQueue.push({
      id,
      kind: "PlayerLeft",
    });
  });
});

function tick() {
  // console.log("Send Events");

  for (let event of eventQueue) {
    switch (event.kind) {
      case "PlayerJoined":
        {
          // * Send hello to joined player
          const joinedPlayer = players.get(event.id);
          if (joinedPlayer == undefined) continue;
          joinedPlayer.ws.send(
            JSON.stringify({
              id: joinedPlayer.id,
              kind: "Hello",
            })
          );
          const eventString = JSON.stringify(event);
          players.forEach((otherPlayer) => {
            const otherPlayerPositions = {
              kind: "PlayerJoined",
              id: otherPlayer.id,
              x: otherPlayer.x,
              y: otherPlayer.y,
            };
            joinedPlayer.ws.send(JSON.stringify(otherPlayerPositions));
            // * Send notification to other players of new joined player
            if (otherPlayer.id != joinedPlayer.id) {
              otherPlayer.ws.send(eventString);
            }
          });
        }
        break;
      case "PlayerLeft": {
        const leftPlayerMessage = JSON.stringify(event);
        players.forEach((player) => {
          player.ws.send(leftPlayerMessage);
        });
      }
    }
  }
  eventQueue.length = 0;
  setTimeout(tick, 1000 / SERVER_FPS);
}

setTimeout(tick, 1000 / SERVER_FPS);

console.log(`Listening to ws://localhost:${common.SERVER_PORT}`);
