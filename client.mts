import * as common from "./common.mjs";
import {
  type Hello,
  Player,
  Direction,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  PLAYER_SIZE,
} from "./common.mjs";

const DIRECTION_KEYS: { [key: string]: Direction } = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const host = window.location.hostname;
const url = `ws://${host}:6970`;

(async () => {
  const gameCanvas = document.getElementById(
    "game"
  ) as HTMLCanvasElement | null;
  if (!gameCanvas) throw new Error("No element with id `game`");
  gameCanvas.width = WORLD_WIDTH;
  gameCanvas.height = WORLD_HEIGHT;

  const ctx = gameCanvas.getContext("2d");
  if (ctx == null) throw new Error("2d Canvas is not supported");

  let ws: WebSocket | undefined = new WebSocket(url);
  let myId: undefined | number = undefined;
  let me: Player | undefined = undefined;
  const players = new Map<number, Player>();
  ws.binaryType = "arraybuffer";
  ws.addEventListener("close", (event) => {
    console.log("WEBSOCKET CLOSE ", event);
    ws = undefined;
  });

  ws.addEventListener("open", (event) => {
    console.log("WEBSOCKET OPEN ", event);
  });

  ws.addEventListener("message", (event) => {
    // console.log("WEBSOCKET MESSAGE ", event);
    // * Hello Greeting Message
    if (me === undefined) {
      if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if (
          common.HelloStruct.size === view.byteLength &&
          common.HelloStruct.kind.read(view, 0) === common.MessageKind.Hello
        ) {
          me = {
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
          players.set(me.id, me);
        } else {
          console.error(
            "Received bogus message from server. Incorrect `Hello` message ",
            view
          );
          ws?.close();
        }
      } else {
        console.error(
          "Received bogus message from server. Expected binary data ",
          event
        );
        ws?.close();
      }
    } else {
      if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if (
          common.PlayerJoinedStruct.size === view.byteLength &&
          common.PlayerJoinedStruct.kind.read(view, 0) ===
            common.MessageKind.PlayerJoined
        ) {
          const newPlayer = {
            id: common.PlayerJoinedStruct.id.read(view, 0),
            x: common.PlayerJoinedStruct.x.read(view, 0),
            y: common.PlayerJoinedStruct.y.read(view, 0),
            moving: common.movingFromMask(
              common.PlayerJoinedStruct.moving.read(view, 0)
            ),
            hue: (common.PlayerJoinedStruct.hue.read(view, 0) / 256) * 360,
          };
          players.set(newPlayer.id, newPlayer);
        } else if (
          common.PlayerLeftStruct.size === view.byteLength &&
          common.PlayerLeftStruct.kind.read(view, 0) ===
            common.MessageKind.PlayerLeft
        ) {
          const id = common.PlayerLeftStruct.id.read(view, 0);
          players.delete(id);
        } else if (
          common.PlayerMovingStruct.size === view.byteLength &&
          common.PlayerMovingStruct.kind.read(view, 0) ===
            common.MessageKind.PlayerMoving
        ) {
          const id = common.PlayerMovingStruct.id.read(view, 0);
          const player = players.get(id);
          if (player === undefined) {
            console.log(
              `Received bogus message from server. We don't know anything about player with the id ${id} `
            );
            ws?.close();
            return;
          }
          const x = common.PlayerMovingStruct.x.read(view, 0);
          const y = common.PlayerMovingStruct.y.read(view, 0);
          const moving = common.PlayerMovingStruct.moving.read(view, 0);
          common.setMovingMask(player.moving, moving);
          player.x = x;
          player.y = y;
          // console.log("Player ", player, " moving ", moving);
        } else {
          console.error("Received bogus message from server.", view);
          ws?.close();
        }
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
    players.forEach((player) => {
      common.updatePlayer(player, deltaTime);
      ctx.fillStyle = `hsl(${player.hue}, 80%, 50%)`;
      ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);

      // ctx.strokeStyle = "black";
      // ctx.lineWidth = 4;
      // ctx.beginPath()
      // ctx.strokeRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
      // ctx.stroke();
    });

    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame((timestamp) => {
    previousTimestamp = timestamp;
    window.requestAnimationFrame(frame);
  });

  window.addEventListener("keydown", (e) => {
    if (!e.repeat) {
      const direction = DIRECTION_KEYS[e.code];
      if (direction !== undefined) {
        ws?.send(
          JSON.stringify({
            kind: "AmmaMoving",
            start: true,
            direction,
          })
        );
      }
    }
  });

  // TODO: When the window loses the focus, reset all the controls
  window.addEventListener("keyup", (e) => {
    if (!e.repeat) {
      const direction = DIRECTION_KEYS[e.code];
      if (direction !== undefined) {
        ws?.send(
          JSON.stringify({
            kind: "AmmaMoving",
            start: false,
            direction,
          })
        );
      }
    }
  });
})();
