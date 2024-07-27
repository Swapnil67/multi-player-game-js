import { WebSocket, WebSocketServer } from "ws";
import * as common from "./common.mjs";
import { type Player, Events } from "./common.mjs";

const SERVER_FPS = 30;
const SERVER_LIMIT = 10;

interface PlayerWithSocket extends Player {
  ws: WebSocket;
}

const eventQueue: Array<Events> = [];

function randomStyle() {
  return `hsl(${Math.floor(Math.random() * 360)} 80%, 50%)`;
}

// * Map websocket to player
const players = new Map<number, PlayerWithSocket>();
let idCounter = 0;

const wss = new WebSocketServer({
  port: common.SERVER_PORT,
});

wss.on("connection", (ws) => {
  if(players.size >= SERVER_LIMIT) {
    ws.close();
    return;
  }
  const id = idCounter++;
  // * Make a random position for new player in world
  const x = Math.random() * common.WORLD_WIDTH;
  const y = Math.random() * common.WORLD_WIDTH;
  const style = randomStyle();

  const player = {
    ws,
    id,
    x,
    y,
    moving: {
      left: false,
      right: false,
      up: false,
      down: false,
    },
    style,
  };
  players.set(id, player);
  console.log(`Player ${id} Connected!`);

  const playerJoinedMessage: common.PlayerJoined = {
    kind: "PlayerJoined",
    id,
    x,
    y,
    style,
  };
  eventQueue.push(playerJoinedMessage);

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data.toString());
    // * Server receives AmmaMoving & then Transforms it into player moving
    if (common.isAmmaMoving(message)) {
      // console.log(`Player ${id} is moving `, message);

      const movingMessage: common.PlayerMoving = {
        kind: "PlayerMoving",
        id,
        x: player.x,
        y: player.y,
        start: message.start,
        direction: message.direction,
      };
      eventQueue.push(movingMessage);
    } else {
      console.log(`Received bogus message from client ${id}`, message);
      ws.close();
    }
  });

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
              x: joinedPlayer.x,
              y: joinedPlayer.y,
              style: joinedPlayer.style
            })
          );
          const eventString = JSON.stringify(event);
          players.forEach((otherPlayer) => {
            const otherPlayerPositions: common.PlayerJoined = {
              kind: "PlayerJoined",
              id: otherPlayer.id,
              x: otherPlayer.x,
              y: otherPlayer.y,
              style: otherPlayer.style,
            };
            joinedPlayer.ws.send(JSON.stringify(otherPlayerPositions));
            // * Send notification to other players of new joined player
            if (otherPlayer.id != joinedPlayer.id) {
              otherPlayer.ws.send(eventString);
            }
          });
        }
        break;
      case "PlayerLeft":
        {
          const leftPlayerMessage = JSON.stringify(event);
          players.forEach((player) => {
            player.ws.send(leftPlayerMessage);
          });
        }
        break;
      case "PlayerMoving":
        {
          // console.log("Received event ", event);
          const player = players.get(event.id);
          if (player == undefined) continue;
          player.moving[event.direction] = event.start;
          const eventString = JSON.stringify(event);
          players.forEach((player) => {
            player.ws.send(eventString);
          });
        }
        break;
    }
  }
  eventQueue.length = 0;

  players.forEach((player) => common.updatePlayer(player, 1 / SERVER_FPS));

  setTimeout(tick, 1000 / SERVER_FPS);
}

setTimeout(tick, 1000 / SERVER_FPS);

console.log(`Listening to ws://localhost:${common.SERVER_PORT}`);
