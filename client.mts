import * as common from "./common.mjs";
import {
  type Hello,
  Player,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  PLAYER_SIZE,
} from "./common.mjs";

const players = new Map<number, Player>();

(async () => {
  const gameCanvas = document.getElementById(
    "game"
  ) as HTMLCanvasElement | null;
  if (!gameCanvas) throw new Error("No element with id `game`");
  gameCanvas.width = WORLD_WIDTH;
  gameCanvas.height = WORLD_HEIGHT;

  const ctx = gameCanvas.getContext("2d");
  if (ctx == null) throw new Error("2d Canvas is not supported");

  const url = "ws://localhost:6970";
  const ws = new WebSocket(url);
  let myId: undefined | number = undefined;
  ws.addEventListener("open", (event) => {
    console.log("WEBSOCKET OPEN ", event);
  });
  ws.addEventListener("close", (event) => {
    console.log("WEBSOCKET CLOSE ", event);
  });
  ws.addEventListener("message", (event) => {
    console.log("WEBSOCKET MESSAGE ", event);
    if (myId == undefined) {
      const message = JSON.parse(event.data) as Hello;
      if (common.isHello(message)) {
        myId = message.id;
      } else {
        console.log("Received bogus message from server ", message);
        ws.close();
      }
      // console.log("WEBSOCKET MESSAGE ", message, myId);
    } else {
      const message = JSON.parse(event.data);
      if (common.isPlayerJoined(message)) {
        const newPlayer = {
          id: message.id,
          x: message.x,
          y: message.y,
        };
        players.set(newPlayer.id, newPlayer);
      } 
      else if(common.isPlayerLeft(message)) {
        players.delete(message.id);
      }
      else {
        console.log("Received bogus message from server ", message);
        ws.close();
      }
    }
  });
  ws.addEventListener("error", (event) => {
    console.log("WEBSOCKET ERROR ", event);
  });

  let previousTimestamp = 0;
  const frame = (timestamp: number) => {
    const deltaTime = (timestamp - previousTimestamp) / 1000;
    previousTimestamp = timestamp;

    // * Draw Players
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.fillStyle = "red";
    players.forEach((player) => {
      ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
    });

    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame((timestamp) => {
    previousTimestamp = timestamp;
    window.requestAnimationFrame(frame);
  });
})();
