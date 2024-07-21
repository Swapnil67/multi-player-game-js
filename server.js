import { WebSocketServer } from "ws";
const SERVER_PORT = 6970;
const wss = new WebSocketServer({
    port: SERVER_PORT,
});
wss.on("connection", (ws) => {
    console.log("Somebody Connected!");
});
console.log("Hello from server");
//# sourceMappingURL=server.js.map