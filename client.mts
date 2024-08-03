import * as common from "./common.mjs";
import { Player, Direction, WORLD_HEIGHT, WORLD_WIDTH } from "./common.mjs";

const DIRECTION_KEYS: { [key: string]: Direction } = {
  ArrowLeft: Direction.Left,
  ArrowRight: Direction.Right,
  ArrowUp: Direction.Up,
  ArrowDown: Direction.Down,
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
  let me: Player | undefined = undefined;
  let ping = 0;
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
            moving: 0,
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
        // * Player joined
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
            moving: common.PlayerJoinedStruct.moving.read(view, 0),
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
          player.moving = moving;
          player.x = x;
          player.y = y;
          // console.log("Player ", player, " moving ", moving);
        } else if (common.PingPongStruct.verifyPong(view)) {
          ping =
            performance.now() - common.PingPongStruct.timestamp.read(view, 0);
          console.log(ping);
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

  const PING_COOLDOWN = 60;
  let previousTimestamp = 0;
  let pingCooldown = PING_COOLDOWN;
  const frame = (timestamp: number) => {
    const deltaTime = (timestamp - previousTimestamp) / 1000;
    previousTimestamp = timestamp;

    ctx.fillStyle = "#202020";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (ws === undefined) {
      const label = "Disconnected";
      const size = ctx.measureText(label);
      ctx.font = "48px bold";
      ctx.fillStyle = "white";
      ctx.fillText(
        label,
        ctx.canvas.width / 2 - size.width / 2,
        ctx.canvas.height / 2
      );
    } else {
      // * Draw Players
      players.forEach((player) => {
        if (me !== undefined && me.id !== player.id) {
          common.updatePlayer(player, deltaTime);
          ctx.fillStyle = `hsl(${player.hue}, 80%, 50%)`;
          ctx.fillRect(
            player.x,
            player.y,
            common.PLAYER_SIZE,
            common.PLAYER_SIZE
          );
        }
      });

      if (me !== undefined) {
        common.updatePlayer(me, deltaTime);
        ctx.fillStyle = `hsl(${me.hue}, 100%, 50%)`;
        ctx.fillRect(me.x, me.y, common.PLAYER_SIZE, common.PLAYER_SIZE);

        ctx.strokeStyle = "white";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.strokeRect(me.x, me.y, common.PLAYER_SIZE, common.PLAYER_SIZE);
        ctx.stroke();
      }

      ctx.font = "18px bold";
      ctx.fillStyle = "white";
      const padding = ctx.canvas.width * 0.05;
      ctx.fillText(`Ping: ${ping.toFixed(2)}ms`, padding, padding);

      pingCooldown -= 1;
      if (pingCooldown <= 0) {
        const view = new DataView(new ArrayBuffer(common.PingPongStruct.size));
        common.PingPongStruct.kind.write(view, common.MessageKind.Ping);
        common.PingPongStruct.timestamp.write(view, performance.now());
        ws.send(view);
        pingCooldown = PING_COOLDOWN;
      }
    }

    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame((timestamp) => {
    previousTimestamp = timestamp;
    window.requestAnimationFrame(frame);
  });

  // * Player started moving in some direction
  window.addEventListener("keydown", (e) => {
    if (ws !== undefined && me !== undefined) {
      if (!e.repeat) {
        const direction = DIRECTION_KEYS[e.code];
        if (direction !== undefined) {
          const view = new DataView(
            new ArrayBuffer(common.AmmaMovingStruct.size)
          );
          common.AmmaMovingStruct.kind.write(
            view,
            common.MessageKind.AmmaMoving
          );
          common.AmmaMovingStruct.start.write(view, common.START_MOVING);
          common.AmmaMovingStruct.direction.write(view, direction);
          ws.send(view);
        }
      }
    }
  });

  // * Player stopped moving
  window.addEventListener("keyup", (e) => {
    if (ws !== undefined && me !== undefined) {
      if (!e.repeat) {
        const direction = DIRECTION_KEYS[e.code];
        if (direction !== undefined) {
          const view = new DataView(
            new ArrayBuffer(common.AmmaMovingStruct.size)
          );
          common.AmmaMovingStruct.kind.write(
            view,
            common.MessageKind.AmmaMoving
          );
          common.AmmaMovingStruct.start.write(view, common.STOP_MOVING);
          common.AmmaMovingStruct.direction.write(view, direction);
          ws.send(view);
        }
      }
    }
  });
})();
