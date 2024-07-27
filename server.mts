import { WebSocket, WebSocketServer } from "ws";
import * as common from "./common.mjs";
import {
  type Hello,
  Player,
  Events,
  Direction,
  PlayerLeft,
  PlayerMoving,
  PlayerJoined,
} from "./common.mjs";

const SERVER_FPS = 30;
const SERVER_LIMIT = 10;

interface Stats {
  averageTickTime: number;
}

interface PlayerWithSocket extends Player {
  ws: WebSocket;
}

const players = new Map<number, PlayerWithSocket>();
let idCounter = 0;
const eventQueue: Array<Events> = [];
const joinedIds: Set<number> = new Set();
const leftIds: Set<number> = new Set();

function randomStyle() {
  return `hsl(${Math.floor(Math.random() * 360)} 80%, 50%)`;
}


const wss = new WebSocketServer({
  port: common.SERVER_PORT,
});

wss.on("connection", (ws) => {
  if (players.size >= SERVER_LIMIT) {
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
  joinedIds.add(id);
  console.log(`Player ${id} Connected!`);

  const playerJoinedMessage: PlayerJoined = {
    kind: "PlayerJoined",
    id,
    x,
    y,
    style,
  };
  eventQueue.push(playerJoinedMessage);

  ws.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data.toString());
    } catch (e) {
      console.log(`Received bogus message from client ${id}`, message);
      ws.close();
      return; 
    }
    
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
      return;
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
  const beginMs = performance.now();
  joinedIds.clear();
  leftIds.clear();

  // * This makes sure that if somebody joined and left within a single tick they are never handled
  for (let event of eventQueue) {
    switch (event.kind) {
      case "PlayerJoined":
        {
          joinedIds.add(event.id);
        }
        break;
      case "PlayerLeft":
        {
          if (!joinedIds.delete(event.id)) {
            leftIds.add(event.id);
          }
        }
        break;
    }
  }

  // * Greeting all the joined players & notifiying them about other players
  joinedIds.forEach((joinedId) => {
    const joinedPlayer = players.get(joinedId);
    // console.log("joinedPlayer ", joinedPlayer);
    
    if (joinedPlayer !== undefined) {
      // * The greetings
      common.sendMessage<Hello>(joinedPlayer.ws, {
        kind: "Hello",
        id: joinedPlayer.id,
        x: joinedPlayer.x,
        y: joinedPlayer.y,
        style: joinedPlayer.style,
      });
      // * Reconstructing state for other players
      players.forEach((otherPlayer) => {
        if (joinedId !== otherPlayer.id) {
          // * Joined player should already know about there themselves
          common.sendMessage<PlayerJoined>(joinedPlayer.ws, {
            kind: "PlayerJoined",
            id: otherPlayer.id,
            x: otherPlayer.x,
            y: otherPlayer.y,
            style: otherPlayer.style,
          });
          let direction: Direction;
          for (direction in otherPlayer.moving) {
            if (otherPlayer.moving[direction]) {
              common.sendMessage<PlayerMoving>(joinedPlayer.ws, {
                kind: "PlayerMoving",
                id: otherPlayer.id,
                x: otherPlayer.x,
                y: otherPlayer.y,
                start: true,
                direction,
              });
            }
          }
        }
      });
    }
  });

  // * Notifiying about who joined
  joinedIds.forEach((joinedId) => {
    const joinedPlayer = players.get(joinedId);
    if (joinedPlayer !== undefined) {
      players.forEach((otherPlayer) => {
        // console.log("Here ", otherPlayer);
        console.log(joinedId, otherPlayer.id);
        
        // if (joinedId !== otherPlayer.id) {
          // * joined player should already know about themselves
          common.sendMessage<PlayerJoined>(otherPlayer.ws, {
            kind: "PlayerJoined",
            id: joinedPlayer.id,
            x: joinedPlayer.x,
            y: joinedPlayer.y,
            style: joinedPlayer.style,
          });
        // }
      });
    }
  });

  // * Notififying about who left
  leftIds.forEach((leftId) => {
    players.forEach((player) => {
      common.sendMessage<PlayerLeft>(player.ws, {
        kind: "PlayerLeft",
        id: leftId,
      });
    });
  });

  // * Notifiying about the movements
  for (let event of eventQueue) {
    switch (event.kind) {
      case "PlayerMoving": {
        const player = players.get(event.id);
        if (player !== undefined) {
          player.moving[event.direction] = event.start;
          const eventString = JSON.stringify(event);
          players.forEach((player) => player.ws.send(eventString));
        }
      }
    }
  }

  eventQueue.length = 0;

  players.forEach((player) => common.updatePlayer(player, 1 / SERVER_FPS));

  setTimeout(tick, 1000 / SERVER_FPS);
}

setTimeout(tick, 1000 / SERVER_FPS);

console.log(`Listening to ws://localhost:${common.SERVER_PORT}`);
