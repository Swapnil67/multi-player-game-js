import { WebSocket, WebSocketServer } from "ws";
import * as common from "./common.mjs";
import { Player } from "./common.mjs";

const SERVER_FPS = 30;
const SERVER_LIMIT = 69;
const STATS_AVERAGE_CAPACITY = 30;

interface Stats {
  startedAt: number;
  ticksCount: number;
  tickTimes: Array<number>;
  messagesSent: number;
  messagesReceived: number;
  tickMessagesSent: Array<number>;
  tickMessagesReceived: Array<number>;
  bytesSent: number;
  bytesReceived: number;
  tickBytesSent: Array<number>;
  tickBytesReceived: Array<number>;
  playersJoined: number;
  playersLeft: number;
  bogusMessages: number;
}

const stats: Stats = {
  startedAt: performance.now(),
  ticksCount: 0,
  tickTimes: [],
  messagesSent: 0,
  messagesReceived: 0,
  tickMessagesSent: [],
  tickMessagesReceived: [],
  bytesSent: 0,
  bytesReceived: 0,
  tickBytesSent: [],
  tickBytesReceived: [],
  playersJoined: 0,
  playersLeft: 0,
  bogusMessages: 0,
};

function randomHue() {
  return Math.floor(Math.random() * 360);
}

function average(nums: Array<number>): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pushAverage(nums: Array<number>, x: number) {
  if (nums.push(x) > STATS_AVERAGE_CAPACITY) nums.shift();
}

function printStats() {
  console.log("-------------- Stats --------------- ");
  const ticksCount = stats.ticksCount;
  const avg = average(stats.tickTimes);
  const messagesSent = stats.messagesSent;
  const messagesReceived = stats.messagesReceived;
  const avgMessageSentPerTick = parseFloat(
    average(stats.tickMessagesSent).toFixed(2)
  );
  const avgMessageReceivedPerTick = parseFloat(
    average(stats.tickMessagesReceived).toFixed(2)
  );
  const totalBytesSent = stats.bytesSent;
  const totalBytesReceived = stats.bytesReceived;
  const avgBytesSentPerTick = parseFloat(
    average(stats.tickBytesSent).toFixed(2)
  );
  const avgBytesReceivedPerTick = parseFloat(
    average(stats.tickBytesReceived).toFixed(2)
  );

  console.log("Ticks count", ticksCount);
  console.log("Average time to process tick: ", avg);
  console.log("Total messages sent: ", messagesSent);
  console.log("Total messages received: ", messagesReceived);
  console.log("Average messages sent per tick: ", avgMessageSentPerTick);
  console.log(
    "Average messages received per tick: ",
    avgMessageReceivedPerTick
  );
  console.log("Total bytes sent ", totalBytesSent, " bytes.");
  console.log("Total bytes received ", totalBytesReceived, " bytes.");
  console.log("Average bytes sent per tick ", avgBytesSentPerTick, " bytes.");
  console.log(
    "Average bytes received per tick ",
    avgBytesReceivedPerTick,
    " bytes."
  );
  console.log("Current Players ", players.size);
  console.log("Total Players joined ", stats.playersJoined);
  console.log("Total Players left ", stats.playersLeft);
  console.log("Bogus messages ", stats.bogusMessages);
  console.log("Uptime (secs) ", (performance.now() - stats.startedAt) / 1000);
}

interface PlayerOnServer extends Player {
  ws: WebSocket;
  newMoving: number;
  moved: boolean;
}

const players = new Map<number, PlayerOnServer>();
let idCounter = 0;
let bytesReceivedWithinTick = 0;
let messagesRecievedWithInTick = 0;
// const eventQueue: Array<Events> = [];
const joinedIds: Set<number> = new Set();
const leftIds: Set<number> = new Set();
const pingIds = new Map<number, number>();

const wss = new WebSocketServer({
  port: common.SERVER_PORT,
});

wss.on("connection", (ws) => {
  ws.binaryType = "arraybuffer";
  if (players.size >= SERVER_LIMIT) {
    ws.close();
    return;
  }
  const id = idCounter++;
  // * Make a random position for new player in world
  const x = Math.random() * common.WORLD_WIDTH;
  const y = Math.random() * common.WORLD_WIDTH;
  const hue = randomHue();
  const player = {
    ws,
    id,
    x,
    y,
    hue,
    moving: 0,
    newMoving: 0,
    moved: false,
  };
  players.set(id, player);
  joinedIds.add(id);
  console.log(`Player ${id} Connected!`);
  stats.playersJoined += 1;

  ws.addEventListener("message", (event) => {
    stats.messagesReceived += 1;
    stats.bytesReceived += event.data.toString().length;
    bytesReceivedWithinTick += event.data.toString().length;
    messagesRecievedWithInTick += 1;

    if (event.data instanceof ArrayBuffer) {
      const view = new DataView(event.data);
      if (
        common.AmmaMovingStruct.size === view.byteLength &&
        common.AmmaMovingStruct.kind.read(view, 0) ===
          common.MessageKind.AmmaMoving
      ) {
        // * Server receives AmmaMoving & then Transforms it into player moving
        const direction = common.AmmaMovingStruct.direction.read(view, 0);
        const start = common.AmmaMovingStruct.start.read(view, 0);
        if (start) {
          player.newMoving = player.newMoving | (1 << direction);
        } else {
          player.newMoving = player.newMoving & ~(1 << direction);
        }
      } else if (common.PingPongStruct.verifyPing(view)) {
        pingIds.set(id, common.PingPongStruct.timestamp.read(view, 0));
      } else {
        stats.bogusMessages += 1;
        console.log(`Received bogus message from client ${id}`, view);
        ws.close();
        return;
      }
    } else {
      stats.bogusMessages += 1;
      console.error(
        "Received bogus message from client. Expected binary data ",
        event
      );
      ws.close();
      return;
    }
  });

  ws.on("close", () => {
    console.log(`Player ${id} disconnected!`);
    players.delete(id);
    stats.playersLeft += 1;
    // * This is collapsing of events within single tick
    // * If player joined & left within single tick then no point to notifiy
    if (!joinedIds.delete(id)) {
      leftIds.add(id);
    }
  });
});

function tick() {
  const beginTickTime = performance.now();
  let messageSentCounter = 0;
  let bytesSentCounter = 0;

  // * Greeting all the joined players & notifiying them about other players
  joinedIds.forEach((joinedId) => {
    const joinedPlayer = players.get(joinedId);
    // console.log("joinedPlayer ", joinedPlayer);
    if (joinedPlayer !== undefined) {
      // * The greetings
      const view = new DataView(new ArrayBuffer(common.HelloStruct.size));
      common.HelloStruct.kind.write(view, common.MessageKind.Hello);
      common.HelloStruct.id.write(view, joinedPlayer.id);
      common.HelloStruct.x.write(view, joinedPlayer.x);
      common.HelloStruct.y.write(view, joinedPlayer.y);
      common.HelloStruct.hue.write(
        view,
        Math.floor((joinedPlayer.hue / 360) * 256)
      );
      joinedPlayer.ws.send(view);
      bytesSentCounter += view.byteLength;
      messageSentCounter += 1;

      // * Reconstructing state for other players
      players.forEach((otherPlayer) => {
        // * Joined player should already know about there themselves
        if (joinedId !== otherPlayer.id) {
          const view = new DataView(
            new ArrayBuffer(common.PlayerJoinedStruct.size)
          );
          common.PlayerJoinedStruct.kind.write(
            view,
            common.MessageKind.PlayerJoined
          );
          common.PlayerJoinedStruct.id.write(view, otherPlayer.id);
          common.PlayerJoinedStruct.x.write(view, otherPlayer.x);
          common.PlayerJoinedStruct.y.write(view, otherPlayer.y);
          common.PlayerJoinedStruct.hue.write(
            view,
            Math.floor((otherPlayer.hue / 360) * 256)
          );
          common.PlayerJoinedStruct.moving.write(view, otherPlayer.moving);
          joinedPlayer.ws.send(view);
          bytesSentCounter += view.byteLength;
          messageSentCounter += 1;
        }
      });
    }
  });

  // * Notifiying about who joined
  joinedIds.forEach((joinedId) => {
    const joinedPlayer = players.get(joinedId);
    if (joinedPlayer !== undefined) {
      const view = new DataView(
        new ArrayBuffer(common.PlayerJoinedStruct.size)
      );
      common.PlayerJoinedStruct.kind.write(
        view,
        common.MessageKind.PlayerJoined
      );
      common.PlayerJoinedStruct.id.write(view, joinedPlayer.id);
      common.PlayerJoinedStruct.x.write(view, joinedPlayer.x);
      common.PlayerJoinedStruct.y.write(view, joinedPlayer.y);
      common.PlayerJoinedStruct.hue.write(
        view,
        Math.floor((joinedPlayer.hue / 360) * 256)
      );
      common.PlayerJoinedStruct.moving.write(view, joinedPlayer.moving);
      players.forEach((otherPlayer) => {
        // * joined player should already know about themselves
        if (joinedId !== otherPlayer.id) {
          otherPlayer.ws.send(view);
          bytesSentCounter += view.byteLength;
          messageSentCounter += 1;
        }
      });
    }
  });

  // * Notififying about who left
  leftIds.forEach((leftId) => {
    const view = new DataView(new ArrayBuffer(common.PlayerLeftStruct.size));
    common.PlayerLeftStruct.kind.write(view, common.MessageKind.PlayerLeft);
    common.PlayerLeftStruct.id.write(view, leftId);
    players.forEach((player) => {
      player.ws.send(view);
      bytesSentCounter += view.byteLength;
      messageSentCounter += 1;
    });
  });

  // * Notifiying about the movements
  players.forEach((player) => {
    if (player.newMoving !== player.moving) {
      player.moving = player.newMoving;
      const view = new DataView(
        new ArrayBuffer(common.PlayerMovingStruct.size)
      );
      common.PlayerMovingStruct.kind.write(
        view,
        common.MessageKind.PlayerMoving
      );
      common.PlayerMovingStruct.id.write(view, player.id);
      common.PlayerMovingStruct.x.write(view, player.x);
      common.PlayerMovingStruct.y.write(view, player.y);
      common.PlayerMovingStruct.moving.write(view, player.moving);

      // * Notify everyone who moved
      players.forEach((otherPlayer) => {
        otherPlayer.ws.send(view);
        bytesSentCounter += view.byteLength;
        messageSentCounter += 1;
      });

      player.moved = false;
    }
  });

  // * Simulating the world for one server tick
  players.forEach((player) => common.updatePlayer(player, 1 / SERVER_FPS));

  // * Sending out pings
  pingIds.forEach((timestamp, id) => {
    const player = players.get(id);
    if (player !== undefined) {
      // * This may happen a player may send a ping and leave.
      const view = new DataView(new ArrayBuffer(common.PingPongStruct.size));
      common.PingPongStruct.kind.write(view, common.MessageKind.Pong);
      common.PingPongStruct.timestamp.write(view, timestamp);
      player.ws.send(view);
      bytesSentCounter += view.byteLength;
      messageSentCounter += 1;
    }
  });

  const tickTime = (performance.now() - beginTickTime) / 1000;
  stats.ticksCount += 1;
  pushAverage(stats.tickTimes, tickTime);
  stats.messagesSent += messageSentCounter;
  pushAverage(stats.tickMessagesSent, messageSentCounter);
  pushAverage(stats.tickMessagesReceived, messagesRecievedWithInTick);
  stats.bytesSent += bytesSentCounter;
  pushAverage(stats.tickBytesSent, bytesSentCounter);
  pushAverage(stats.tickBytesReceived, bytesReceivedWithinTick);

  joinedIds.clear();
  leftIds.clear();
  pingIds.clear();
  bytesReceivedWithinTick = 0;
  messagesRecievedWithInTick = 0;

  // if (stats.ticksCount % SERVER_FPS == 0) {
  //   printStats();
  // }

  setTimeout(tick, 1000 / SERVER_FPS);
}

setTimeout(tick, 1000 / SERVER_FPS);

console.log(`Listening to ws://localhost:${common.SERVER_PORT}`);
